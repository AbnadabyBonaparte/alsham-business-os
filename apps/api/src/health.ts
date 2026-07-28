import type { Pool } from 'pg';

/**
 * **A SAÚDE DA FILA** — o que separa ligar o correio de ligar às cegas.
 *
 * Sem isto, "o correio está rodando" é fé. Estes números são a diferença entre
 * descobrir que a fila parou hoje e descobrir no mês que vem, quando um
 * cliente perguntar por que a campanha nunca soube da verba.
 */

export interface QueueHealth {
  readonly pending: number;
  readonly delivered: number;
  readonly failed: number;
  /** ⚠️ Qualquer número acima de zero pede olho humano. */
  readonly dead: number;
  /** O mais antigo ainda por entregar. `null` = fila vazia. */
  readonly oldestPendingAt: string | null;
  /**
   * Há quantos minutos o mais antigo está esperando.
   *
   * **É o número que importa.** Um `pending` alto logo depois de um pico é
   * normal; um `pending` **velho** significa que o correio não está rodando —
   * e são coisas diferentes que uma contagem sozinha não distingue.
   */
  readonly oldestPendingAgeMinutes: number | null;
  /** Os eventos mortos, para conferência. Limitado — a lista é para o humano ler. */
  readonly deadSample: readonly {
    eventId: string;
    eventType: string;
    attempts: number;
    lastError: string | null;
  }[];
}

export async function readQueueHealth(pool: Pool): Promise<QueueHealth> {
  const { rows } = await pool.query<{
    status: string;
    n: string;
    mais_antigo: Date | null;
  }>(
    `select status, count(*)::text as n, min(coalesce(next_attempt_at, occurred_at)) as mais_antigo
       from core.event_outbox
      group by status`,
  );

  const por = (s: string) => Number(rows.find((r) => r.status === s)?.n ?? 0);
  const antigo = rows.find((r) => r.status === 'pending')?.mais_antigo ?? null;

  const { rows: mortos } = await pool.query<{
    event_id: string;
    event_type: string;
    attempts: number;
    last_error: string | null;
  }>(
    `select event_id, event_type, attempts, last_error
       from core.event_outbox
      where status = 'dead'
      order by occurred_at desc
      limit 20`,
  );

  return {
    pending: por('pending'),
    delivered: por('delivered'),
    failed: por('failed'),
    dead: por('dead'),
    oldestPendingAt: antigo ? antigo.toISOString() : null,
    oldestPendingAgeMinutes: antigo
      ? Math.floor((Date.now() - antigo.getTime()) / 60_000)
      : null,
    deadSample: mortos.map((m) => ({
      eventId: m.event_id,
      eventType: m.event_type,
      attempts: m.attempts,
      lastError: m.last_error,
    })),
  };
}

/**
 * O veredito, em uma palavra — para quem olha o painel e não quer interpretar
 * seis números.
 *
 * ⚠️ Os limiares (10 minutos, 30 minutos) são **NÃO VERIFICADOS** contra
 * operação real: são ponto de partida para o primeiro dia, escolhidos porque o
 * cron proposto roda a cada minuto. Quem medir, troca.
 */
export function judgeHealth(h: QueueHealth): {
  readonly status: 'ok' | 'atrasado' | 'parado' | 'atencao';
  readonly message: string;
} {
  if (h.dead > 0) {
    return {
      status: 'atencao',
      message: `${h.dead} evento(s) morto(s) — esgotaram as tentativas e continuam gravados. Pede olho humano.`,
    };
  }
  const idade = h.oldestPendingAgeMinutes;
  if (idade === null) return { status: 'ok', message: 'Nada parado na caixa.' };
  if (idade >= 30) {
    return {
      status: 'parado',
      message: `O evento mais antigo espera há ${idade} min. O correio provavelmente não está rodando.`,
    };
  }
  if (idade >= 10) {
    return {
      status: 'atrasado',
      message: `O evento mais antigo espera há ${idade} min — mais que o esperado para um ciclo de 1 min.`,
    };
  }
  return { status: 'ok', message: `${h.pending} na fila, o mais antigo há ${idade} min.` };
}
