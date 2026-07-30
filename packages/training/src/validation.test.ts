import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeEnrollments,
  summarizeSessions,
  validateNewEnrollment,
  validateNewProgram,
  validateNewSession,
} from './training.ts';
import type { Enrollment, Session } from './types.ts';

function turma(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    programId: 'p1',
    title: 'Integração',
    startsAt: '2026-08-10T09:00:00Z',
    capacity: null,
    status: 'draft',
    ...over,
  };
}

function inscricao(over: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 'e1',
    sessionId: 's1',
    traineeId: 't1',
    traineeName: 'Ana Vendedora',
    status: 'registered',
    attendedAt: null,
    completedAt: null,
    grade: '',
    ...over,
  };
}

describe('validateNewProgram', () => {
  test('o mínimo honesto: só o nome', () => {
    const r = validateNewProgram({ name: 'Integração de Novos Colaboradores' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.description, '');
    }
  });

  test('⛔ sem nome não cadastra', () => {
    assert.equal(validateNewProgram({}).ok, false);
    assert.equal(validateNewProgram({ name: '   ' }).ok, false);
  });

  test('descrição é opcional', () => {
    const r = validateNewProgram({ name: 'X', description: 'o que a turma cobre' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.description, 'o que a turma cobre');
  });
});

describe('validateNewSession', () => {
  test('o mínimo honesto: programa, título e início', () => {
    const r = validateNewSession({ programId: 'p1', title: 'Turma 1', startsAt: '2026-08-10T09:00:00Z' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.capacity, null);
    }
  });

  test('⛔ sem programa, título ou início não cadastra', () => {
    assert.equal(validateNewSession({ title: 'X', startsAt: '2026-08-10T09:00:00Z' }).ok, false);
    assert.equal(validateNewSession({ programId: 'p1', startsAt: '2026-08-10T09:00:00Z' }).ok, false);
    assert.equal(validateNewSession({ programId: 'p1', title: 'X' }).ok, false);
  });

  test('capacidade é opcional, mas quando informada é inteiro positivo', () => {
    const semTeto = validateNewSession({ programId: 'p1', title: 'X', startsAt: '2026-08-10T09:00:00Z' });
    assert.equal(semTeto.ok, true);
    if (semTeto.ok) assert.equal(semTeto.value.capacity, null);

    const comTeto = validateNewSession({ programId: 'p1', title: 'X', startsAt: '2026-08-10T09:00:00Z', capacity: 20 });
    assert.equal(comTeto.ok, true);
    if (comTeto.ok) assert.equal(comTeto.value.capacity, 20);

    assert.equal(
      validateNewSession({ programId: 'p1', title: 'X', startsAt: '2026-08-10T09:00:00Z', capacity: 0 }).ok,
      false,
    );
    assert.equal(
      validateNewSession({ programId: 'p1', title: 'X', startsAt: '2026-08-10T09:00:00Z', capacity: -5 }).ok,
      false,
    );
  });

  test('nasce sempre draft', () => {
    const r = validateNewSession({ programId: 'p1', title: 'X', startsAt: '2026-08-10T09:00:00Z' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.status, 'draft');
  });
});

describe('validateNewEnrollment', () => {
  test('o mínimo honesto: turma, colaborador (id solto) e nome', () => {
    const r = validateNewEnrollment({ sessionId: 's1', traineeId: 't1', traineeName: 'Ana' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'registered');
      assert.equal(r.value.grade, '');
      assert.equal(r.value.attendedAt, null);
      assert.equal(r.value.completedAt, null);
    }
  });

  test('⛔ sem turma, sem id do colaborador ou sem nome não inscreve', () => {
    assert.equal(validateNewEnrollment({ traineeId: 't1', traineeName: 'Ana' }).ok, false);
    assert.equal(validateNewEnrollment({ sessionId: 's1', traineeName: 'Ana' }).ok, false);
    assert.equal(validateNewEnrollment({ sessionId: 's1', traineeId: 't1' }).ok, false);
  });

  test('nasce sempre registered, sem carimbo nenhum', () => {
    const r = validateNewEnrollment({ sessionId: 's1', traineeId: 't1', traineeName: 'Ana' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.status, 'registered');
  });
});

describe('summarizeSessions', () => {
  test('conta as turmas por estado sem inventar número', () => {
    const r = summarizeSessions([
      turma({ status: 'draft' }),
      turma({ id: 's2', status: 'published' }),
      turma({ id: 's3', status: 'concluded' }),
      turma({ id: 's4', status: 'cancelled' }),
      turma({ id: 's5', status: 'published' }),
    ]);
    assert.deepEqual(r, { total: 5, draft: 1, published: 2, concluded: 1, cancelled: 1 });
  });
});

describe('summarizeEnrollments', () => {
  test('conta as inscrições por estado sem inventar número', () => {
    const r = summarizeEnrollments([
      inscricao({ status: 'registered' }),
      inscricao({ id: 'e2', status: 'attended' }),
      inscricao({ id: 'e3', status: 'completed', grade: 'aprovado' }),
      inscricao({ id: 'e4', status: 'cancelled' }),
      inscricao({ id: 'e5', status: 'registered' }),
    ]);
    assert.deepEqual(r, { total: 5, registered: 2, attended: 1, completed: 1, cancelled: 1 });
  });
});
