import type { Pool, PoolClient } from 'pg';

import type { IsoDateTime, TenantId, Uuid } from '@alsham/core';
import type { OutboxRecord, OutboxStore } from '@alsham/workflow';

/**
 * **A PERSISTÊNCIA REAL DO CORREIO** — a peça que faltava para o Lego ter vida.
 *
 * Até aqui, `OutboxStore` era interface e os testes usavam memória. Isto é a
 * implementação contra `core.event_outbox` e `core.processed_events`.
 *
 * ---
 *
 * ## Por que ela mora em `apps/`, e não em `packages/`
 *
 * A Regra de Ouro (CLAUDE.md §5.3) manda **regra de negócio** para
 * `packages/`. Isto **não é regra de negócio: é I/O.** Não decide nada — não
 * escolhe quem recebe, não calcula backoff, não julga se já processou. Tudo
 * isso é `deliverDue()`, que continua em `packages/workflow` e continua puro.
 *
 * O teste de bolso do canon: *se eu apagar `apps/` inteiro, perco alguma regra
 * de negócio?* **Não.** Perco a ligação com o Postgres — que se reescreve
 * contra outro banco sem tocar numa linha da lógica de entrega.
 *
 * E há um motivo de **segurança** para ser aqui e não no `apps/portal`: quem
 * escreve nestas tabelas roda com `service_role`, a chave que ignora toda a
 * RLS. Ela não pode conviver no mesmo deploy que a interface do cliente, onde
 * um bug em qualquer server component a alcançaria. `apps/api` é o lugar
 * declarado para isto desde a Etapa 0.
 *
 * ⛔ **Nunca instancie isto num app cliente.** `core.event_outbox` e
 * `core.processed_events` não têm GRANT nem policy para `authenticated`: a RLS
 * recusaria de qualquer forma, mas a chave não deve nem chegar perto.
 */

/** A linha crua, como o Postgres a devolve. */
interface OutboxRow {
  event_id: string;
  tenant_id: string;
  event_type: string;
  event_version: number;
  produced_by: string;
  occurred_at: Date;
  correlation_id: string | null;
  causation_id: string | null;
  payload: unknown;
  status: 'pending' | 'delivered' | 'failed' | 'dead';
  attempts: number;
  next_attempt_at: Date | null;
  last_error: string | null;
}

function toRecord(r: OutboxRow): OutboxRecord {
  return {
    envelope: {
      eventId: r.event_id,
      eventType: r.event_type as `${string}.${string}.${string}`,
      eventVersion: r.event_version,
      tenantId: r.tenant_id,
      occurredAt: r.occurred_at.toISOString(),
      producedBy: r.produced_by,
      ...(r.correlation_id ? { correlationId: r.correlation_id } : {}),
      ...(r.causation_id ? { causationId: r.causation_id } : {}),
      payload: r.payload,
    },
    status: r.status,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at ? r.next_attempt_at.toISOString() : null,
    lastError: r.last_error,
  };
}

/**
 * ⭐ **A CONSULTA MAIS IMPORTANTE DESTE ARQUIVO — e a que eu escrevi errado
 * na primeira vez.**
 *
 * `for update skip locked` impede que dois entregadores peguem a mesma linha
 * **enquanto a transação está aberta**. `skip locked`, e não só `for update`,
 * porque o segundo worker deve **pular** e pegar outra, não ficar esperando:
 * fila que serializa workers não é fila.
 *
 * ⚠️ **Mas a trava sozinha não basta, e é aqui que a primeira versão falhou.**
 *
 * A trava morre no `commit`, que acontece microssegundos depois. Se a tomada
 * não mudar nada na linha, o próximo worker — ou o cron disparando antes de a
 * rodada anterior acabar — encontra o evento exatamente como estava e o pega
 * de novo. Eu escrevi `set attempts = o.attempts` (um `update` que não muda
 * nada) achando que a trava resolvia; contra Postgres de verdade, dois
 * `claimDue` simultâneos pegaram **os mesmos 20 eventos**.
 *
 * A correção é o **arrendamento**: a tomada empurra `next_attempt_at` para
 * frente. Quem chegar depois vê um evento que "ainda não venceu" e não o pega.
 * Se a entrega terminar, `markDelivered`/`markFailed` sobrescrevem o prazo; se
 * o processo morrer no meio, o prazo expira sozinho e o evento volta à fila —
 * que é exatamente a recuperação que se quer, sem ninguém destravar nada à
 * mão.
 *
 * A idempotência de `processed_events` seguraria o efeito duplicado no fim,
 * mas o trabalho seria feito duas vezes e a cobrança contaria — e, num handler
 * que faça I/O externo (mandar e-mail, chamar API), o `unique` chega tarde
 * demais: o e-mail já saiu.
 */
