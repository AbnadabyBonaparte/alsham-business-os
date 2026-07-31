import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewEntry } from './pcost.ts';

const PROJ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('validateNewEntry — o registro de um custo de projeto', () => {
  test('um custo bom passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewEntry({
      projectId: `  ${PROJ}  `,
      projectName: '  Obra Central  ',
      amountCents: 150_00,
      currency: '  BRL  ',
      category: '  Materiais  ',
      incurredOn: '2026-07-31',
      note: '  cimento  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.projectId, PROJ); // trim
      assert.equal(r.value.projectName, 'Obra Central');
      assert.equal(r.value.amountCents, 15000);
      assert.equal(r.value.currency, 'BRL');
      assert.equal(r.value.category, 'Materiais');
      assert.equal(r.value.incurredOn, '2026-07-31');
      assert.equal(r.value.note, 'cimento');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ categoria e competência são OPCIONAIS — custo sem elas é honesto (a lição do cash)', () => {
    const r = validateNewEntry({ projectId: PROJ, amountCents: 5000, currency: 'BRL' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.category, '');
      assert.equal(r.value.incurredOn, null);
      assert.equal(r.value.projectName, '');
      assert.equal(r.value.note, '');
    }
  });

  test('⭐⭐ SEM piso nem teto — valor enorme, positivo OU negativo, é aceito (o DIVERGE do fund)', () => {
    const positivo = validateNewEntry({ projectId: PROJ, amountCents: 999_999_999, currency: 'BRL' });
    assert.equal(positivo.ok, true);
    if (positivo.ok) assert.equal(positivo.value.amountCents, 999_999_999);

    // Sinal LIVRE: negativo é crédito/estorno (a correção pelo ato inverso).
    const negativo = validateNewEntry({ projectId: PROJ, amountCents: -999_999_999, currency: 'BRL' });
    assert.equal(negativo.ok, true);
    if (negativo.ok) assert.equal(negativo.value.amountCents, -999_999_999);
  });

  test('⭐ o projeto (id solto) é OBRIGATÓRIO', () => {
    for (const projectId of [undefined, null, '', '   ', 42]) {
      const r = validateNewEntry({ projectId, amountCents: 100, currency: 'BRL' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'projectId'));
    }
  });

  test('valor inválido (não número, não inteiro, zero, NaN) é recusado', () => {
    for (const amountCents of [undefined, 'muito', 12.5, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateNewEntry({ projectId: PROJ, amountCents, currency: 'BRL' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'amountCents'));
    }
  });

  test('moeda ausente é recusada (valor e moeda andam juntos)', () => {
    for (const currency of [undefined, null, '', '   ', 9]) {
      const r = validateNewEntry({ projectId: PROJ, amountCents: 100, currency });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'currency'));
    }
  });

  test('competência fora do formato ISO é recusada', () => {
    for (const incurredOn of ['31/07/2026', '2026-7-1', 'ontem']) {
      const r = validateNewEntry({ projectId: PROJ, amountCents: 100, currency: 'BRL', incurredOn });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'incurredOn'));
    }
  });

  test('nome de projeto / categoria / nota longos demais são recusados no campo certo', () => {
    const longoNome = validateNewEntry({ projectId: PROJ, projectName: 'x'.repeat(201), amountCents: 1, currency: 'BRL' });
    assert.equal(longoNome.ok, false);
    if (!longoNome.ok) assert.ok(longoNome.problems.some((p) => p.field === 'projectName'));

    const longaCat = validateNewEntry({ projectId: PROJ, amountCents: 1, currency: 'BRL', category: 'y'.repeat(121) });
    assert.equal(longaCat.ok, false);
    if (!longaCat.ok) assert.ok(longaCat.problems.some((p) => p.field === 'category'));

    const longaNota = validateNewEntry({ projectId: PROJ, amountCents: 1, currency: 'BRL', note: 'z'.repeat(1001) });
    assert.equal(longaNota.ok, false);
    if (!longaNota.ok) assert.ok(longaNota.problems.some((p) => p.field === 'note'));
  });
});
