import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { deliverDue } from '@alsham/workflow';
import type { RetryPolicy, Subscription } from '@alsham/workflow';

import { createPgOutboxStore } from './outbox-store.ts';
import { runCourierOnce } from './composition.ts';
import { judgeHealth, readQueueHealth } from './health.ts';

/**
 * # O CORREIO CONTRA POSTGRES DE VERDADE
 *
 * Até a Etapa 7, todas as garantias do correio foram provadas contra um
 * `OutboxStore` de memória. Este arquivo repete **as mesmas provas** contra a
 * implementação real — e acrescenta a única que memória nenhuma consegue dar:
 * **dois entregadores concorrentes não pegam o mesmo evento.**
 *
 * ⚠️ Exige `DATABASE_URL`. Sem ela, os testes são **pulados**, não fingidos —
 * um teste que "passa" sem banco daria a impressão de cobertura que não
 * existe. No CI a variável está sempre presente, e há guarda para que o job
 * não fique verde por ter pulado tudo.
 */

const URL_BANCO = process.env.DATABASE_URL;
const SEM_BANCO = !URL_BANCO;

const TENANT = '00000000-0000-4000-8000-00000000c0de';
const POLICY: RetryPolicy = { baseDelayMs: 1000, maxDelayMs: 60_000, maxAttempts: 3 };

let pool: Pool;

before(async () => {
  if (SEM_BANCO) return;
  pool = new Pool({ connectionString: URL_BANCO, max: 6 });
  await pool.query(
    `insert into core.tenants (id, slug, name, plan_code)
          values ($1, 'tenant-correio', 'Tenant do teste de correio', 'starter')
     on conflict (id) do nothing`,
    [TENANT],
  );
});

after(async () => {
  if (SEM_BANCO) return;
  await pool.end();
});

beforeEach(async () => {
  if (SEM_BANCO) return;
  // ⚠️ A caixa INTEIRA, não a do tenant do teste — e a distinção custou uma
  // quebra intermitente.
  //
  // O correio é da PLATAFORMA: `deliverDue()` pega tudo que estiver vencido,
  // de qualquer tenant, porque é isso que ele tem de fazer. Limpar só o
  // próprio tenant fazia estes testes passarem num banco recém-criado e
  // falharem num banco onde a suíte SQL já tinha rodado — `delivered` vinha 7
  // em vez de 1, contando os `core.module.*` que o teste do instalador
  // deixou.
  //
  // Teste que afirma "uma rodada entregou N" tem de começar com a fila vazia.
  //
  // `delete` e não `truncate`: `core.audit_log` tem trigger que recusa
  // TRUNCATE (lição paga da Etapa 3), e a trilha é escrita por alguns destes
  // testes.
  await pool.query('delete from core.processed_events');
  await pool.query('delete from core.event_outbox');
  await pool.query('delete from core.usage_ledger where tenant_id = $1', [TENANT]);
});

/**
 * Põe um evento na caixa como um módulo faria. Devolve o id.
 *
 * ⚠️ `quando` move `occurred_at` **e** `next_attempt_at`, de propósito. A
 * saúde da fila mede a idade pelo **vencimento** (`coalesce(next_attempt_at,
 * occurred_at)`), não pela emissão — e está certa: um evento agendado para
 * daqui a uma hora não está atrasado, por mais antigo que seja. A primeira
 * versão deste helper mexia só em `occurred_at` e o teste de saúde
 * reprovou — o teste é que estava errado.
 */
async function enfileirar(over: Partial<{ tipo: string; quando: string; payload: unknown }> = {}) {
  const { rows } = await pool.query<{ event_id: string }>(
    `insert into core.event_outbox
       (tenant_id, event_type, produced_by, payload, status, next_attempt_at, occurred_at)
     values ($1, $2, split_part($2, '.', 1), $3::jsonb, 'pending',
             coalesce($4::timestamptz, now()) - interval '1 second',
             coalesce($4::timestamptz, now()))
     returning event_id`,
    [
      TENANT,
      over.tipo ?? 'recon.approval.decided',
      JSON.stringify(
        over.payload ?? {
          approvalId: `AP-${Math.floor(performance.now() * 1000)}`,
          decision: 'approved',
          amountCents: 1000,
          currency: 'BRL',
        },
      ),
      over.quando ?? null,
    ],
  );
  return (rows[0] as { event_id: string }).event_id;
}

