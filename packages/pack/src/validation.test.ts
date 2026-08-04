import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, validateNewPackage, validateNewUse } from './pack.ts';
import type { Package } from './types.ts';

function pacote(over: Partial<Package> = {}): Package {
  return {
    id: 'p1',
    clientId: 'crm-1',
    clientName: 'Cliente Fiel',
    service: 'corte de cabelo',
    totalSessions: 10,
    note: '',
    ...over,
  };
}

describe('validateNewPackage', () => {
  test('o mínimo honesto: cliente (id solto), serviço e total de sessões', () => {
    const r = validateNewPackage({ clientId: 'crm-1', service: 'massagem', totalSessions: 5 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.clientId, 'crm-1');
      assert.equal(r.value.service, 'massagem');
      assert.equal(r.value.totalSessions, 5);
      assert.equal(r.value.clientName, '');
    }
  });

  test('⛔ sem clientId, sem service ou sem totalSessions não registra', () => {
    assert.equal(validateNewPackage({ service: 'massagem', totalSessions: 5 }).ok, false);
    assert.equal(validateNewPackage({ clientId: 'crm-1', totalSessions: 5 }).ok, false);
    assert.equal(validateNewPackage({ clientId: 'crm-1', service: 'massagem' }).ok, false);
    assert.equal(validateNewPackage({}).ok, false);
  });

  test('⛔ total de sessões precisa ser inteiro > 0 (zero ou negativo não é pacote)', () => {
    assert.equal(validateNewPackage({ clientId: 'c', service: 's', totalSessions: 0 }).ok, false);
    assert.equal(validateNewPackage({ clientId: 'c', service: 's', totalSessions: -3 }).ok, false);
    assert.equal(validateNewPackage({ clientId: 'c', service: 's', totalSessions: 2.5 }).ok, false);
    assert.equal(validateNewPackage({ clientId: 'c', service: 's', totalSessions: 'muitas' }).ok, false);
  });

  test('o serviço é TEXTO LIVRE — o sistema não conhece "corte/massagem"', () => {
    const r = validateNewPackage({ clientId: 'c', service: 'sessão de laser facial', totalSessions: 8 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.service, 'sessão de laser facial');
  });
});

describe('validateNewUse', () => {
  test('o mínimo honesto: pacote e data do uso', () => {
    const r = validateNewUse({ packageId: 'p1', usedOn: '2026-08-04' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.packageId, 'p1');
      assert.equal(r.value.usedOn, '2026-08-04');
    }
  });

  test('⛔ sem packageId ou sem data não registra; data mal formada recusa', () => {
    assert.equal(validateNewUse({ usedOn: '2026-08-04' }).ok, false);
    assert.equal(validateNewUse({ packageId: 'p1' }).ok, false);
    assert.equal(validateNewUse({ packageId: 'p1', usedOn: '04/08/2026' }).ok, false);
  });
});

describe('summarize', () => {
  test('conta pacotes e soma as sessões vendidas', () => {
    const s = summarize([pacote(), pacote({ totalSessions: 4 })]);
    assert.equal(s.total, 2);
    assert.equal(s.totalSessions, 14);
  });

  test('lista vazia', () => {
    const s = summarize([]);
    assert.equal(s.total, 0);
    assert.equal(s.totalSessions, 0);
  });
});
