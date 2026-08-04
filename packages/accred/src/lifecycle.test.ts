import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransitionCredential,
  whyCannotCheckIn,
} from './accred.ts';
import type { Credential } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0109_accred.sql');
const MIGRATION_TRAIN = resolve(HERE, '../../../supabase/migrations/0050_train.sql');

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

describe('⭐ o ciclo da CREDENCIAL — active ↔ revoked, a credencial volta', () => {
  test('active ↔ revoked existem; nenhum outro par', () => {
    assert.equal(canTransitionCredential('active', 'revoked'), true);
    assert.equal(canTransitionCredential('revoked', 'active'), true);
    assert.equal(canTransitionCredential('active', 'active'), false);
    assert.equal(canTransitionCredential('revoked', 'revoked'), false);
  });

  test('accred.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'accred.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, ALLOWED_TRANSITIONS.length, 'o SQL e o TS têm o mesmo número de pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐ o portão: só credencial ATIVA passa', () => {
  test('credencial ativa passa; revogada é recusa clara', () => {
    assert.equal(whyCannotCheckIn(credencial({ status: 'active' })), null);
    assert.match(whyCannotCheckIn(credencial({ status: 'revoked' }))!, /ativa/);
  });
});

describe('⭐ o CONTRASTE accred×train: a mesma física do cadastro→presença; o DIVERGE do fim', () => {
  test('o train tem o gate de publicação e a presença como ato — o accred reaproveita a física no portão', () => {
    const train = readFileSync(MIGRATION_TRAIN, 'utf8');
    const accred = readFileSync(MIGRATION, 'utf8');

    // O train: presença carimbada pelo servidor.
    assert.match(train, /train\.attendance\.recorded/);

    // O accred: o check-in é carimbado pelo servidor no portão.
    assert.match(accred, /accred\.checkin\.recorded/);
    assert.match(accred, /check-in só com credencial ATIVA/);
  });

  test('⭐ o DIVERGE: o check-in do accred NÃO vai além da presença — não existe "completed"', () => {
    const accred = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    // O train tem attended → completed; o accred não tem essa máquina no ato —
    // o check-in é fato pontual imutável, sem ciclo (a física do vis).
    assert.doesNotMatch(accred, /'completed'/);
    assert.doesNotMatch(accred, /allowed_checkin_transition/);
    // e a credencial tem ciclo — mas active↔revoked, não a do evento.
    assert.match(accred, /accred\.allowed_transition/);
  });
});
