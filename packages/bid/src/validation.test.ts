import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewTender, validateNewProposal } from './bid.ts';

describe('validateNewTender — a abertura de uma licitação', () => {
  test('uma licitação boa passa, nasce draft, sem vencedor, com id vazio (o servidor carimba)', () => {
    const t = validateNewTender({
      title: '  Pavimentação da Rua X  ',
      description: '  edital 001/2026  ',
      modality: '  Pregão eletrônico  ',
      lines: [{ item: '  Asfalto CBUQ  ', quantity: '  500  ', unit: '  t  ' }],
    });
    assert.equal(t.ok, true);
    if (t.ok) {
      assert.equal(t.value.title, 'Pavimentação da Rua X'); // trim
      assert.equal(t.value.description, 'edital 001/2026');
      assert.equal(t.value.modality, 'Pregão eletrônico');
      assert.equal(t.value.status, 'draft');
      assert.equal(t.value.homologatedBidderId, null);
      assert.equal(t.value.homologatedBidderName, '');
      assert.equal(t.value.cancelReason, '');
      assert.equal(t.value.id, ''); // a pura camada nunca inventa dado do servidor
      assert.equal(t.value.lines.length, 1);
      assert.deepEqual(t.value.lines[0], { lineNo: 1, item: 'Asfalto CBUQ', quantity: 500, unit: 't' });
    }
  });

  test('⭐ o edital, a modalidade e a unidade são OPCIONAIS — sem eles vira vazio, não erro', () => {
    const t = validateNewTender({ title: 'Aquisição de merenda', lines: [{ item: 'Arroz', quantity: 200 }] });
    assert.equal(t.ok, true);
    if (t.ok) {
      assert.equal(t.value.description, '');
      assert.equal(t.value.modality, '');
      assert.equal(t.value.lines[0]!.unit, '');
    }
  });

  test('sem título: recusada, com o campo apontado', () => {
    for (const title of [undefined, null, '', '   ', 42]) {
      const t = validateNewTender({ title, lines: [{ item: 'x', quantity: 1 }] });
      assert.equal(t.ok, false);
      if (!t.ok) assert.ok(t.problems.some((p) => p.field === 'title'));
    }
  });

  test('⛔ licitação sem item não vai a mercado', () => {
    for (const lines of [undefined, null, [], 'nope']) {
      const t = validateNewTender({ title: 'ok', lines });
      assert.equal(t.ok, false);
      if (!t.ok) assert.ok(t.problems.some((p) => p.field === 'lines'));
    }
  });

  test('⭐ item inválido reporta o erro COM o índice (lines.1.quantity)', () => {
    const t = validateNewTender({
      title: 'ok',
      lines: [
        { item: 'bom', quantity: 3 },
        { item: '', quantity: 0 },
      ],
    });
    assert.equal(t.ok, false);
    if (!t.ok) {
      assert.ok(t.problems.some((p) => p.field === 'lines.1.item'));
      assert.ok(t.problems.some((p) => p.field === 'lines.1.quantity'));
    }
  });

  test('quantidade não-positiva é recusada no item', () => {
    for (const quantity of [0, -1, 'abc', null]) {
      const t = validateNewTender({ title: 'ok', lines: [{ item: 'x', quantity }] });
      assert.equal(t.ok, false);
      if (!t.ok) assert.ok(t.problems.some((p) => p.field === 'lines.0.quantity'));
    }
  });

  test('título longo demais é recusado no campo title', () => {
    const t = validateNewTender({ title: 'x'.repeat(201), lines: [{ item: 'x', quantity: 1 }] });
    assert.equal(t.ok, false);
    if (!t.ok) assert.ok(t.problems.some((p) => p.field === 'title'));
  });
});

describe('validateNewProposal — uma proposta de licitante', () => {
  test('uma proposta boa passa; bidderId opcional; moeda cai em BRL', () => {
    const p = validateNewProposal({
      bidderName: '  Construtora Alfa  ',
      amountCents: 1500000,
      note: '  prazo 90 dias  ',
    });
    assert.equal(p.ok, true);
    if (p.ok) {
      assert.equal(p.value.bidderId, null);
      assert.equal(p.value.bidderName, 'Construtora Alfa');
      assert.equal(p.value.amountCents, 1500000);
      assert.equal(p.value.currency, 'BRL');
      assert.equal(p.value.note, 'prazo 90 dias');
    }
  });

  test('bidderId, quando informado, é preservado (id solto)', () => {
    const p = validateNewProposal({ bidderId: 'v-123', bidderName: 'Beta', amountCents: 0 });
    assert.equal(p.ok, true);
    if (p.ok) assert.equal(p.value.bidderId, 'v-123');
  });

  test('sem nome do licitante: recusada', () => {
    for (const bidderName of [undefined, null, '', '  ', 7]) {
      const p = validateNewProposal({ bidderName, amountCents: 100 });
      assert.equal(p.ok, false);
      if (!p.ok) assert.ok(p.problems.some((x) => x.field === 'bidderName'));
    }
  });

  test('⭐ valor >= 0 e inteiro em centavos — negativo, fracionário ou não-número recusado', () => {
    for (const amountCents of [-1, 10.5, 'abc', null, undefined]) {
      const p = validateNewProposal({ bidderName: 'Alfa', amountCents });
      assert.equal(p.ok, false);
      if (!p.ok) assert.ok(p.problems.some((x) => x.field === 'amountCents'));
    }
  });

  test('valor zero é aceito (proposta simbólica/cortesia)', () => {
    const p = validateNewProposal({ bidderName: 'Alfa', amountCents: 0 });
    assert.equal(p.ok, true);
  });
});
