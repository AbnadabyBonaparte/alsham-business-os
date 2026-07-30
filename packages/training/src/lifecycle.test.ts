import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ENROLLMENT_TRANSITIONS,
  SESSION_TRANSITIONS,
  canTransitionEnrollment,
  canTransitionSession,
  isEnrollmentTerminal,
  isSessionTerminal,
  whyCannotEnroll,
  whyCannotRecordAttendance,
} from './training.ts';
import type { Session } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0050_train.sql');
const MIGRATION_EVT = resolve(HERE, '../../../supabase/migrations/0026_evt.sql');

function turma(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    programId: 'p1',
    title: 'Integração de Novos Colaboradores — Turma 1',
    startsAt: '2026-08-10T09:00:00Z',
    capacity: null,
    status: 'draft',
    ...over,
  };
}

function paresDoSql(caminho: string, fn: string): Set<string> {
  const sql = readFileSync(caminho, 'utf8');
  const corpo = sql.split(`create or replace function ${fn}`)[1];
  assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
  const bloco = corpo.split('$$;')[0] ?? '';
  const semComentario = bloco
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
  const pares = new Set<string>();
  for (const m of semComentario.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
    pares.add(`${m[1]}→${m[2]}`);
  }
  return pares;
}

describe('⭐ o ciclo da TURMA — a física do evt reaproveitada', () => {
  test('draft → published/cancelled; published → concluded/cancelled; concluded e cancelled são terminais', () => {
    assert.equal(canTransitionSession('draft', 'published'), true);
    assert.equal(canTransitionSession('draft', 'cancelled'), true);
    assert.equal(canTransitionSession('published', 'concluded'), true);
    assert.equal(canTransitionSession('published', 'cancelled'), true);
    assert.equal(canTransitionSession('draft', 'concluded'), false);
    assert.equal(canTransitionSession('concluded', 'published'), false);
    assert.equal(isSessionTerminal('concluded'), true);
    assert.equal(isSessionTerminal('cancelled'), true);
    assert.equal(isSessionTerminal('published'), false);
  });

  test('train.allowed_session_transition() e SESSION_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'train.allowed_session_transition');
    const doTs = new Set(SESSION_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, SESSION_TRANSITIONS.length, 'o SQL e o TS têm o mesmo número de pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐ o ciclo da INSCRIÇÃO — o DIVERGE assinado do evt', () => {
  test('registered → attended/cancelled; attended → completed/cancelled; completed e cancelled são terminais', () => {
    assert.equal(canTransitionEnrollment('registered', 'attended'), true);
    assert.equal(canTransitionEnrollment('registered', 'cancelled'), true);
    assert.equal(canTransitionEnrollment('attended', 'completed'), true);
    assert.equal(canTransitionEnrollment('attended', 'cancelled'), true);
    assert.equal(canTransitionEnrollment('registered', 'completed'), false);
    assert.equal(canTransitionEnrollment('completed', 'attended'), false);
    assert.equal(isEnrollmentTerminal('completed'), true);
    assert.equal(isEnrollmentTerminal('cancelled'), true);
    assert.equal(isEnrollmentTerminal('attended'), false);
  });

  test('train.allowed_enrollment_transition() e ENROLLMENT_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'train.allowed_enrollment_transition');
    const doTs = new Set(ENROLLMENT_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, ENROLLMENT_TRANSITIONS.length, 'o SQL e o TS têm o mesmo número de pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('só turma publicada recebe inscrição; lotação recusa clara', () => {
    assert.match(whyCannotEnroll(turma({ status: 'draft' }), 0)!, /publicada/);
    assert.equal(whyCannotEnroll(turma({ status: 'published' }), 0), null);
    assert.match(
      whyCannotEnroll(turma({ status: 'published', capacity: 1 }), 1)!,
      /LOTADA/,
    );
    assert.equal(whyCannotEnroll(turma({ status: 'published', capacity: 2 }), 1), null);
  });

  test('presença só em turma publicada ou concluída', () => {
    assert.equal(whyCannotRecordAttendance(turma({ status: 'published' })), null);
    assert.equal(whyCannotRecordAttendance(turma({ status: 'concluded' })), null);
    assert.match(whyCannotRecordAttendance(turma({ status: 'draft' }))!, /publicada ou concluída/);
  });
});

describe('⭐ o CONTRASTE train×evt: a mesma física do evento universal, aplicada ao treino', () => {
  test('o evt tem o gate de publicação e a presença como ato — o train reaproveita a MESMA física', () => {
    const evt = readFileSync(MIGRATION_EVT, 'utf8');
    const train = readFileSync(MIGRATION, 'utf8');

    // O evt: inscrição só em evento PUBLICADO; presença é evt.registration.attended.
    assert.match(evt, /inscrição só em evento PUBLICADO/);
    assert.match(evt, /evt\.registration\.attended/);

    // O train reaproveita a MESMA física, com o vocabulário da turma —
    // mas o FATO da presença muda de agregado: 'attendance', não 'enrollment'.
    assert.match(train, /inscrição só em turma PUBLICADA/);
    assert.match(train, /train\.attendance\.recorded/);
    assert.doesNotMatch(train, /train\.enrollment\.attended/);
  });

  test('⭐ o DIVERGE: a inscrição do train vai além da presença — o evt nunca teve "completed"', () => {
    const evt = readFileSync(MIGRATION_EVT, 'utf8').replace(/--[^\n]*/g, '');
    const train = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

    const corpoEvt = evt.split('evt.allowed_registration_transition')[1]?.split('$$;')[0] ?? '';
    assert.doesNotMatch(corpoEvt, /'completed'/, 'o evt não tem — e nunca teve — o estado completed');

    const corpoTrain = train.split('train.allowed_enrollment_transition')[1]?.split('$$;')[0] ?? '';
    assert.match(corpoTrain, /'attended'\s*,\s*'completed'/, 'o train precisa ter attended → completed — a assinatura do DIVERGE sumiu');
  });
});
