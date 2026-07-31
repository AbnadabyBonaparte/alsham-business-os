import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewEntry, computeBalance, canRedeem, summarizeByCustomer } from './loyalty.ts';
import type { LoyaltyEntry } from './types.ts';

const CLI = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VENDA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function movimento(over: Partial<LoyaltyEntry> = {}): LoyaltyEntry {
  return {
    id: 'm1',
    customerId: CLI,
    customerName: 'Ana',
    entryType: 'earn',
    points: 100,
    reason: '',
    sourceId: null,
    ...over,
  };
}

describe('validateNewEntry — o registro de um movimento de pontos', () => {
  test('um earn bom passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewEntry({
      customerId: `  ${CLI}  `,
      customerName: '  Ana  ',
      entryType: 'earn',
      points: 100,
      reason: '  compra  ',
      sourceId: `  ${VENDA}  `,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.customerId, CLI); // trim
      assert.equal(r.value.customerName, 'Ana');
      assert.equal(r.value.entryType, 'earn');
      assert.equal(r.value.points, 100);
      assert.equal(r.value.reason, 'compra');
      assert.equal(r.value.sourceId, VENDA);
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ um redeem com pontos>0 e origem null passa', () => {
    const r = validateNewEntry({ customerId: CLI, entryType: 'redeem', points: 50 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.entryType, 'redeem');
      assert.equal(r.value.points, 50);
      assert.equal(r.value.sourceId, null);
      assert.equal(r.value.reason, '');
      assert.equal(r.value.customerName, '');
    }
  });

  test('⭐ o cliente (id solto) é OBRIGATÓRIO — não há ponto sem dono', () => {
    for (const customerId of [undefined, null, '', '   ', 42]) {
      const r = validateNewEntry({ customerId, entryType: 'earn', points: 10 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'customerId'));
    }
  });

  test('⭐ o entry_type inválido é recusado (só earn/redeem)', () => {
    for (const entryType of [undefined, null, '', 'gain', 'spend', 'EARN', 42]) {
      const r = validateNewEntry({ customerId: CLI, entryType, points: 10 });
      assert.equal(r.ok, false, `entryType=${String(entryType)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'entryType'));
    }
  });

  test('⭐⭐ points <= 0 é recusado (zero é linha muda; negativo não existe — o sinal é o tipo)', () => {
    for (const points of [0, -1, -100]) {
      const r = validateNewEntry({ customerId: CLI, entryType: 'earn', points });
      assert.equal(r.ok, false, `points=${points} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'points'));
    }
  });

  test('⭐ points não-inteiro é recusado (o CHECK do banco é integer)', () => {
    for (const points of [1.5, 99.9, 0.5]) {
      const r = validateNewEntry({ customerId: CLI, entryType: 'earn', points });
      assert.equal(r.ok, false, `points=${points} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'points'));
    }
  });

  test('points inválidos (não número, NaN, Infinity, ausente) são recusados', () => {
    for (const points of [undefined, 'muito', Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateNewEntry({ customerId: CLI, entryType: 'earn', points });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'points'));
    }
  });
});

describe('computeBalance — Σ(earn) − Σ(redeem)', () => {
  test('earn soma, redeem subtrai; livro vazio dá zero', () => {
    assert.equal(computeBalance([]), 0);
    const livro = [
      movimento({ id: 'a', entryType: 'earn', points: 100 }),
      movimento({ id: 'b', entryType: 'earn', points: 50 }),
      movimento({ id: 'c', entryType: 'redeem', points: 30 }),
    ];
    assert.equal(computeBalance(livro), 120);
  });
});

describe('⭐⭐ canRedeem — a TERCEIRA resposta: resgatar mais que o saldo é recusado', () => {
  const livro = [
    movimento({ id: 'a', entryType: 'earn', points: 100 }),
    movimento({ id: 'b', entryType: 'redeem', points: 40 }),
  ]; // saldo = 60

  test('true quando os pontos cabem no saldo (inclusive o saldo cheio)', () => {
    assert.equal(canRedeem(livro, 60), true);
    assert.equal(canRedeem(livro, 1), true);
  });

  test('false quando os pontos passam do saldo', () => {
    assert.equal(canRedeem(livro, 61), false);
    assert.equal(canRedeem([], 1), false);
  });

  test('false para pontos <= 0 ou inválidos', () => {
    assert.equal(canRedeem(livro, 0), false);
    assert.equal(canRedeem(livro, -10), false);
    assert.equal(canRedeem(livro, Number.NaN), false);
  });
});

describe('summarizeByCustomer — o saldo por cliente (espelho da VIEW)', () => {
  test('agrupa e conta earn/redeem por cliente', () => {
    const OUTRO = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const livro = [
      movimento({ id: 'a', customerId: CLI, entryType: 'earn', points: 100 }),
      movimento({ id: 'b', customerId: CLI, entryType: 'redeem', points: 30 }),
      movimento({ id: 'c', customerId: OUTRO, entryType: 'earn', points: 5 }),
    ];
    assert.deepEqual(summarizeByCustomer(livro), [
      { customerId: CLI, balancePoints: 70, earnCount: 1, redeemCount: 1 },
      { customerId: OUTRO, balancePoints: 5, earnCount: 1, redeemCount: 0 },
    ]);
    assert.deepEqual(summarizeByCustomer([]), []);
  });
});
