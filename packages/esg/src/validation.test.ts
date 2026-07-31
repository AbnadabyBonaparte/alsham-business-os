import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewReading, isMetricType } from './esg.ts';

const SRC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('validateNewReading — o registro de uma leitura ambiental', () => {
  test('uma leitura boa passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewReading({
      metricType: 'carbon',
      quantity: 12.5,
      unit: '  tCO2e  ',
      referenceOn: '2026-07-31',
      sourceId: `  ${SRC}  `,
      sourceName: '  Usina Norte  ',
      note: '  escopo 1  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.metricType, 'carbon');
      assert.equal(r.value.quantity, 12.5);
      assert.equal(r.value.unit, 'tCO2e'); // trim
      assert.equal(r.value.referenceOn, '2026-07-31');
      assert.equal(r.value.sourceId, SRC); // trim
      assert.equal(r.value.sourceName, 'Usina Norte');
      assert.equal(r.value.note, 'escopo 1');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ a fonte (id solto + nome) e a nota são OPCIONAIS', () => {
    const r = validateNewReading({
      metricType: 'water',
      quantity: 340,
      unit: 'm³',
      referenceOn: '2026-07-31',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.sourceId, null);
      assert.equal(r.value.sourceName, '');
      assert.equal(r.value.note, '');
    }
  });

  test('⭐⭐ as QUATRO dimensões passam — e só elas (a física do método, não vocabulário)', () => {
    for (const metricType of ['carbon', 'water', 'energy', 'waste']) {
      const r = validateNewReading({ metricType, quantity: 1, unit: 'kg', referenceOn: '2026-07-31' });
      assert.equal(r.ok, true, `${metricType} deveria passar`);
    }
    for (const metricType of ['co2', 'lixo', 'gas', 'CARBON', '', undefined, 42]) {
      const r = validateNewReading({ metricType, quantity: 1, unit: 'kg', referenceOn: '2026-07-31' });
      assert.equal(r.ok, false, `${String(metricType)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'metricType'));
    }
  });

  test('isMetricType reconhece exatamente as quatro dimensões', () => {
    assert.equal(isMetricType('carbon'), true);
    assert.equal(isMetricType('waste'), true);
    assert.equal(isMetricType('recycling'), false);
    assert.equal(isMetricType(3), false);
  });

  test('⭐⭐ quantidade ZERO é PERMITIDA (leitura real: zero resíduo é reportável)', () => {
    const r = validateNewReading({ metricType: 'waste', quantity: 0, unit: 'kg', referenceOn: '2026-07-31' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.quantity, 0);
  });

  test('⭐⭐ quantidade NEGATIVA é recusada (infísico — o DIVERGE do pcost<>0)', () => {
    for (const quantity of [-0.01, -1, -999]) {
      const r = validateNewReading({ metricType: 'energy', quantity, unit: 'kWh', referenceOn: '2026-07-31' });
      assert.equal(r.ok, false, `quantity=${quantity} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'quantity'));
    }
  });

  test('quantidade inválida (não número, NaN, Infinity, ausente) é recusada', () => {
    for (const quantity of [undefined, 'muito', Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateNewReading({ metricType: 'carbon', quantity, unit: 'tCO2e', referenceOn: '2026-07-31' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'quantity'));
    }
  });

  test('⭐ a unidade é OBRIGATÓRIA e não-vazia (o tenant escolhe, mas escolhe)', () => {
    for (const unit of [undefined, null, '', '   ', 42]) {
      const r = validateNewReading({ metricType: 'carbon', quantity: 1, unit, referenceOn: '2026-07-31' });
      assert.equal(r.ok, false, `unit=${String(unit)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'unit'));
    }
  });

  test('o período (data de referência) é OBRIGATÓRIO', () => {
    for (const referenceOn of [undefined, null, '']) {
      const r = validateNewReading({ metricType: 'carbon', quantity: 1, unit: 'tCO2e', referenceOn });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'referenceOn'));
    }
  });

  test('data inválida (formato ou calendário) é recusada', () => {
    for (const referenceOn of ['31/07/2026', '2026-7-1', 'ontem', '2026-02-30']) {
      const r = validateNewReading({ metricType: 'carbon', quantity: 1, unit: 'tCO2e', referenceOn });
      assert.equal(r.ok, false, `data=${referenceOn} deveria ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'referenceOn'));
    }
  });

  test('unidade / nome da fonte / nota longos demais são recusados no campo certo', () => {
    const longaUnit = validateNewReading({
      metricType: 'carbon', quantity: 1, unit: 'u'.repeat(61), referenceOn: '2026-07-31',
    });
    assert.equal(longaUnit.ok, false);
    if (!longaUnit.ok) assert.ok(longaUnit.problems.some((p) => p.field === 'unit'));

    const longoNome = validateNewReading({
      metricType: 'carbon', quantity: 1, unit: 'tCO2e', referenceOn: '2026-07-31', sourceName: 'n'.repeat(201),
    });
    assert.equal(longoNome.ok, false);
    if (!longoNome.ok) assert.ok(longoNome.problems.some((p) => p.field === 'sourceName'));

    const longaNota = validateNewReading({
      metricType: 'carbon', quantity: 1, unit: 'tCO2e', referenceOn: '2026-07-31', note: 'z'.repeat(1001),
    });
    assert.equal(longaNota.ok, false);
    if (!longaNota.ok) assert.ok(longaNota.problems.some((p) => p.field === 'note'));
  });
});
