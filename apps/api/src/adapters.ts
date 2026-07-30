import type { Pool } from 'pg';

import type { AuditRecord } from '@alsham/workflow';
import type { UsageRecorder } from '@alsham/billing';
import type { SpendDecision, SpendProjectionPort } from '@alsham/marketing';
import type {
  ExternalPayable,
  ExternalPayablePort,
  ExternalReceivable,
  ExternalReceivablePort,
} from '@alsham/finance-reconciliation';
import type {
  ApplyReconMatchEffect as ArApplyEffect,
  ReconMatchSettlement as ArSettlement,
  ReconMatchSettlementPort as ArSettlementPort,
} from '@alsham/accounts-receivable';
import type {
  ApplyReconMatchEffect as ApApplyEffect,
  ReconMatchSettlement as ApSettlement,
  ReconMatchSettlementPort as ApSettlementPort,
} from '@alsham/accounts-payable';
import type {
  DunTitlePort,
  ExternalTitle as DunExternalTitle,
} from '@alsham/dunning';
import type {
  BudMovement,
  BudMovementPort,
} from '@alsham/budgets';
import type {
  DreEntry,
  DreEntryPort,
} from '@alsham/dre';

/**
 * Os adaptadores reais dos consumidores.
 *
 * Cada um implementa uma **porta** que um pacote declarou e não implementou —
 * porque implementar exigiria banco, e banco é o que os pacotes não têm.
 *
 * ⚠️ Zero decisão aqui. Nenhum destes calcula, julga ou escolhe. Traduzem tipo
 * do domínio em linha de banco e voltam. A regra de bolso: se algum deles
 * ganhar um `if` sobre valor de negócio, migrou para o lugar errado.
 *
 * ⛔ Todos rodam com `service_role`.
 */

/**
 * A trilha.
 *
 * `core.audit_log` é **append-only por trigger**: `update`, `delete` e
 * `truncate` levantam erro (lição paga do TRUNCATE, Etapa 3). Este adaptador
 * só insere — e é a única coisa que ele poderia fazer mesmo que quisesse mais.
 */
export function createAuditWriter(pool: Pool) {
  return async (record: AuditRecord): Promise<void> => {
    // ⚠️ A coluna é `after_state`, não `after`. A primeira versão deste
    // adaptador escreveu `after` — o nome do campo no tipo `AuditRecord`, não
    // o do schema — e o Postgres recusou. O sintoma foi bom: todo evento caiu
    // em `failed` com a mensagem exata, em vez de sumir. É a caixa de saída
    // fazendo o trabalho dela.
    await pool.query(
      `insert into core.audit_log
         (tenant_id, actor_kind, actor_process, action, resource_type,
          resource_id, module_id, occurred_at, after_state)
       values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::jsonb)`,
      [
        record.tenantId,
        record.actorKind,
        record.actorProcess,
        record.action,
        record.resourceType,
        record.resourceId,
        record.moduleId,
        record.occurredAt,
        JSON.stringify(record.after),
      ],
    );
  };
}

/**
 * O livro-caixa de consumo.
 *
 * O `on conflict do nothing` fecha o buraco que o `unique` do schema abriu de
 * propósito: `(tenant_id, metric, source_ref)`. Uma reentrega que chegasse
 * aqui pela segunda vez seria **cobrança a mais** — o pior tipo de bug,
 * porque o cliente descobre antes de nós.
 */
export function createUsageRecorder(pool: Pool): UsageRecorder {
  return {
    async record(input) {
      await pool.query(
        `insert into core.usage_ledger
           (tenant_id, metric, quantity, period, source_module_id, source_ref)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (tenant_id, metric, source_ref)
           where source_ref is not null
           do nothing`,
        [
          input.tenantId,
          input.metric,
          input.quantity,
          input.period,
          input.sourceModuleId,
          input.sourceRef,
        ],
      );
    },
  };
}

/**
 * A projeção de verba do Módulo 2.
 *
 * ⭐ Repare que este adaptador chama **uma função**, e não escreve na tabela.
 * `marketing.record_spend_decision()` é a porta que o módulo abriu, e ela faz
 * as duas coisas na mesma transação: grava o fato e carimba as campanhas.
 *
 * O retorno importa: **0 quando o fato já era conhecido.** É o que torna "o
 * efeito acontece uma vez só" conferível em vez de prometido — e é a razão de
 * este adaptador não inventar um `insert` próprio, que perderia essa resposta.
 */
