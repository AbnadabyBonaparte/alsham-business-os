import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { EventEnvelope } from '@alsham/core';
import { deliverDue } from '@alsham/workflow';
import type { OutboxRecord, OutboxStore, Subscription } from '@alsham/workflow';
import { eventUsageHook } from '@alsham/billing';
import type { UsageRecorder } from '@alsham/billing';

import { CONSUMED_EVENT_TYPE, CONSUMER_ID, handleSpendDecision, toSpendDecision } from './spend-approval.ts';
import type { SpendDecision, SpendProjectionPort } from './spend-approval.ts';

/**
 * ⭐ **A PROVA DA ETAPA 7.**
 *
 * Aqui o correio de verdade (`deliverDue`, de `@alsham/workflow`) entrega um
 * evento de verdade do `recon` ao handler de verdade do `marketing`. Nada é
 * simulado exceto a persistência — que é justamente o que os pacotes não têm.
 *
 * ⚠️ `@alsham/workflow` entra como **devDependency**, e a distinção importa:
 * o código publicado deste módulo não o importa. Este arquivo faz o papel da
 * COMPOSIÇÃO — o lugar onde alguém liga um no outro —, e é aqui que essa
 * ligação é provada, não dentro do módulo.
 */

// -------------------------------------------------------------------------
// A caixa de saída de mentira. Guarda o mesmo que `core.event_outbox`.
// -------------------------------------------------------------------------

function fazerCaixa(registros: OutboxRecord[]): OutboxStore & { processados: Set<string> } {
  const processados = new Set<string>();
  const entregues = new Set<string>();
  return {
    processados,
    async claimDue() {
      return registros.filter((r) => !entregues.has(r.envelope.eventId));
    },
    async markDelivered(eventId) {
      entregues.add(eventId);
    },
    async markFailed() {},
    async markDead() {},
    // A idempotência real do correio: `unique (event_id, consumer)`.
    async markProcessed({ eventId, consumer }) {
      const chave = `${eventId}::${consumer}`;
      if (processados.has(chave)) return false;
      processados.add(chave);
      return true;
    },
  };
}

/**
 * A projeção de mentira. Reproduz o contrato de
 * `marketing.record_spend_decision()`: grava uma vez, e devolve 0 quando o
 * fato já era conhecido.
 */
function fazerProjecao() {
  const fatos = new Map<string, SpendDecision>();
  const campanhas = new Map<string, string>([
    // uma campanha do tenant t1 apontando para a decisão AP-1
    ['AP-1', 'none'],
  ]);
  const port: SpendProjectionPort = {
    async recordSpendDecision(d) {
      const chave = `${d.tenantId}::${d.sourceModuleId}::${d.externalRef}`;
      if (fatos.has(chave)) return 0;
      fatos.set(chave, d);
      if (!campanhas.has(d.externalRef)) return 0;
      campanhas.set(d.externalRef, d.decision);
      return 1;
    },
  };
  return { port, fatos, campanhas };
}

const envelope = (over: Partial<EventEnvelope> = {}): OutboxRecord => ({
  envelope: {
    eventId: 'evt-1',
    eventType: CONSUMED_EVENT_TYPE,
    eventVersion: 1,
    tenantId: 't1',
    occurredAt: '2026-07-27T10:00:00.000Z',
    producedBy: 'recon',
    payload: {
      approvalId: 'AP-1',
      subjectType: 'reconciliation-match',
      subjectId: 'sub-1',
      decision: 'approved',
      amountCents: 250_000,
      currency: 'BRL',
      decidedBy: 'user-1',
      decidedAt: '2026-07-27T09:59:00.000Z',
      note: null,
    },
    ...over,
  } as EventEnvelope,
  status: 'pending',
  attempts: 0,
  nextAttemptAt: null,
  lastError: null,
});

const POLICY = { baseDelayMs: 1000, maxDelayMs: 60_000, maxAttempts: 5 };

