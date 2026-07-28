import type { Pool } from 'pg';

import type { AuditRecord } from '@alsham/workflow';
import type { UsageRecorder } from '@alsham/billing';
import type { SpendDecision, SpendProjectionPort } from '@alsham/marketing';

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