async function estado(eventId: string) {
  const { rows } = await pool.query<{
    status: string;
    attempts: number;
    last_error: string | null;
    next_attempt_at: Date | null;
  }>('select status, attempts, last_error, next_attempt_at from core.event_outbox where event_id = $1', [
    eventId,
  ]);
  return rows[0];
}

const inscricao = (consumer: string, onCall: () => void, falhar = false): Subscription => ({
  consumer,
  eventType: '*',
  handle: async () => {
    onCall();
    if (falhar) throw new Error('handler quebrou de propósito');
  },
});

describe('o OutboxStore real cumpre o mesmo contrato do mock', { skip: SEM_BANCO }, () => {
  test('claimDue pega o vencido e deliverDue o entrega', async () => {
    const id = await enfileirar();
    let chamadas = 0;

    const r = await deliverDue({
      store: createPgOutboxStore(pool),
      subscriptions: [inscricao('teste-a', () => chamadas++)],
      policy: POLICY,
      now: () => new Date(),
    });

    assert.equal(r.delivered, 1);
    assert.equal(chamadas, 1);
    assert.equal((await estado(id))?.status, 'delivered');
  });

  test('⭐ idempotência: a reentrega NÃO chama o handler de novo', async () => {
    const id = await enfileirar();
    let chamadas = 0;
    const subs = [inscricao('teste-idem', () => chamadas++)];
    const store = createPgOutboxStore(pool);

    await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => new Date() });
    assert.equal(chamadas, 1);

    // Força a reentrega do MESMO evento — o que um replay ou uma restauração
    // fariam. `processed_events` é que segura.
    await pool.query(
      `update core.event_outbox set status = 'pending', next_attempt_at = now() - interval '1 s'
        where event_id = $1`,
      [id],
    );

    const segunda = await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => new Date() });
    assert.equal(chamadas, 1, 'o handler foi chamado uma segunda vez');
    assert.equal(segunda.outcomes[0]?.result, 'already-processed');
  });

  test('a idempotência é POR CONSUMIDOR — o segundo consumidor recebe', async () => {
    await enfileirar();
    let a = 0;
    let b = 0;

    const r = await deliverDue({
      store: createPgOutboxStore(pool),
      subscriptions: [inscricao('consumidor-a', () => a++), inscricao('consumidor-b', () => b++)],
      policy: POLICY,
      now: () => new Date(),
    });

    assert.equal(a, 1);
    assert.equal(b, 1, 'chave só em event_id faria o segundo consumidor perder o fato');
    assert.equal(r.delivered, 1);
  });

  test('backoff: falhar reagenda no futuro, com o erro gravado', async () => {
    const id = await enfileirar();
    // ⚠️ Relógio REAL, não data fixa — e a lição custou uma quebra.
    //
    // A primeira versão usava `new Date('2026-07-28T10:00:00Z')`, que estava
    // no futuro quando o teste foi escrito. Cinco horas depois virou passado,
    // `claimDue` deixou de enxergar o evento (que é enfileirado com `now()` do
    // banco) e o teste quebrou sozinho, sem ninguém tocar em código.
    //
    // Data fixa num teste que compara com `now()` do banco é bomba-relógio:
    // passa no dia em que foi escrita e falha num dia qualquer depois.
    const agora = new Date();

    const r = await deliverDue({
      store: createPgOutboxStore(pool),
      subscriptions: [inscricao('teste-falha', () => {}, true)],
      policy: POLICY,
      now: () => agora,
    });

    assert.equal(r.retried, 1);
    const e = await estado(id);
    assert.equal(e?.status, 'failed');
    assert.equal(e?.attempts, 1);
    assert.match(e?.last_error ?? '', /quebrou de propósito/);
    assert.ok(e?.next_attempt_at && e.next_attempt_at > agora, 'a próxima tentativa ficou no futuro');
  });

  test('dead depois de esgotar as tentativas — e a linha NÃO some', async () => {
    const id = await enfileirar();
    const store = createPgOutboxStore(pool);
    const subs = [inscricao('teste-dead', () => {}, true)];

    for (let i = 0; i < POLICY.maxAttempts; i++) {
      await pool.query(
        `update core.event_outbox set next_attempt_at = now() - interval '1 s' where event_id = $1`,
        [id],
      );
      await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => new Date() });
    }

    const e = await estado(id);
    assert.equal(e?.status, 'dead');
    assert.equal(e?.attempts, POLICY.maxAttempts);
    assert.match(e?.last_error ?? '', /quebrou de propósito/, 'o erro tem de continuar gravado');

    const { rows } = await pool.query('select 1 from core.event_outbox where event_id = $1', [id]);
    assert.equal(rows.length, 1, 'desistir de entregar não é desistir de guardar');
  });

  test('evento com next_attempt_at no futuro não é pego', async () => {
    const id = await enfileirar();
    await pool.query(
      `update core.event_outbox set next_attempt_at = now() + interval '1 hour' where event_id = $1`,
      [id],
    );
    const pegos = await createPgOutboxStore(pool).claimDue(new Date().toISOString(), 50);
    assert.equal(pegos.find((p) => p.envelope.eventId === id), undefined);
  });

  test('evento sem consumidor é marcado entregue, e não fica batendo', async () => {
    const id = await enfileirar({ tipo: 'recon.statement.discarded' });
    const r = await deliverDue({
      store: createPgOutboxStore(pool),
      subscriptions: [{ consumer: 'so-escuta-outro', eventType: 'marketing.campaign.published', handle: async () => {} }],
      policy: POLICY,
      now: () => new Date(),
    });
    assert.equal(r.outcomes[0]?.result, 'no-subscriber');
    assert.equal((await estado(id))?.status, 'delivered');
  });

  test('o envelope volta do banco inteiro — payload, versão e origem', async () => {
    await enfileirar({ tipo: 'marketing.campaign.published', payload: { campaignId: 'c1', name: 'X' } });
    const [rec] = await createPgOutboxStore(pool).claimDue(new Date().toISOString(), 50);
    assert.equal(rec?.envelope.producedBy, 'marketing');
    assert.equal(rec?.envelope.eventVersion, 1);
    assert.deepEqual(rec?.envelope.payload, { campaignId: 'c1', name: 'X' });
  });
});

