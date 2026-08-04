import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeCredentials,
  validateNewCheckin,
  validateNewCredential,
} from './accred.ts';
import type { Credential } from './types.ts';

function credencial(over: Partial<Credential> = {}): Credential {
  return {
    id: 'c1',
    eventId: 'ev1',
    holderName: 'Ana Participante',
    credentialType: 'participante',
    accessLevel: '',
    status: 'active',
    ...over,
  };
}

describe('validateNewCredential', () => {
  test('o mínimo honesto: evento, portador e tipo', () => {
    const r = validateNewCredential({
      eventId: 'ev1',
      holderName: 'Ana Participante',
      credentialType: 'imprensa',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.accessLevel, '');
    }
  });

  test('⛔ sem evento, portador ou tipo não emite', () => {
    assert.equal(validateNewCredential({ holderName: 'Ana', credentialType: 'staff' }).ok, false);
    assert.equal(validateNewCredential({ eventId: 'ev1', credentialType: 'staff' }).ok, false);
    assert.equal(validateNewCredential({ eventId: 'ev1', holderName: 'Ana' }).ok, false);
  });

  test('nível de acesso é opcional, texto livre', () => {
    const r = validateNewCredential({
      eventId: 'ev1',
      holderName: 'Ana',
      credentialType: 'vip',
      accessLevel: 'backstage',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.accessLevel, 'backstage');
  });

  test('nasce sempre active', () => {
    const r = validateNewCredential({ eventId: 'ev1', holderName: 'Ana', credentialType: 'participante' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.status, 'active');
  });
});

describe('validateNewCheckin', () => {
  test('o mínimo honesto: só a credencial', () => {
    const r = validateNewCheckin({ credentialId: 'c1' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.note, '');
      // ⭐ o carimbo fica vazio: é do servidor, nunca da tela
      assert.equal(r.value.checkedInAt, '');
    }
  });

  test('⛔ sem credencial não registra check-in', () => {
    assert.equal(validateNewCheckin({}).ok, false);
    assert.equal(validateNewCheckin({ credentialId: '   ' }).ok, false);
  });

  test('a nota é opcional', () => {
    const r = validateNewCheckin({ credentialId: 'c1', note: 'chegou pelo portão B' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.note, 'chegou pelo portão B');
  });
});

describe('summarizeCredentials', () => {
  test('conta as credenciais por estado sem inventar número', () => {
    const r = summarizeCredentials([
      credencial({ status: 'active' }),
      credencial({ id: 'c2', status: 'revoked' }),
      credencial({ id: 'c3', status: 'active' }),
    ]);
    assert.deepEqual(r, { total: 3, active: 2, revoked: 1 });
  });
});