const SQL_CLAIM_DUE = `
  with vencidos as (
    select event_id
      from core.event_outbox
     where status in ('pending', 'failed')
       and coalesce(next_attempt_at, occurred_at) <= $1::timestamptz
     order by coalesce(next_attempt_at, occurred_at)
     limit $2
       for update skip locked
  )
  update core.event_outbox o
     set next_attempt_at = $1::timestamptz + make_interval(secs => $3::double precision)
    from vencidos v
   where o.event_id = v.event_id
  returning o.event_id, o.tenant_id, o.event_type, o.event_version, o.produced_by,
            o.occurred_at, o.correlation_id, o.causation_id, o.payload,
            o.status, o.attempts, o.next_attempt_at, o.last_error
`;

/**
 * Quanto tempo a tomada segura o evento antes de ele voltar à fila sozinho.
 *
 * Tem de ser **maior que uma rodada** — senão o evento reaparece enquanto
 * ainda está sendo entregue — e **pequeno o bastante** para que um processo
 * morto não prenda a fila por muito tempo.
 *
 * ⚠️ 5 minutos é ponto de partida, **NÃO VERIFICADO** contra carga real
 * (Lei 7). Quem medir a duração de uma rodada, ajusta.
 */
export const DEFAULT_LEASE_SECONDS = 300;

/**
 * Cria a implementação real.
 *
 * Recebe um `Pool` — não o cria. Quem tem a `connection string` é a
 * composição, e é ela que decide o ciclo de vida da conexão.
 */
export function createPgOutboxStore(
  pool: Pool,
  options: { leaseSeconds?: number } = {},
): OutboxStore {
  const lease = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;

  return {
    async claimDue(now: IsoDateTime, limit: number): Promise<OutboxRecord[]> {
      // Transação própria: o `for update skip locked` só vale enquanto ela
      // estiver aberta, e o `commit` logo em seguida solta as linhas para o
      // próximo ciclo. A trava serve para a JANELA da tomada, não para a
      // entrega inteira — segurar a linha durante um handler lento prenderia
      // a fila.
      const client: PoolClient = await pool.connect();
      try {
        await client.query('begin');
        const { rows } = await client.query<OutboxRow>(SQL_CLAIM_DUE, [now, limit, lease]);
        await client.query('commit');
        return rows.map(toRecord);
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async markDelivered(eventId: Uuid): Promise<void> {
      await pool.query(
        `update core.event_outbox
            set status = 'delivered', last_error = null, next_attempt_at = null
          where event_id = $1`,
        [eventId],
      );
    },

    async markFailed(input: {
      eventId: Uuid;
      attempts: number;
      nextAttemptAt: IsoDateTime;
      lastError: string;
    }): Promise<void> {
      await pool.query(
        `update core.event_outbox
            set status = 'failed', attempts = $2,
                next_attempt_at = $3::timestamptz, last_error = $4
          where event_id = $1`,
        [input.eventId, input.attempts, input.nextAttemptAt, input.lastError],
      );
    },

    async markDead(input: { eventId: Uuid; attempts: number; lastError: string }): Promise<void> {
      // `dead` **não apaga**. A linha fica com o erro, para conferência
      // humana. Perder evento em silêncio é a falha que a caixa de saída
      // existe para impedir; desistir e apagar seria recriá-la.
      await pool.query(
        `update core.event_outbox
            set status = 'dead', attempts = $2, next_attempt_at = null, last_error = $3
          where event_id = $1`,
        [input.eventId, input.attempts, input.lastError],
      );
    },

    async markProcessed(input: {
      eventId: Uuid;
      consumer: string;
      tenantId: TenantId;
    }): Promise<boolean> {
      // ⭐ A idempotência inteira do correio está neste `on conflict`.
      //
      // A PK é composta `(event_id, consumer)`: o mesmo evento deve ser
      // tratado uma vez POR CONSUMIDOR. `rowCount === 0` significa que já
      // havia registro — o correio lê isso e não chama o handler de novo.
      const { rowCount } = await pool.query(
        `insert into core.processed_events (event_id, consumer, tenant_id)
              values ($1, $2, $3)
         on conflict (event_id, consumer) do nothing`,
        [input.eventId, input.consumer, input.tenantId],
      );
      return (rowCount ?? 0) > 0;
    },

    async unmarkProcessed(input: { eventId: Uuid; consumer: string }): Promise<void> {
      // O desfazer que devolve o evento ao ciclo de reentrega quando o handler
      // lança. Ver o comentário em `OutboxStore.unmarkProcessed` — este método
      // existe porque, sem ele, um evento cujo handler nunca teve sucesso era
      // gravado como `delivered`.
      await pool.query(
        'delete from core.processed_events where event_id = $1 and consumer = $2',
        [input.eventId, input.consumer],
      );
    },
  };
}
