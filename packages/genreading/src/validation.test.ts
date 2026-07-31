import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewReading, summarizeByPlant } from './genreading.ts';
import type { GenerationReading } from './types.ts';

const PLANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('validateNewReading — o registro de uma leitura de geração', () => {
  test('uma leitura boa passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewReading({
      plantId: `  ${PLANT}  `,
      plantName: '  Usina Norte  ',
      generatedKwh: 1234.5,
      unit: '  MWh  ',
      referenceOn: '2026-07-31',
      note: '  inversor 3  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.plantId, PLANT); // trim
      assert.equal(r.value.plantName, 'Usina Norte');
      assert.equal(r.value.generatedKwh, 1234.5);
      assert.equal(r.value.unit, 'MWh'); // trim
      assert.equal(r.value.referenceOn, '2026-07-31');
      assert.equal(r.value.note, 'inversor 3');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ o nome da usina e a nota são OPCIONAIS', () => {
    const r = validateNewReading({ plantId: PLANT, generatedKwh: 42, unit: 'kWh', referenceOn: '2026-07-31' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.plantName, '');
      assert.equal(r.value.note, '');
    }
  });

  test('⭐⭐ geração ZERO é PERMITIDA (leitura real: à noite a usina gera zero)', () => {
    const r = validateNewReading({ plantId: PLANT, generatedKwh: 0, unit: 'kWh', referenceOn: '2026-07-31' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.generatedKwh, 0);
  });

  test('⭐⭐ geração NEGATIVA é recusada (infísico — não se gera -3 kWh; o MANTIDO do esg)', () => {
    for (const generatedKwh of [-0.01, -1, -999]) {
      const r = validateNewReading({ plantId: PLANT, generatedKwh, unit: 'kWh', referenceOn: '2026-07-31' });
      assert.equal(r.ok, false, `generatedKwh=${generatedKwh} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'generatedKwh'));
    }
  });

  test('geração inválida (não número, NaN, Infinity, ausente) é recusada', () => {
    for (const generatedKwh of [undefined, 'muito', Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateNewReading({ plantId: PLANT, generatedKwh, unit: 'kWh', referenceOn: '2026-07-31' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'generatedKwh'));
    }
  });

  test('⭐ a usina é OBRIGATÓRIA (o DIVERGE do esg: não há geração sem usina)', () => {
    for (const plantId of [undefined, null, '', '   ', 42]) {
      const r = validateNewReading({ plantId, generatedKwh: 10, unit: 'kWh', referenceOn: '2026-07-31' });
      assert.equal(r.ok, false, `plantId=${String(plantId)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'plantId'));
    }
  });

  test('⭐ a unidade assume kWh quando omitida (o tenant escolhe, mas há padrão)', () => {
    for (const unit of [undefined, null, '', '   ']) {
      const r = validateNewReading({ plantId: PLANT, generatedKwh: 10, unit, referenceOn: '2026-07-31' });
      assert.equal(r.ok, true, `unit=${String(unit)} deveria assumir o padrão`);
      if (r.ok) assert.equal(r.value.unit, 'kWh');
    }
  });

  test('o período (data de referência) é OBRIGATÓRIO', () => {
    for (const referenceOn of [undefined, null, '']) {
      const r = validateNewReading({ plantId: PLANT, generatedKwh: 10, unit: 'kWh', referenceOn });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'referenceOn'));
    }
  });

  test('data inválida (formato ou calendário) é recusada', () => {
    for (const referenceOn of ['31/07/2026', '2026-7-1', 'ontem', '2026-02-30']) {
      const r = validateNewReading({ plantId: PLANT, generatedKwh: 10, unit: 'kWh', referenceOn });
      assert.equal(r.ok, false, `data=${referenceOn} deveria ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'referenceOn'));
    }
  });

  test('unidade / nome da usina / nota longos demais são recusados no campo certo', () => {
    const longaUnit = validateNewReading({
      plantId: PLANT, generatedKwh: 1, unit: 'u'.repeat(61), referenceOn: '2026-07-31',
    });
    assert.equal(longaUnit.ok, false);
    if (!longaUnit.ok) assert.ok(longaUnit.problems.some((p) => p.field === 'unit'));

    const longoNome = validateNewReading({
      plantId: PLANT, generatedKwh: 1, unit: 'kWh', referenceOn: '2026-07-31', plantName: 'n'.repeat(201),
    });
    assert.equal(longoNome.ok, false);
    if (!longoNome.ok) assert.ok(longoNome.problems.some((p) => p.field === 'plantName'));

    const longaNota = validateNewReading({
      plantId: PLANT, generatedKwh: 1, unit: 'kWh', referenceOn: '2026-07-31', note: 'z'.repeat(1001),
    });
    assert.equal(longaNota.ok, false);
    if (!longaNota.ok) assert.ok(longaNota.problems.some((p) => p.field === 'note'));
  });

  test('⭐ summarizeByPlant soma corretamente a geração por usina', () => {
    const mk = (over: Partial<GenerationReading>): GenerationReading => ({
      id: 'x', plantId: 'p', plantName: '', generatedKwh: 0, unit: 'kWh', referenceOn: '2026-07-31', note: '', ...over,
    });
    const lista = [
      mk({ id: 'a', plantId: 'p1', generatedKwh: 100 }),
      mk({ id: 'b', plantId: 'p1', generatedKwh: 50 }),
      mk({ id: 'c', plantId: 'p2', generatedKwh: 20 }),
    ];
    assert.deepEqual(summarizeByPlant(lista), [
      { plantId: 'p1', totalKwh: 150, readingCount: 2 },
      { plantId: 'p2', totalKwh: 20, readingCount: 1 },
    ]);
  });
});
