import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewVuln, orderBySeverity, requiresResolution } from './vuln.ts';
import type { Vulnerability } from './types.ts';

function vuln(over: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: 'v1',
    title: 'XSS refletido',
    description: 'entrada não sanitizada no formulário de busca',
    affectedSystem: 'portal do cliente',
    severity: 3,
    remediationPlan: '',
    incidentId: null,
    status: 'open',
    resolution: '',
    ...over,
  };
}

describe('validateNewVuln — uma vulnerabilidade nova', () => {
  test('uma vulnerabilidade boa passa, nasce open, com id vazio e sem resposta', () => {
    const r = validateNewVuln({
      title: '  SQL injection no login  ',
      description: '  parâmetro user concatenado direto na query  ',
      affectedSystem: '  API de autenticação  ',
      severity: 5,
      remediationPlan: '  usar prepared statements  ',
      incidentId: '  inc-9  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.title, 'SQL injection no login');
      assert.equal(r.value.description, 'parâmetro user concatenado direto na query');
      assert.equal(r.value.affectedSystem, 'API de autenticação');
      assert.equal(r.value.severity, 5);
      assert.equal(r.value.remediationPlan, 'usar prepared statements');
      assert.equal(r.value.incidentId, 'inc-9');
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.resolution, '');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ sistema afetado, plano de remediação e incidente são OPCIONAIS', () => {
    const r = validateNewVuln({ title: 'CVE genérica', description: 'dependência desatualizada', severity: 2 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.affectedSystem, '');
      assert.equal(r.value.remediationPlan, '');
      assert.equal(r.value.incidentId, null);
    }
  });

  test('sem título: recusado, com o campo apontado', () => {
    for (const title of [undefined, null, '', '   ', 42]) {
      const r = validateNewVuln({ title, description: 'algo', severity: 3 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
    }
  });

  test('sem descrição: recusado, com o campo apontado', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewVuln({ title: 'algo', description, severity: 3 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });

  test('⭐ severidade fora de 1..5, meio-ponto ou não-número: recusada', () => {
    for (const severity of [0, 6, -1, 2.5, '3', undefined, null, NaN]) {
      const r = validateNewVuln({ title: 'algo', description: 'desvio', severity });
      assert.equal(r.ok, false, `severity=${String(severity)} devia ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'severity'));
    }
  });

  test('⭐ severidade 1..5 inteira: aceita nos extremos', () => {
    for (const severity of [1, 2, 3, 4, 5]) {
      const r = validateNewVuln({ title: 'algo', description: 'desvio', severity });
      assert.equal(r.ok, true, `severity=${severity} devia passar`);
      if (r.ok) assert.equal(r.value.severity, severity);
    }
  });
});

describe('orderBySeverity — a leitura', () => {
  test('vivas primeiro (abertas, depois em progresso); dentro, mais severa primeiro', () => {
    const lista = [
      vuln({ id: 'rem', status: 'remediated', severity: 5 }),
      vuln({ id: 'aberta-baixa', status: 'open', severity: 1 }),
      vuln({ id: 'aberta-alta', status: 'open', severity: 5 }),
      vuln({ id: 'progresso', status: 'in_progress', severity: 4 }),
    ];
    assert.deepEqual(orderBySeverity(lista).map((v) => v.id), [
      'aberta-alta',
      'aberta-baixa',
      'progresso',
      'rem',
    ]);
  });

  test('empate de severidade desfeito pelo título', () => {
    const lista = [
      vuln({ id: 'z', title: 'Zeta', status: 'open', severity: 3 }),
      vuln({ id: 'a', title: 'Alfa', status: 'open', severity: 3 }),
    ];
    assert.deepEqual(orderBySeverity(lista).map((v) => v.id), ['a', 'z']);
  });
});

describe('requiresResolution — encerrar exige a resposta escrita', () => {
  test('⭐⭐ chegar a um terminal exige resolução; avançar/reavaliar não', () => {
    assert.equal(requiresResolution('in_progress', 'remediated'), true);
    assert.equal(requiresResolution('in_progress', 'accepted_risk'), true);
    assert.equal(requiresResolution('open', 'accepted_risk'), true);
    assert.equal(requiresResolution('open', 'in_progress'), false);
    assert.equal(requiresResolution('in_progress', 'open'), false);
  });

  test('o no-op (mesmo estado) não exige resolução', () => {
    assert.equal(requiresResolution('remediated', 'remediated'), false);
    assert.equal(requiresResolution('open', 'open'), false);
  });
});