describe('⭐ a prova que só o banco pode dar: concorrência', { skip: SEM_BANCO }, () => {
  test('dois claimDue simultâneos NÃO pegam o mesmo evento', async () => {
    // 20 eventos, dois entregadores disputando ao mesmo tempo.
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) ids.add(await enfileirar());

    const store1 = createPgOutboxStore(pool);
    const store2 = createPgOutboxStore(pool);
    const agora = new Date().toISOString();

    const [a, b] = await Promise.all([store1.claimDue(agora, 20), store2.claimDue(agora, 20)]);

    const idsA = a.map((r) => r.envelope.eventId);
    const idsB = b.map((r) => r.envelope.eventId);
    const sobreposicao = idsA.filter((id) => idsB.includes(id));

    assert.deepEqual(
      sobreposicao,
      [],
      `${sobreposicao.length} evento(s) pegos pelos DOIS — sem SKIP LOCKED, o correio entrega em duplicata`,
    );
    assert.equal(idsA.length + idsB.length, 20, 'nenhum evento se perdeu na disputa');
  });

  test('⭐ SKIP LOCKED: uma linha travada por outra transação é PULADA, não esperada', async () => {
    // ⚠️ Este teste existe porque o de cima NÃO prova o `skip locked`.
    //
    // Ao sabotar a consulta tirando o `skip locked`, os outros 13 testes
    // continuaram verdes: o Postgres re-avalia o WHERE depois que a transação
    // concorrente confirma, vê o `next_attempt_at` já empurrado e devolve
    // zero. Ou seja, **quem dá a correção é o arrendamento**.
    //
    // O `skip locked` dá outra coisa, igualmente necessária: o segundo worker
    // **não fica bloqueado** atrás do primeiro. Sem ele, uma transação lenta
    // segurando uma linha faz a fila inteira parar — e isso só se vê medindo
    // bloqueio, que é o que este teste faz.
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await enfileirar());

    // Um "worker travado": segura UMA linha numa transação aberta.
    const preso = await pool.connect();
    try {
      await preso.query('begin');
      await preso.query('select event_id from core.event_outbox where event_id = $1 for update', [
        ids[0],
      ]);

      // Outro worker chega. Com `skip locked` ele pula a linha presa e leva as
      // outras 4. Sem, ficaria esperando o `commit` que não vem — e o
      // `statement_timeout` abaixo o mataria.
      const rapido = await pool.connect();
      try {
        // ⚠️ `begin` ANTES do `set local` — `local` só existe dentro de uma
        // transação. Na primeira versão a ordem estava trocada, o timeout não
        // valia, e ao sabotar o `skip locked` o teste **pendurou** até o
        // timeout do runner em vez de reprovar. Teste que trava esconde a
        // causa; teste que falha a mostra.
        await rapido.query('begin');
        await rapido.query("set local statement_timeout = '3s'");
        const { rows } = await rapido.query(
          `with vencidos as (
             select event_id from core.event_outbox
              where status in ('pending','failed')
                and coalesce(next_attempt_at, occurred_at) <= now()
              order by coalesce(next_attempt_at, occurred_at)
              limit 10 for update skip locked)
           update core.event_outbox o set next_attempt_at = now() + interval '5 minutes'
             from vencidos v where o.event_id = v.event_id
           returning o.event_id`,
        );
        await rapido.query('commit');

        assert.equal(rows.length, 4, 'deveria levar as 4 livres e pular a presa');
        assert.equal(
          rows.some((r: { event_id: string }) => r.event_id === ids[0]),
          false,
          'levou justamente a linha que outra transação segurava',
        );
      } finally {
        rapido.release();
      }
    } finally {
      await preso.query('rollback').catch(() => {});
      preso.release();
    }
  });

  test('e a divisão realmente aconteceu — não é um pegando tudo por acaso', async () => {
    for (let i = 0; i < 10; i++) await enfileirar();
    const agora = new Date().toISOString();

    // Lotes pequenos forçam a disputa a ser visível.
    const [a, b] = await Promise.all([
      createPgOutboxStore(pool).claimDue(agora, 5),
      createPgOutboxStore(pool).claimDue(agora, 5),
    ]);

    assert.equal(a.length + b.length, 10);
    const todos = new Set([...a, ...b].map((r) => r.envelope.eventId));
    assert.equal(todos.size, 10, 'houve id repetido entre os dois lotes');
  });
});

