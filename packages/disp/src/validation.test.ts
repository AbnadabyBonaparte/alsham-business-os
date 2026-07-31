import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewDispatch } from './disp.ts';

describe('validateNewDispatch — o registro de um despacho', () => {
  test('um despacho bom passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const d = validateNewDispatch({
      destination: '  São Paulo — SP  ',
      quantity: 500,
      dispatchedOn: '2026-07-31',
      dcCenterName: '  CD Sul  ',
      carrier: '  Transportadora X  ',
      note: '  2 volumes  ',
    });
    assert.equal(d.ok, true);
    if (d.ok) {
      assert.equal(d.value.destination, 'São Paulo — SP'); // trim
      assert.equal(d.value.quantity, 500);
      assert.equal(d.value.dispatchedOn, '2026-07-31');
      assert.equal(d.value.dcCenterName, 'CD Sul');
      assert.equal(d.value.carrier, 'Transportadora X');
      assert.equal(d.value.note, '2 volumes');
      assert.equal(d.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ o centro é OPCIONAL — despacho sem centro é honesto (retirada direta, amostra)', () => {
    const d = validateNewDispatch({ destination: 'Cliente na portaria', quantity: 1, dispatchedOn: '2026-07-31' });
    assert.equal(d.ok, true);
    if (d.ok) {
      assert.equal(d.value.dcCenterId, null);
      assert.equal(d.value.dcCenterName, '');
      assert.equal(d.value.carrier, '');
      assert.equal(d.value.note, '');
    }
  });

  test('a transportadora é OPCIONAL — nem todo despacho tem transportadora', () => {
    const d = validateNewDispatch({ destination: 'Filial 2', quantity: 3, dispatchedOn: '2026-07-31' });
    assert.equal(d.ok, true);
    if (d.ok) assert.equal(d.value.carrier, '');
  });

  test('sem destino: recusado, com o campo apontado', () => {
    for (const destination of [undefined, null, '', '   ', 42]) {
      const d = validateNewDispatch({ destination, quantity: 1, dispatchedOn: '2026-07-31' });
      assert.equal(d.ok, false);
      if (!d.ok) assert.ok(d.problems.some((p) => p.field === 'destination'));
    }
  });

  test('quantidade inválida (não número, zero, negativa, NaN, Infinity) é recusada', () => {
    for (const quantity of [undefined, 'muitos', 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = validateNewDispatch({ destination: 'ok', quantity, dispatchedOn: '2026-07-31' });
      assert.equal(d.ok, false);
      if (!d.ok) assert.ok(d.problems.some((p) => p.field === 'quantity'));
    }
  });

  test('dia ausente ou fora do formato ISO é recusado', () => {
    for (const dispatchedOn of [undefined, '', '31/07/2026', '2026-7-1', 'ontem']) {
      const d = validateNewDispatch({ destination: 'ok', quantity: 1, dispatchedOn });
      assert.equal(d.ok, false);
      if (!d.ok) assert.ok(d.problems.some((p) => p.field === 'dispatchedOn'));
    }
  });

  test('⭐ passado é permitido — quem registra hoje o que saiu ontem não erra', () => {
    const d = validateNewDispatch({ destination: 'ok', quantity: 1, dispatchedOn: '2020-01-01' });
    assert.equal(d.ok, true);
  });

  test('destino / nome do centro / transportadora / nota longos demais são recusados no campo certo', () => {
    const longoDest = validateNewDispatch({ destination: 'x'.repeat(301), quantity: 1, dispatchedOn: '2026-07-31' });
    assert.equal(longoDest.ok, false);
    if (!longoDest.ok) assert.ok(longoDest.problems.some((p) => p.field === 'destination'));

    const longoCentro = validateNewDispatch({ destination: 'ok', quantity: 1, dispatchedOn: '2026-07-31', dcCenterName: 'c'.repeat(201) });
    assert.equal(longoCentro.ok, false);
    if (!longoCentro.ok) assert.ok(longoCentro.problems.some((p) => p.field === 'dcCenterName'));

    const longaTransp = validateNewDispatch({ destination: 'ok', quantity: 1, dispatchedOn: '2026-07-31', carrier: 't'.repeat(201) });
    assert.equal(longaTransp.ok, false);
    if (!longaTransp.ok) assert.ok(longaTransp.problems.some((p) => p.field === 'carrier'));

    const longaNota = validateNewDispatch({ destination: 'ok', quantity: 1, dispatchedOn: '2026-07-31', note: 'z'.repeat(1001) });
    assert.equal(longaNota.ok, false);
    if (!longaNota.ok) assert.ok(longaNota.problems.some((p) => p.field === 'note'));
  });
});
