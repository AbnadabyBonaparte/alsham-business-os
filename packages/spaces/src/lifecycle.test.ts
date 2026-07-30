import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canCancel,
  canEditReservation,
  canTransition,
  findConflict,
  orderAgenda,
  overlaps,
  whyCannotBook,
  whyCannotCancel,
} from './spaces.ts';
import type { Reservation, Space } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0035_spc.sql');
const MIGRATION_CASH = resolve(HERE, '../../../supabase/migrations/0029_cash.sql');

function sala(over: Partial<Space> = {}): Space {
  return {
    id: 's1',
    name: 'Sala de reunião 1',
    description: '',
    capacity: 8,
    status: 'active',
    ...over,
  };
}

function reserva(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    spaceId: 's1',
    purpose: 'reunião de diretoria',
    startsAt: '2026-07-30T10:00:00Z',
    endsAt: '2026-07-30T12:00:00Z',
    status: 'booked',
    cancelledAt: null,
    cancelReason: '',
    ...over,
  };
}

describe('⭐ a física — dois usos não ocupam o mesmo espaço ao mesmo tempo', () => {
  test('⭐ períodos que se cruzam conflitam', () => {
    assert.equal(overlaps('2026-07-30T10:00', '2026-07-30T12:00', '2026-07-30T11:00', '2026-07-30T13:00'), true);
    assert.equal(overlaps('2026-07-30T11:00', '2026-07-30T13:00', '2026-07-30T10:00', '2026-07-30T12:00'), true);
  });

  test('⭐ MEIO-ABERTO: terminar às 12h e começar às 12h convivem', () => {
    assert.equal(overlaps('2026-07-30T10:00', '2026-07-30T12:00', '2026-07-30T12:00', '2026-07-30T14:00'), false);
  });

  test('⭐ a cancelada LIBEROU o período — ela não conflita', () => {
    const cancelada = reserva({ status: 'cancelled', cancelledAt: 'x', cancelReason: 'desmarcaram' });
    assert.equal(findConflict('s1', '2026-07-30T10:30:00Z', '2026-07-30T11:00:00Z', [cancelada]), null);
  });

  test('o mesmo horário em OUTRO espaço não conflita', () => {
    assert.equal(findConflict('s2', '2026-07-30T10:00:00Z', '2026-07-30T12:00:00Z', [reserva()]), null);
  });

  test('a recusa chega com nome — antes de virar erro de constraint', () => {
    assert.match(
      whyCannotBook(sala(), '2026-07-30T11:00:00Z', '2026-07-30T13:00:00Z', [reserva()])!,
      /cruza com outra reserva/,
    );
    assert.equal(
      whyCannotBook(sala(), '2026-07-30T12:00:00Z', '2026-07-30T14:00:00Z', [reserva()]),
      null,
    );
  });

  test('espaço arquivado não recebe reserva nova; período vazio idem', () => {
    assert.match(whyCannotBook(sala({ status: 'archived' }), 'a', 'b', [])!, /fora de uso/);
    assert.match(whyCannotBook(sala(), '2026-07-30T12:00', '2026-07-30T12:00', [])!, /vazio/);
    assert.match(whyCannotBook(undefined, 'a', 'b', [])!, /não existe/);
  });
});

describe('⭐ o ciclo — cancelar é terminal, com razão', () => {
  test('⭐ UM par só: booked → cancelled', () => {
    assert.equal(ALLOWED_TRANSITIONS.length, 1);
    assert.equal(canTransition('booked', 'cancelled'), true);
    assert.equal(canTransition('cancelled', 'booked'), false);
    assert.equal(canCancel('cancelled'), false);
    assert.equal(canEditReservation('cancelled'), false);
  });

  test('cancelar exige a razão escrita', () => {
    assert.match(whyCannotCancel(reserva(), '')!, /razão/);
    assert.equal(whyCannotCancel(reserva(), 'a diretoria desmarcou'), null);
    assert.match(whyCannotCancel(reserva({ status: 'cancelled' }), 'x')!, /reserva de novo/);
  });

  test('a agenda lê na ordem do tempo; canceladas por último', () => {
    const ordenada = orderAgenda([
      reserva({ id: 'c', status: 'cancelled', cancelledAt: 'x', cancelReason: 'y', startsAt: '2026-07-30T08:00:00Z' }),
      reserva({ id: 'b', startsAt: '2026-07-30T14:00:00Z' }),
      reserva({ id: 'a', startsAt: '2026-07-30T09:00:00Z' }),
    ]);
    assert.deepEqual(ordenada.map((r) => r.id), ['a', 'b', 'c']);
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
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

  test('spc.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'spc.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 1, 'o SQL declara um par só');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ A FÍSICA mora na CONSTRAINT, não em `if` de aplicação — e é parcial:
   * a cancelada libera o período por definição. Se a exclusion sumir, este
   * teste morde antes do primeiro conflito de produção.
   */
  test('⭐ a exclusion constraint existe, é parcial e o gist tem btree_gist', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /exclude using gist \(\s*space_id with =,\s*tstzrange\(starts_at, ends_at\) with &&\s*\) where \(status = 'booked'\)/);
    assert.match(sql, /create extension if not exists btree_gist/);
  });

  /**
   * ⭐ O DIVERGE consciente do cash: lá o FUTURO é recusado (caixa é
   * realizado; previsão é Orçamento); aqui o PASSADO é permitido (registrar
   * o uso que já aconteceu é fato consumado) e o futuro é o ofício. Se um
   * dos lados mudar, este teste obriga a re-perguntar.
   */
  test('⭐ o contraste cash×spc: o cash recusa o futuro; a agenda aceita o passado', () => {
    const cash = readFileSync(MIGRATION_CASH, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(cash, /current_date/, 'o cash deixou de recusar o futuro — re-pergunte o contraste');
    const spc = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(
      spc,
      /starts_at\s*>=?\s*(now\(\)|current_date)/,
      'apareceu trava de passado na reserva — o uso já ocorrido é fato consumado',
    );
  });
});