export function createSpendProjectionPort(pool: Pool): SpendProjectionPort {
  return {
    async recordSpendDecision(decision: SpendDecision): Promise<number> {
      const { rows } = await pool.query<{ afetadas: number }>(
        `select marketing.record_spend_decision(
                  $1::uuid, $2::text, $3::text, $4::text,
                  $5::bigint, $6::char(3), $7::timestamptz) as afetadas`,
        [
          decision.tenantId,
          decision.sourceModuleId,
          decision.externalRef,
          decision.decision,
          decision.amountCents,
          decision.currency,
          decision.decidedAt,
        ],
      );
      return rows[0]?.afetadas ?? 0;
    },
  };
}

/**
 * ⭐ A projeção de título externo — **o lado que fecha o triângulo.**
 *
 * Mesmo formato do adaptador acima, e de propósito: chama **uma função**
 * (`recon.record_external_payable()`), não escreve na tabela. A porta é do
 * módulo; a idempotência por `(tenant_id, external_ref)` é dela; o
 * "não sobrescrevo o que uma pessoa digitou" é dela. Um `insert` próprio aqui
 * perderia as três coisas e ainda por cima duplicaria a regra.
 *
 * ⚠️ **A origem vem por PARÂMETRO, e é a linha mais importante deste arquivo.**
 * `payable.sourceModuleId` foi lido de `envelope.producedBy` lá no módulo. Não
 * há a string `'ap'` nem `'accounts-payable'` neste adaptador, nem na função
 * SQL que ele chama. Se um segundo produtor emitir o mesmo formato amanhã, a
 * projeção grava a origem certa sem uma linha a mais — e com a origem chumbada
 * ele apareceria disfarçado do primeiro, mentindo na trilha sem nunca dar erro.
 */
export function createExternalPayablePort(pool: Pool): ExternalPayablePort {
  return {
    async recordExternalPayable(payable: ExternalPayable) {
      const { rows } = await pool.query<{
        efeito: 'created' | 'updated' | 'unchanged' | 'skipped-imported';
      }>(
        `select recon.record_external_payable(
                  $1::uuid, $2::text, $3::text, $4::date,
                  $5::bigint, $6::char(3), $7::text, $8::bigint,
                  $9::text, $10::text, $11::text) as efeito`,
        [
          payable.tenantId,
          payable.sourceModuleId,
          payable.externalRef,
          payable.dueDate,
          payable.amountCents,
          payable.currency,
          payable.status,
          payable.settledAmountCents,
          payable.supplierName,
          payable.supplierTaxId,
          payable.description,
        ],
      );

      const efeito = rows[0]?.efeito;
      if (efeito === undefined) {
        throw new Error('recon.record_external_payable não devolveu desfecho');
      }
      return efeito;
    },
  };
}

/**
 * Projeção de título a receber — espelho do adaptador de payable.
 * Chama `recon.record_external_receivable()`; origem por parâmetro.
 */
export function createExternalReceivablePort(pool: Pool): ExternalReceivablePort {
  return {
    async recordExternalReceivable(receivable: ExternalReceivable) {
      const { rows } = await pool.query<{
        efeito: 'created' | 'updated' | 'unchanged' | 'skipped-imported';
      }>(
        `select recon.record_external_receivable(
                  $1::uuid, $2::text, $3::text, $4::date,
                  $5::bigint, $6::char(3), $7::text, $8::bigint,
                  $9::text, $10::text, $11::text) as efeito`,
        [
          receivable.tenantId,
          receivable.sourceModuleId,
          receivable.externalRef,
          receivable.dueDate,
          receivable.amountCents,
          receivable.currency,
          receivable.status,
          receivable.receivedAmountCents,
          receivable.counterpartyName,
          receivable.counterpartyTaxId,
          receivable.description,
        ],
      );

      const efeito = rows[0]?.efeito;
      if (efeito === undefined) {
        throw new Error('recon.record_external_receivable não devolveu desfecho');
      }
      return efeito;
    },
  };
}

/**
 * Liquidação AR a partir de `recon.match.decided`.
 * Chama `ar.apply_recon_match()`; origem por parâmetro (envelope).
 */
export function createReconMatchSettlementPort(pool: Pool): ArSettlementPort {
  return {
    async applyReconMatch(settlement: ArSettlement) {
      const { rows } = await pool.query<{ efeito: ArApplyEffect }>(
        `select ar.apply_recon_match(
                  $1::uuid, $2::text, $3::uuid, $4::text,
                  $5::bigint, $6::char(3), $7::text, $8::text) as efeito`,
        [
          settlement.tenantId,
          settlement.sourceModuleId,
          settlement.matchId,
          settlement.externalRef,
          settlement.matchedAmountCents,
          settlement.currency,
          settlement.decision,
          settlement.targetKind,
        ],
      );

      const efeito = rows[0]?.efeito;
      if (efeito === undefined) {
        throw new Error('ar.apply_recon_match não devolveu desfecho');
      }
      return efeito;
    },
  };
}