describe('a composição, contra o banco', { skip: SEM_BANCO }, () => {
  test('⭐ a rodada real escreve a trilha, projeta a verba e conta o uso', async () => {
    // Uma campanha esperando a decisão.
    await pool.query(
      `insert into core.tenant_modules (tenant_id, module_id, version, status)
            values ($1, 'marketing', '0.1.0', 'active')
       on conflict (tenant_id, module_id) do nothing`,
      [TENANT],
    );
    await pool.query('delete from marketing.campaigns where tenant_id = $1', [TENANT]);
    await pool.query('delete from marketing.spend_approvals where tenant_id = $1', [TENANT]);
    const { rows: camp } = await pool.query<{ id: string }>(
      `insert into marketing.campaigns (tenant_id, name, budget_ref)
            values ($1, 'Campanha do teste de correio', 'AP-CORREIO-1') returning id`,
      [TENANT],
    );
    const campanhaId = (camp[0] as { id: string }).id;

    // O Módulo 1 emite. Exatamente o que o trigger de `recon` faria.
    await enfileirar({
      tipo: 'recon.approval.decided',
      payload: {
        approvalId: 'AP-CORREIO-1',
        subjectType: 'reconciliation-match',
        decision: 'approved',
        amountCents: 250_000,
        currency: 'BRL',
        decidedAt: '2026-07-28T09:00:00.000Z',
      },
    });

    const r = await runCourierOnce(pool);
    assert.equal(r.delivered, 1);

    // 1. A campanha ficou sabendo — sem ninguém digitar.
    const { rows: depois } = await pool.query<{ budget_status: string }>(
      'select budget_status from marketing.campaigns where id = $1',
      [campanhaId],
    );
    assert.equal(depois[0]?.budget_status, 'approved', 'o Módulo 2 não foi acordado');

    // 2. A trilha registrou o fato.
    const { rows: trilha } = await pool.query<{ n: string }>(
      `select count(*)::text as n from core.audit_log
        where tenant_id = $1 and action = 'recon.approval.decided'`,
      [TENANT],
    );
    assert.ok(Number(trilha[0]?.n) >= 1, 'nada foi para core.audit_log');

    // 3. A cobrança contou o evento.
    const { rows: uso } = await pool.query<{ n: string }>(
      `select coalesce(sum(quantity), 0)::text as n from core.usage_ledger
        where tenant_id = $1 and metric = 'events-per-month'`,
      [TENANT],
    );
    assert.equal(uso[0]?.n, '1', 'o gancho de billing não contou');
  });

  test('rodar a mesma rodada duas vezes não conta o uso duas vezes', async () => {
    await enfileirar({ tipo: 'marketing.campaign.published', payload: { campaignId: 'x' } });
    await runCourierOnce(pool);
    await runCourierOnce(pool);

    const { rows } = await pool.query<{ n: string }>(
      `select coalesce(sum(quantity), 0)::text as n from core.usage_ledger
        where tenant_id = $1 and metric = 'events-per-month'`,
      [TENANT],
    );
    assert.equal(rows[0]?.n, '1', 'reentrega virou cobrança a mais — o pior tipo de bug');
  });
});