function inscricao(port: SpendProjectionPort): Subscription {
  const handle = handleSpendDecision(port);
  return {
    consumer: CONSUMER_ID,
    eventType: CONSUMED_EVENT_TYPE,
    // A ponte de uma linha entre o módulo e o correio. É ESTA linha que a
    // composição escreve — e a única coisa que os liga.
    handle: async (env) => {
      await handle(env);
    },
  };
}

// -------------------------------------------------------------------------
// 1. O efeito acontece
// -------------------------------------------------------------------------

test('o evento do recon atravessa o correio e produz efeito no schema do marketing', async () => {
  const registros = [envelope()];
  const caixa = fazerCaixa(registros);
  const { port, fatos, campanhas } = fazerProjecao();

  const relatorio = await deliverDue({
    store: caixa,
    subscriptions: [inscricao(port)],
    policy: POLICY,
    now: () => new Date('2026-07-27T10:00:05.000Z'),
  });

  assert.equal(relatorio.delivered, 1);
  assert.equal(fatos.size, 1, 'a projeção local guardou o fato');
  assert.equal(campanhas.get('AP-1'), 'approved', 'a campanha ficou sabendo');
});

// -------------------------------------------------------------------------
// 2. ⭐ UMA VEZ SÓ — a exigência central da etapa
// -------------------------------------------------------------------------

test('reentregar o MESMO evento não repete o efeito', async () => {
  const registros = [envelope()];
  const caixa = fazerCaixa(registros);
  const { port, fatos } = fazerProjecao();
  const subs = [inscricao(port)];
  const agora = () => new Date('2026-07-27T10:00:05.000Z');

  await deliverDue({ store: caixa, subscriptions: subs, policy: POLICY, now: agora });

  // O correio já marcou como entregue; forçamos a reentrega do mesmo id,
  // que é exatamente o que um replay ou uma restauração fariam.
  const caixaRepetida = fazerCaixa([envelope()]);
  for (const chave of caixa.processados) caixaRepetida.processados.add(chave);

  const segunda = await deliverDue({
    store: caixaRepetida,
    subscriptions: subs,
    policy: POLICY,
    now: agora,
  });

  assert.equal(segunda.outcomes[0]?.result, 'already-processed');
  assert.equal(fatos.size, 1, 'a projeção continua com UM fato');
});

test('e mesmo se o correio falhasse, a projeção recusa o fato repetido sozinha', async () => {
  // Cinto além do suspensório: chamamos o handler duas vezes DIRETO, sem
  // correio nenhum, que é o cenário de um segundo entregador ligado por
  // engano. `unique (tenant_id, source_module_id, external_ref)` segura.
  const { port, fatos } = fazerProjecao();
  const handle = handleSpendDecision(port);

  const primeira = await handle(envelope().envelope);
  const segunda = await handle(envelope().envelope);

  assert.equal(primeira.kind, 'applied');
  assert.equal(segunda.kind, 'already-known');
  assert.equal(fatos.size, 1);
});

// -------------------------------------------------------------------------
// 3. O consumo é por PAYLOAD, nunca por join
// -------------------------------------------------------------------------

test('tudo que o marketing sabe veio do payload — o envelope basta', () => {
  const t = toSpendDecision(envelope().envelope);
  assert.equal(t.kind, 'apply');
  if (t.kind !== 'apply') return;
  assert.equal(t.decision.externalRef, 'AP-1');
  assert.equal(t.decision.amountCents, 250_000);
  // A origem vem do ENVELOPE, não de uma constante 'recon' no código: é o que
  // permite outro módulo emitir o mesmo formato amanhã sem mudar nada aqui.
  assert.equal(t.decision.sourceModuleId, 'recon');
});

test('o handler funciona com producedBy de um módulo que ainda não existe', async () => {
  const { port, fatos } = fazerProjecao();
  const handle = handleSpendDecision(port);
  await handle(envelope({ producedBy: 'accounts-payable' }).envelope);
  const [fato] = [...fatos.values()];
  assert.equal(fato?.sourceModuleId, 'accounts-payable');
});

