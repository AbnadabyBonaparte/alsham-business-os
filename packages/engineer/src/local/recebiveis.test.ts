import { test } from 'node:test';
import assert from 'node:assert/strict';

import { observarRecebiveisVencidos } from './recebiveis.ts';

test('sem leitura (null) → null: a ausência não vira um zero fabricado', () => {
  assert.equal(observarRecebiveisVencidos(null), null);
});

test('zero vencidos → null: não se inventa urgência (a lição do painelPrioridades)', () => {
  assert.equal(
    observarRecebiveisVencidos({
      overdueCount: 0,
      outstandingCents: 0,
      oldestDays: 0,
      currency: 'BRL',
    }),
    null,
  );
});

test('número infísico (negativo) → null: valor impossível não é insight', () => {
  assert.equal(
    observarRecebiveisVencidos({
      overdueCount: 3,
      outstandingCents: -1,
      oldestDays: 5,
      currency: 'BRL',
    }),
    null,
  );
  assert.equal(
    observarRecebiveisVencidos({
      overdueCount: 3,
      outstandingCents: 100,
      oldestDays: -1,
      currency: 'BRL',
    }),
    null,
  );
});

test('⭐ com vencidos: nasce o aviso, e cada número dele vem do snapshot', () => {
  const insight = observarRecebiveisVencidos({
    overdueCount: 3,
    outstandingCents: 123_456,
    oldestDays: 12,
    currency: 'BRL',
  });

  assert.notEqual(insight, null);
  assert.equal(insight!.kind, 'ar-overdue');
  assert.equal(insight!.subjectKey, 'BRL');
  assert.equal(insight!.currency, 'BRL');
  assert.equal(insight!.metricValue, 3);
  assert.equal(insight!.amountCents, 123_456);

  // ⭐ Lei 7: os números da frase são os do snapshot — 3, R$ 1234.56, 12 dias.
  assert.match(insight!.headline, /\b3 títulos vencidos\b/);
  assert.match(insight!.headline, /BRL 1234\.56/);
  assert.match(insight!.detail, /há 12 dias/);
});

test('singular: um título, um dia — concordância honesta', () => {
  const insight = observarRecebiveisVencidos({
    overdueCount: 1,
    outstandingCents: 5_000,
    oldestDays: 1,
    currency: 'USD',
  });

  assert.notEqual(insight, null);
  assert.match(insight!.headline, /\b1 título vencido\b/);
  assert.match(insight!.headline, /USD 50\.00/);
  assert.match(insight!.detail, /há 1 dia\b/);
  assert.equal(insight!.subjectKey, 'USD');
});

// ─────────────────────────────────────────────────────────────────────────
// ⭐ O PASSO DO ANALISTA — a tendência (hoje × média das leituras recentes)
// ─────────────────────────────────────────────────────────────────────────

const HOJE = { overdueCount: 3, outstandingCents: 150_000, oldestDays: 12, currency: 'BRL' };

test('sem baseline → é o AVISADOR de sempre (sem cláusula de tendência)', () => {
  const insight = observarRecebiveisVencidos(HOJE);
  assert.notEqual(insight, null);
  assert.doesNotMatch(insight!.detail, /média recente/);
});

test('baseline com poucas amostras (< 2) → não afirma tendência (honesto)', () => {
  const insight = observarRecebiveisVencidos(HOJE, { sampleCount: 1, avgMetric: 1 });
  assert.doesNotMatch(insight!.detail, /média recente/);
});

test('⭐ acima da média: expõe os DOIS números reais, diz piora', () => {
  // hoje 3 × média 2 → +50%
  const insight = observarRecebiveisVencidos(HOJE, { sampleCount: 5, avgMetric: 2 });
  assert.match(insight!.detail, /50% acima da média recente \(2 nas últimas 5 leituras\)/);
  assert.match(insight!.detail, /piora/);
  // ⭐ Lei 7: o número de hoje segue no headline, a média na cláusula — nada escondido.
  assert.match(insight!.headline, /\b3 títulos vencidos\b/);
});

test('⭐ abaixo da média: diz melhora, número real', () => {
  // hoje 3 × média 6 → −50%
  const insight = observarRecebiveisVencidos(HOJE, { sampleCount: 4, avgMetric: 6 });
  assert.match(insight!.detail, /50% abaixo da média recente \(6 nas últimas 4 leituras\)/);
  assert.match(insight!.detail, /melhora/);
});

test('em linha (< 10% de diferença) → nem piora nem melhora', () => {
  // hoje 3 × média 2.9 → ~+3%
  const insight = observarRecebiveisVencidos(HOJE, { sampleCount: 8, avgMetric: 2.9 });
  assert.match(insight!.detail, /Em linha com a média recente \(2\.9 nas últimas 8 leituras\)/);
  assert.doesNotMatch(insight!.detail, /piora|melhora/);
});

test('média não-positiva ou não-finita → sem tendência (guarda)', () => {
  assert.doesNotMatch(observarRecebiveisVencidos(HOJE, { sampleCount: 5, avgMetric: 0 })!.detail, /média recente/);
});