/**
 * # ⭐ O TRIÂNGULO, CONTRA O BANCO
 *
 * O Módulo 3 emite; o Módulo 1 — o mais antigo, o que ninguém escreveu para
 * escutar — projeta. Aqui não há mock nenhum: o correio de verdade puxa o
 * evento de `core.event_outbox`, o handler de verdade traduz e
 * `recon.record_external_payable()` de verdade grava.
 *
 * O que este bloco prova, e nenhum teste de pacote consegue:
 *
 *   1. a projeção aparece no tenant CERTO e não vaza para o outro;
 *   2. a reentrega não duplica — a idempotência é do banco, não da promessa;
 *   3. a origem gravada é a que veio no envelope, e não uma constante;
 *   4. o cancelamento projeta ESTADO, e o título continua na tabela.
 */
describe('⭐ o triângulo: o Módulo 1 escutando o Módulo 3', { skip: SEM_BANCO }, () => {
  const OUTRO_TENANT = '00000000-0000-4000-8000-00000000beef';

  before(async () => {
    if (SEM_BANCO) return;
    await pool.query(
      `insert into core.tenants (id, slug, name, plan_code)
            values ($1, 'tenant-vizinho', 'Tenant vizinho do triângulo', 'starter')
       on conflict (id) do nothing`,
      [OUTRO_TENANT],
    );
  });

  beforeEach(async () => {
    if (SEM_BANCO) return;
    await pool.query('delete from recon.payables where tenant_id = any($1::uuid[])', [
      [TENANT, OUTRO_TENANT],
    ]);
  });

  /** O payload que `ap.payable_payload()` monta — autossuficiente, por contrato. */
  function payload(over: Record<string, unknown> = {}) {
    return {
      externalRef: 'DOC-TRIANGULO-1',
      dueDate: '2026-09-10',
      amountCents: 150_000,
      settledAmountCents: 0,
      currency: 'BRL',
      supplierName: 'Fornecedor Alfa',
      counterpartyTaxId: null,
      description: 'serviço prestado',
      status: 'open',
      ...over,
    };
  }

  async function projetado(tenant: string, ref = 'DOC-TRIANGULO-1') {
    const { rows } = await pool.query<{
      source: string;
      source_module_id: string | null;
      amount_cents: string;
      status: string;
      supplier_name: string | null;
    }>(
      `select source, source_module_id, amount_cents::text, status, supplier_name
         from recon.payables where tenant_id = $1 and external_ref = $2`,
      [tenant, ref],
    );
    return rows[0];
  }

  test('o título nasce no Módulo 3 e aparece no Módulo 1, sem ninguém redigitar', async () => {
    await enfileirar({ tipo: 'ap.payable.registered', payload: payload() });

    const r = await runCourierOnce(pool);
    assert.equal(r.delivered, 1);

    const linha = await projetado(TENANT);
    assert.ok(linha, 'a projeção não apareceu — o Módulo 1 não foi acordado');
    assert.equal(linha.source, 'event');
    assert.equal(linha.amount_cents, '150000');
    assert.equal(linha.status, 'open');
    assert.equal(linha.supplier_name, 'Fornecedor Alfa');
  });

  test('⭐ a origem gravada é a do ENVELOPE, não uma constante do consumidor', async () => {
    // `enfileirar` deriva `produced_by` do prefixo do tipo — como o
    // `emit_event` do módulo faz. Aqui é `ap`.
    await enfileirar({ tipo: 'ap.payable.registered', payload: payload() });
    await runCourierOnce(pool);
    assert.equal((await projetado(TENANT))?.source_module_id, 'ap');
  });

  test('⭐ um segundo produtor do MESMO formato é atendido, e grava a origem dele', async () => {
    // Nenhum módulo chamado `erp-bridge` existe neste repositório. É o ponto:
    // se a procedência estivesse chumbada no consumidor ou na função SQL, esta
    // linha entraria disfarçada de `ap` e a trilha mentiria sem dar erro.
    await pool.query(
      `insert into core.event_outbox
         (tenant_id, event_type, produced_by, payload, status, next_attempt_at)
       values ($1, 'ap.payable.registered', 'erp-bridge', $2::jsonb, 'pending', now() - interval '1 second')`,
      [TENANT, JSON.stringify(payload({ externalRef: 'DOC-ERP-1' }))],
    );

    await runCourierOnce(pool);

    const linha = await projetado(TENANT, 'DOC-ERP-1');
    assert.equal(linha?.source_module_id, 'erp-bridge');
  });

  test('a reentrega não duplica: a idempotência é do banco', async () => {
    const ev = await enfileirar({ tipo: 'ap.payable.registered', payload: payload() });
    await runCourierOnce(pool);

    // Reabre o evento como se o correio nunca o tivesse entregado — é o pior
    // caso real: reprocessamento manual, restauração de backup, `dead`
    // ressuscitado à mão.
    await pool.query('delete from core.processed_events where event_id = $1', [ev]);
    await pool.query(
      `update core.event_outbox set status = 'pending', next_attempt_at = now() - interval '1 second'
        where event_id = $1`,
      [ev],
    );
    await runCourierOnce(pool);

    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from recon.payables
        where tenant_id = $1 and external_ref = 'DOC-TRIANGULO-1'`,
      [TENANT],
    );
    assert.equal(rows[0]?.n, '1', 'a reentrega duplicou o título');
  });

  test('⛔ a projeção de um tenant não vaza para o outro', async () => {
    // Os DOIS tenants usam a MESMA referência, de propósito. Referência é
    // string escolhida pelo tenant: dois clientes podem ter um "DOC-1" cada um.
    // Se o isolamento dependesse de a string ser única no mundo, ele não seria
    // isolamento.
    await enfileirar({ tipo: 'ap.payable.registered', payload: payload({ amountCents: 111_000 }) });
    await pool.query(
      `insert into core.event_outbox
         (tenant_id, event_type, produced_by, payload, status, next_attempt_at)
       values ($1, 'ap.payable.registered', 'ap', $2::jsonb, 'pending', now() - interval '1 second')`,
      [OUTRO_TENANT, JSON.stringify(payload({ amountCents: 222_000 }))],
    );

    await runCourierOnce(pool);

    assert.equal((await projetado(TENANT))?.amount_cents, '111000');
    assert.equal((await projetado(OUTRO_TENANT))?.amount_cents, '222000');
  });

  test('o cancelamento projeta ESTADO — o título continua no banco', async () => {
    await enfileirar({ tipo: 'ap.payable.registered', payload: payload() });
    await runCourierOnce(pool);
    await enfileirar({
      tipo: 'ap.payable.cancelled',
      payload: payload({ status: 'cancelled' }),
    });
    await runCourierOnce(pool);

    const linha = await projetado(TENANT);
    assert.ok(linha, 'o cancelamento APAGOU o título — cancelar é status, nunca delete');
    assert.equal(linha.status, 'cancelled');
    assert.equal(linha.amount_cents, '150000', 'o valor sumiu junto com o cancelamento');
  });

  test('a alteração de valor acompanha', async () => {
    await enfileirar({ tipo: 'ap.payable.registered', payload: payload() });
    await runCourierOnce(pool);
    await enfileirar({
      tipo: 'ap.payable.updated',
      payload: payload({ settledAmountCents: 50_000, status: 'partially_settled' }),
    });
    await runCourierOnce(pool);

    const linha = await projetado(TENANT);
    assert.equal(linha?.status, 'partially_settled');
  });

  test('⚠️ o que uma pessoa digitou não é sobrescrito por evento', async () => {
    await pool.query(
      `insert into recon.payables
         (tenant_id, source, external_ref, due_date, amount_cents, currency, supplier_name)
       values ($1, 'imported', 'DOC-TRIANGULO-1', '2026-01-01', 999, 'BRL', 'digitado à mão')`,
      [TENANT],
    );

    await enfileirar({ tipo: 'ap.payable.registered', payload: payload() });
    const r = await runCourierOnce(pool);
    // O evento foi ENTREGUE — não é falha, e não pode virar `dead`.
    assert.equal(r.delivered, 1);
    assert.equal(r.retried, 0, 'o evento foi reagendado — ignorar não pode virar insistência');
    assert.equal(r.dead, 0);

    const linha = await projetado(TENANT);
    assert.equal(linha?.source, 'imported');
    assert.equal(linha.amount_cents, '999', 'o evento sobrescreveu trabalho de gente');
  });

  test('payload que não dá para projetar é entregue e ignorado, nunca vira `dead`', async () => {
    await enfileirar({
      tipo: 'ap.payable.registered',
      payload: payload({ amountCents: -1, externalRef: 'DOC-RUIM' }),
    });
    const r = await runCourierOnce(pool);
    assert.equal(r.delivered, 1);
    assert.equal(r.retried, 0, 'o evento foi reagendado — ignorar não pode virar insistência');
    assert.equal(r.dead, 0);
    assert.equal(await projetado(TENANT, 'DOC-RUIM'), undefined);
  });
});

describe('a saúde da fila', { skip: SEM_BANCO }, () => {
  // A saúde lê a fila INTEIRA — é a visão do operador da plataforma, e está
  // certa assim. O `beforeEach` do arquivo já a esvazia.
  test('conta pendente, entregue e morto, e acha o mais antigo', async () => {
    await enfileirar({ quando: '2026-07-01T00:00:00.000Z' });
    await enfileirar();

    const antes = await readQueueHealth(pool);
    assert.ok(antes.pending >= 2);
    assert.ok(antes.oldestPendingAgeMinutes !== null && antes.oldestPendingAgeMinutes > 0);

    const veredito = judgeHealth(antes);
    assert.equal(veredito.status, 'parado', 'evento de julho parado deveria acusar fila parada');
  });

  test('evento morto aparece na amostra, com o erro', async () => {
    const id = await enfileirar();
    const store = createPgOutboxStore(pool);
    const subs = [inscricao('mata', () => {}, true)];
    for (let i = 0; i < POLICY.maxAttempts; i++) {
      await pool.query(
        `update core.event_outbox set next_attempt_at = now() - interval '1 s' where event_id = $1`,
        [id],
      );
      await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => new Date() });
    }

    const saude = await readQueueHealth(pool);
    assert.ok(saude.dead >= 1);
    assert.equal(judgeHealth(saude).status, 'atencao', 'evento morto tem de ser visível');
    assert.ok(saude.deadSample.some((d) => d.eventId === id && d.lastError));
  });
});
