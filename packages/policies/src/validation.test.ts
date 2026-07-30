import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { nextVersionNo, summarizePolicies, validateNewPolicy, validateNewVersion, whyCannotPublish } from './policies.ts';
import type { Policy, PolicyVersion } from './types.ts';

function politica(over: Partial<Policy> = {}): Policy {
  return { id: 'p1', name: 'Política de Home Office', status: 'active', ...over };
}

function versao(over: Partial<PolicyVersion> = {}): PolicyVersion {
  return {
    id: 'v1',
    policyId: 'p1',
    versionNo: 1,
    body: '',
    status: 'draft',
    publishedAt: null,
    ...over,
  };
}

describe('validateNewPolicy', () => {
  test('o mínimo honesto: o nome', () => {
    const r = validateNewPolicy({ name: 'Código de Conduta' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.name, 'Código de Conduta');
    }
  });

  test('⛔ sem nome não há política', () => {
    const r = validateNewPolicy({});
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });
});

describe('validateNewVersion — o corpo é OPCIONAL no rascunho', () => {
  test('nasce no rascunho, sem corpo (pode vir depois)', () => {
    const r = validateNewVersion({ policyId: 'p1' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.body, '');
      assert.equal(r.value.publishedAt, null);
    }
  });

  test('⛔ sem policyId não há versão', () => {
    const r = validateNewVersion({ body: 'texto' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'policyId'));
  });

  test('⭐ o versionNo é sempre 0 na validação — o servidor calcula, nunca a tela', () => {
    const r = validateNewVersion({ policyId: 'p1', body: 'x' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.versionNo, 0);
  });
});

describe('whyCannotPublish — a régua que a tela consome antes do erro de banco', () => {
  test('publicar exige corpo', () => {
    assert.match(whyCannotPublish(versao({ body: '' }))!, /não vale/);
    assert.equal(whyCannotPublish(versao({ body: 'Uso individual do notebook.' })), null);
  });

  test('só o rascunho publica', () => {
    assert.notEqual(whyCannotPublish(versao({ status: 'published', publishedAt: 'x', body: 'x' })), null);
    assert.notEqual(whyCannotPublish(versao({ status: 'archived', publishedAt: 'x', body: 'x' })), null);
  });
});

describe('nextVersionNo', () => {
  test('a primeira versão de uma política nova é 1', () => {
    assert.equal(nextVersionNo([]), 1);
  });

  test('cresce por cima do maior número já usado', () => {
    assert.equal(nextVersionNo([1]), 2);
    assert.equal(nextVersionNo([1, 2]), 3);
  });
});

describe('summarizePolicies', () => {
  test('conta o catálogo sem inventar número', () => {
    const r = summarizePolicies([
      politica({ status: 'active' }),
      politica({ id: 'p2', status: 'archived' }),
      politica({ id: 'p3', status: 'active' }),
    ]);
    assert.deepEqual(r, { totalPolicies: 3, activePolicies: 2, archivedPolicies: 1 });
  });
});