/**
 * Liquidação AP a partir de `recon.match.decided`.
 * Chama `ap.apply_recon_match()`; origem por parâmetro (envelope).
 */
export function createApReconMatchSettlementPort(pool: Pool): ApSettlementPort {
  return {
    async applyReconMatch(settlement: ApSettlement) {
      const { rows } = await pool.query<{ efeito: ApApplyEffect }>(
        `select ap.apply_recon_match(
                  $1::uuid, $2::text, $3::uuid, $4::text,
                  $5::bigint, $6::char(3), $7::text, $8::text) as efeito`,
        [
          settlement.tenantId,
          settlement.sourceModuleId,
          settlement.matchId,
          settlement.externalRef,
          settlement.matchedAmountCents,
          settlement.currency,
          settlement.decision,
          settlement.targetKind,
        ],
      );

      const efeito = rows[0]?.efeito;
      if (efeito === undefined) {
        throw new Error('ap.apply_recon_match não devolveu desfecho');
      }
      return efeito;
    },
  };
}

/**
 * Projeção da régua a partir dos fatos de títulos a receber.
 * Chama `dun.record_external_receivable()`; origem por parâmetro (envelope).
 * Zero decisão aqui — entrada/saída da régua é a função do banco quem decide.
 */
export function createDunTitleProjectionPort(pool: Pool): DunTitlePort {
  return {
    async recordExternalReceivable(title: DunExternalTitle) {
      const { rows } = await pool.query<{ efeito: 'created' | 'updated' | 'unchanged' }>(
        `select dun.record_external_receivable(
                  $1::uuid, $2::text, $3::text, $4::date, $5::bigint,
                  $6::char(3), $7::text, $8::bigint, $9::text, $10::text, $11::text) as efeito`,
        [
          title.tenantId,
          title.sourceModuleId,
          title.externalRef,
          title.dueDate,
          title.amountCents,
          title.currency,
          title.status,
          title.receivedAmountCents,
          title.payerName,
          title.counterpartyTaxId,
          title.description,
        ],
      );

      const efeito = rows[0]?.efeito;
      if (efeito === undefined) {
        throw new Error('dun.record_external_receivable não devolveu desfecho');
      }
      return efeito;
    },
  };
}

/**
 * Projeção do orçamento a partir dos lançamentos do Fluxo de Caixa.
 * Chama `bud.record_external_movement()`; origem por parâmetro (envelope).
 * Zero decisão aqui — o realizado é VIEW calculada, e quem soma é o banco.
 */
export function createBudMovementPort(pool: Pool): BudMovementPort {
  return {
    async recordExternalMovement(movement: BudMovement) {
      const { rows } = await pool.query<{ efeito: 'projected' | 'unchanged' }>(
        `select bud.record_external_movement(
                  $1::uuid, $2::text, $3::text, $4::text,
                  $5::char(3), $6::date, $7::bigint) as efeito`,
        [
          movement.tenantId,
          movement.sourceModuleId,
          movement.externalRef,
          movement.categoryName,
          movement.currency,
          movement.occurredOn,
          movement.signedAmountCents,
        ],
      );

      const efeito = rows[0]?.efeito;
      if (efeito === undefined) {
        throw new Error('bud.record_external_movement não devolveu desfecho');
      }
      return efeito;
    },
  };
}

/**
 * Projeção da DRE a partir de DOIS livros (cash e cc).
 * Chama `dre.record_external_entry()`; origem por parâmetro (envelope).
 * Zero decisão aqui — os totais são views calculadas, e quem soma é o banco.
 */
export function createDreEntryPort(pool: Pool): DreEntryPort {
  return {
    async recordExternalEntry(entry: DreEntry) {
      const { rows } = await pool.query<{ efeito: 'projected' | 'unchanged' }>(
        `select dre.record_external_entry(
                  $1::uuid, $2::text, $3::text, $4::text, $5::text,
                  $6::char(3), $7::date, $8::bigint) as efeito`,
        [
          entry.tenantId,
          entry.sourceModuleId,
          entry.sourceKind,
          entry.externalRef,
          entry.categoryName,
          entry.currency,
          entry.occurredOn,
          entry.signedAmountCents,
        ],
      );

      const efeito = rows[0]?.efeito;
      if (efeito === undefined) {
        throw new Error('dre.record_external_entry não devolveu desfecho');
      }
      return efeito;
    },
  };
}
