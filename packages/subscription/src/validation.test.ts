import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canCancel,
  canTransition,
  summarizeSubscriptions,
  validateCancellation,
  validateNewSubscription,
} from './subscription.ts';
import type { Subscription } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0097_subscription.sql');
const migrationCode = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

describe('o ciclo de vida da assinatura — active → cancelled TERMINAL (a física do proj)', () => {
  test('active → cancelled é a ÚNICA transição', () => {
    assert.ok(canTransition('active', 'cancelled'));
    // ⭐ TERMINAL: a cancelada NÃO volta a ativa — quem re-assina assina outra.
    assert.ok(!canTransition('cancelled', 'active'));
    // idempotência
    assert.ok(canTransition('active', 'active'));
    assert.equal(ALLOWED_TRANSITIONS.length, 1);
  });

  test('⭐ o espelho bate com o allowed_transition do banco — só um par, sem volta', () => {
    // o banco tem exatamente este par
    assert.match(migrationCode, /\('active',\s*'cancelled'\)/);
    // ⭐ e NÃO tem a volta (a física do proj — o DIVERGE do catalog)
    assert.doesNotMatch(migrationCode, /\('cancelled',\s*'active'\)/);
  });

  test('só a ativa cancela; a cancelada é terminal', () => {
    assert.ok(canCancel('active'));
    assert.ok(!canCancel('cancelled'));
  });

  test('o resumo conta ativas e canceladas', () => {
    const subs: Subscription[] = [
      { id: '1', customerId: 'c1', customerName: '', plantId: 'p1', plantName: '', allocationPercent: 10, status: 'active', cancelReason: '' },
      { id: '2', customerId: 'c2', customerName: '', plantId: 'p1', plantName: '', allocationPercent: 20, status: 'cancelled', cancelReason: 'saiu' },
      { id: '3', customerId: 'c3', customerName: '', plantId: 'p2', plantName: '', allocationPercent: 5, status: 'active', cancelReason: '' },
    ];
    assert.deepEqual(summarizeSubscriptions(subs), { total: 3, active: 2, cancelled: 1 });
  });
});

describe('a validação da assinatura nova', () => {
  test('cliente e usina obrigatórios, alocação 0<x<=100; nomes opcionais', () => {
    const ok = validateNewSubscription({ customerId: 'c-1', plantId: 'u-1', allocationPercent: 42.5 });
    assert.ok(ok.ok);
    if (ok.ok) {
      assert.equal(ok.value.customerId, 'c-1');
      assert.equal(ok.value.plantId, 'u-1');
      assert.equal(ok.value.allocationPercent, 42.5);
      assert.equal(ok.value.customerName, '');
      assert.equal(ok.value.plantName, '');
      assert.equal(ok.value.status, 'active');
      assert.equal(ok.value.cancelReason, '');
      assert.equal(ok.value.id, '');
    }
  });

  test('a alocação 0 < x <= 100 é exigida — 0, 101 e -1 são recusados', () => {
    const zero = validateNewSubscription({ customerId: 'c', plantId: 'u', allocationPercent: 0 });
    assert.ok(!zero.ok);
    const cem1 = validateNewSubscription({ customerId: 'c', plantId: 'u', allocationPercent: 101 });
    assert.ok(!cem1.ok);
    const neg = validateNewSubscription({ customerId: 'c', plantId: 'u', allocationPercent: -1 });
    assert.ok(!neg.ok);
    const naoNum = validateNewSubscription({ customerId: 'c', plantId: 'u', allocationPercent: 'x' });
    assert.ok(!naoNum.ok);
  });

  test('100 é permitido (a fatia inteira da geração)', () => {
    const cheio = validateNewSubscription({ customerId: 'c', plantId: 'u', allocationPercent: 100 });
    assert.ok(cheio.ok);
  });

  test('sem cliente não passa', () => {
    const semCliente = validateNewSubscription({ plantId: 'u', allocationPercent: 10 });
    assert.ok(!semCliente.ok);
    if (!semCliente.ok) assert.ok(semCliente.problems.some((p) => p.field === 'customerId'));
  });

  test('sem usina não passa', () => {
    const semUsina = validateNewSubscription({ customerId: 'c', allocationPercent: 10 });
    assert.ok(!semUsina.ok);
    if (!semUsina.ok) assert.ok(semUsina.problems.some((p) => p.field === 'plantId'));
  });
});

describe('a validação do cancelamento — cancelar exige razão (a física do proj)', () => {
  test('razão não-vazia passa', () => {
    const ok = validateCancellation('cliente migrou de distribuidora');
    assert.ok(ok.ok);
    if (ok.ok) assert.equal(ok.value, 'cliente migrou de distribuidora');
  });

  test('razão vazia ou só espaços é recusada', () => {
    assert.ok(!validateCancellation('').ok);
    assert.ok(!validateCancellation('   ').ok);
    assert.ok(!validateCancellation(undefined).ok);
  });
});