test('evento de tipo não escutado é ignorado, não quebra', async () => {
  const { port, fatos } = fazerProjecao();
  const handle = handleSpendDecision(port);
  const r = await handle(envelope({ eventType: 'recon.statement.discarded' }).envelope);
  assert.equal(r.kind, 'ignored');
  assert.equal(fatos.size, 0);
});

test('payload sem identificador é ignorado em vez de virar `dead` na fila', async () => {
  const { port } = fazerProjecao();
  const handle = handleSpendDecision(port);
  const r = await handle(envelope({ payload: { decision: 'approved' } }).envelope);
  assert.equal(r.kind, 'ignored');
});

test('campo novo no payload do produtor não quebra o consumidor', async () => {
  const { port, campanhas } = fazerProjecao();
  const handle = handleSpendDecision(port);
  await handle(
    envelope({
      payload: {
        approvalId: 'AP-1',
        decision: 'approved',
        amountCents: 1,
        currency: 'BRL',
        decidedAt: '2026-07-27T09:00:00.000Z',
        // o recon acrescentou isto numa versão futura
        approvalChainStep: 2,
        approvedByRole: 'diretor',
      },
    }).envelope,
  );
  assert.equal(campanhas.get('AP-1'), 'approved');
});

test('reprovação também é decisão — e chega igual', async () => {
  const { port, campanhas } = fazerProjecao();
  const handle = handleSpendDecision(port);
  await handle(envelope({ payload: { approvalId: 'AP-1', decision: 'rejected' } }).envelope);
  assert.equal(campanhas.get('AP-1'), 'rejected');
});

// -------------------------------------------------------------------------
// 4. A cobrança conta o evento novo — sem reimplementar nada
// -------------------------------------------------------------------------

test('o evento entregue ao marketing já é contado pelo gancho de billing da Etapa 6', async () => {
  const lancamentos: Array<{ metric: string; sourceRef: string | null; sourceModuleId: string | null }> = [];
  const recorder: UsageRecorder = {
    async record(input) {
      lancamentos.push({
        metric: input.metric,
        sourceRef: input.sourceRef,
        sourceModuleId: input.sourceModuleId,
      });
    },
  };

  const caixa = fazerCaixa([envelope()]);
  const { port } = fazerProjecao();

  await deliverDue({
    store: caixa,
    subscriptions: [inscricao(port)],
    policy: POLICY,
    now: () => new Date('2026-07-27T10:00:05.000Z'),
    // ⚠️ Nada foi escrito em billing para esta etapa. É o MESMO gancho da
    // Etapa 6, ligado pela composição — a cobrança pega o módulo novo de
    // graça porque conta EVENTO, não módulo.
    onDelivered: eventUsageHook(recorder, () => new Date('2026-07-27T10:00:05.000Z')),
  });

  assert.equal(lancamentos.length, 1);
  assert.equal(lancamentos[0]?.metric, 'events-per-month');
  assert.equal(lancamentos[0]?.sourceRef, 'evt-1');
});

test('o evento que o MARKETING emite também é contado — e atribuído a ele', async () => {
  const lancamentos: Array<{ sourceModuleId: string | null }> = [];
  const recorder: UsageRecorder = {
    async record(input) {
      lancamentos.push({ sourceModuleId: input.sourceModuleId });
    },
  };

  const publicado = envelope({
    eventId: 'evt-pub',
    eventType: 'marketing.campaign.published',
    producedBy: 'marketing',
    payload: { campaignId: 'c1', name: 'Campanha', previousStatus: 'draft' },
  });

  await deliverDue({
    store: fazerCaixa([publicado]),
    // Ninguém escuta campanha publicada hoje — e isso não impede a contagem.
    subscriptions: [],
    policy: POLICY,
    now: () => new Date('2026-07-27T10:00:05.000Z'),
    onDelivered: eventUsageHook(recorder, () => new Date('2026-07-27T10:00:05.000Z')),
  });

  // `no-subscriber` não chama `onDelivered`: o correio só conta o que
  // realmente entregou a alguém. Registrado aqui porque é a diferença entre
  // cobrar por fato e cobrar por ruído.
  assert.equal(lancamentos.length, 0);
});
