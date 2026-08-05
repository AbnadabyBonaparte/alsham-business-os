import type { Pool } from 'pg';

import { observarRecebiveisVencidos } from '@alsham/engineer';
import type { RecebiveisVencidosSnapshot } from '@alsham/engineer';

/**
 * ⭐ **O OBSERVADOR PROATIVO — a prova de cognição que age sem ser provocada.**
 *
 * Roda AGENDADO (o `pg_cron` do 0117, comentado; ato do dono), sob `service_role`.
 * Para cada tenant que instalou Contas a Receber (Módulo 5), lê os títulos
 * VENCIDOS que já existem no banco, deixa o motor puro de `@alsham/engineer`
 * decidir se há aviso a dar, e grava o resultado em `core.tenant_insights` — o
 * quadro que o Painel do tenant lê.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** a DECISÃO (vira insight? com que frase?)
 * é do motor puro no pacote. Este arquivo é a PELE: lê o número e grava o
 * resultado. Apague `apps/` e a regra ("nunca inventa número; zero vencidos não
 * é aviso") continua viva no pacote.
 *
 * ⛔ Roda com `service_role`, do servidor. As duas portas de escrita
 * (`record_tenant_insight`, `clear_tenant_insight`) são concedidas só a ele.
 */

/** O tipo de aviso que este observador produz. */
export const AR_OVERDUE_KIND = 'ar-overdue';

export interface InsightRunReport {
  /** Quantos tenants foram avaliados (têm o Módulo 5 instalado e ativo). */
  readonly tenantsEvaluated: number;
  /** Quantos avisos foram gravados nesta rodada. */
  readonly insightsWritten: number;
}

interface OverdueRow {
  currency: string;
  overdue_count: string;
  outstanding_cents: string;
  oldest_days: string;
}

/**
 * Uma rodada do observador.
 *
 * ⚠️ **Recomputa-e-substitui, por tenant, numa transação.** Antes de gravar os
 * avisos atuais, LIMPA os do mesmo tipo — assim um problema que foi resolvido
 * (nenhum título vencido agora) SOME do quadro. Um aviso que sobrevive ao fim do
 * problema mente sobre o presente.
 */
export async function runInsightOnce(pool: Pool): Promise<InsightRunReport> {
  // 1. Só os tenants que instalaram o Módulo 5 (ar). Módulo não instalado ⇒ sem
  //    avaliação — a mesma honestidade do Painel (sem cartão, nunca um zero
  //    fabricado).
  const { rows: tenants } = await pool.query<{ tenant_id: string }>(
    `select t.id as tenant_id
       from core.tenants t
      where exists (
        select 1 from core.tenant_modules tm
         where tm.tenant_id = t.id and tm.module_id = 'ar' and tm.status = 'active'
      )
      order by t.id`,
  );

  let written = 0;

  for (const { tenant_id } of tenants) {
    // 2. O BANCO mede os vencidos, por MOEDA (somar moedas seria mentira). O
    //    `outstanding` é o que FALTA receber (amount − received).
    const { rows: grupos } = await pool.query<OverdueRow>(
      `select currency,
              count(*)                                  as overdue_count,
              sum(amount_cents - received_amount_cents) as outstanding_cents,
              (current_date - min(due_date))            as oldest_days
         from ar.receivables
        where tenant_id = $1
          and status in ('open', 'partially_received')
          and due_date < current_date
        group by currency`,
      [tenant_id],
    );

    const client = await pool.connect();
    try {
      await client.query('begin');
      // Limpa antes de gravar: o quadro reflete a leitura mais recente, só ela.
      await client.query('select core.clear_tenant_insight($1, $2)', [tenant_id, AR_OVERDUE_KIND]);

      for (const g of grupos) {
        const snapshot: RecebiveisVencidosSnapshot = {
          overdueCount: Number(g.overdue_count),
          outstandingCents: Number(g.outstanding_cents),
          oldestDays: Number(g.oldest_days),
          currency: g.currency,
        };

        // A DECISÃO é do motor puro. `null` = nada a avisar.
        const insight = observarRecebiveisVencidos(snapshot);
        if (insight === null) continue;

        await client.query(
          `select core.record_tenant_insight($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenant_id,
            insight.kind,
            insight.subjectKey,
            insight.headline,
            insight.detail,
            insight.metricValue,
            insight.amountCents,
            insight.currency,
          ],
        );
        written += 1;
      }

      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  return { tenantsEvaluated: tenants.length, insightsWritten: written };
}
