import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateMovement, validateNewAccount, validateTransfer } from './bank-accounts.ts';

describe('a validação da conta nova', () => {
  test('conta boa passa; banco/agência são livres', () => {
    const r = validateNewAccount({ name: 'Principal', currency: 'BRL' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'Principal');
      assert.equal(r.value.bankName, '');
    }
  });

  test('apelido vazio é recusado', () => {
    const r = validateNewAccount({ name: '  ', currency: 'BRL' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('⭐ moeda fora do ISO é recusada — a conta tem uma moeda', () => {
    for (const currency of ['reais', 'br', '']) {
      const r = validateNewAccount({ name: 'X', currency });
      assert.equal(r.ok, false, `currency=${currency} deveria falhar`);
    }
  });
});

describe('a validação do lançamento avulso', () => {
  test('entrada positiva passa', () => {
    const r = validateMovement({ kind: 'in', amountCents: 10000, currency: 'BRL', occurredOn: '2026-07-15' });
    assert.equal(r.ok, true);
  });

  test('entrada/saída com valor não-positivo é recusada', () => {
    for (const kind of ['in', 'out'] as const) {
      const r = validateMovement({ kind, amountCents: 0, currency: 'BRL', occurredOn: '2026-07-15' });
      assert.equal(r.ok, false, `${kind} com 0 deveria falhar`);
    }
  });

  test('⭐ ajuste sem razão é recusado — a linha muda esconde o desvio', () => {
    const r = validateMovement({ kind: 'adjustment', amountCents: -500, currency: 'BRL', occurredOn: '2026-07-15', reason: '' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'reason'));
  });

  test('ajuste com razão passa; ajuste de zero é recusado', () => {
    assert.equal(validateMovement({ kind: 'adjustment', amountCents: -500, currency: 'BRL', occurredOn: '2026-07-15', reason: 'correção' }).ok, true);
    assert.equal(validateMovement({ kind: 'adjustment', amountCents: 0, currency: 'BRL', occurredOn: '2026-07-15', reason: 'x' }).ok, false);
  });
});

describe('a validação da transferência', () => {
  const hoje = '2026-07-30';

  test('transferência boa passa', () => {
    const r = validateTransfer({ fromAccountId: 'a', toAccountId: 'b', amountCents: 50000, occurredOn: '2026-07-15' }, hoje);
    assert.equal(r.ok, true);
  });

  test('⭐ contas iguais é recusado', () => {
    const r = validateTransfer({ fromAccountId: 'a', toAccountId: 'a', amountCents: 50000, occurredOn: '2026-07-15' }, hoje);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'toAccountId'));
  });

  test('valor não-positivo é recusado', () => {
    const r = validateTransfer({ fromAccountId: 'a', toAccountId: 'b', amountCents: 0, occurredOn: '2026-07-15' }, hoje);
    assert.equal(r.ok, false);
  });

  test('⭐ data futura é recusada — transferência não é agendamento', () => {
    const r = validateTransfer({ fromAccountId: 'a', toAccountId: 'b', amountCents: 50000, occurredOn: '2026-08-15' }, hoje);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'occurredOn'));
  });
});
