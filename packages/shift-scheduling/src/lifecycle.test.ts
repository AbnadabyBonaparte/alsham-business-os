import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canCancel,
  canEditSchedule,
  canTransition,
  findConflict,
  orderSchedules,
  overlaps,
  whyCannotCancel,
  whyCannotSchedule,
} from './shift.ts';
import type { Schedule } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0049_shift.sql');
const MIGRATION_SPC = resolve(HERE, '../../../supabase/migrations/0035_spc.sql');

function escala(over: Partial<Schedule> = {}): Schedule {
  return {
    id: 's1',
    employeeId: 'ee000000-0000-4000-8000-000000000001',
    employeeName: 'Ana Vendedora',
    shiftLabel: 'Manhã',
    startsAt: '2026-07-30T08:00:00Z',
    endsAt: '2026-07-30T12:00:00Z',
    status: 'scheduled',
    cancelledAt: null,
    cancelReason: '',
    ...over,
  };
}

describe('⭐ a física — o mesmo colaborador não roda dois turnos ao mesmo tempo', () => {
  test('⭐ períodos que se cruzam conflitam', () => {
    assert.equal(overlaps('2026-07-30T08:00', '2026-07-30T12:00', '2026-07-30T10:00', '2026-07-30T14:00'), true);
    assert.equal(overlaps('2026-07-30T10:00', '2026-07-30T14:00', '2026-07-30T08:00', '2026-07-30T12:00'), true);
  });

  test('⭐ MEIO-ABERTO: terminar às 12h e começar às 12h convivem', () => {
    assert.equal(overlaps('2026-07-30T08:00', '2026-07-30T12:00', '2026-07-30T12:00', '2026-07-30T16:00'), false);
  });

  test('⭐ a cancelada LIBEROU o período — ela não conflita', () => {
    const cancelada = escala({ status: 'cancelled', cancelledAt: 'x', cancelReason: 'trocou de turno' });
    assert.equal(
      findConflict(cancelada.employeeId, '2026-07-30T09:00:00Z', '2026-07-30T10:00:00Z', [cancelada]),
      null,
    );
  });

  test('o mesmo horário em OUTRO colaborador não conflita', () => {
    assert.equal(
      findConflict('ee000000-0000-4000-8000-000000000002', '2026-07-30T08:00:00Z', '2026-07-30T12:00:00Z', [escala()]),
      null,
    );
  });

  test('a recusa chega com nome — antes de virar erro de constraint', () => {
    assert.match(
      whyCannotSchedule(
        'ee000000-0000-4000-8000-000000000001',
        'Ana Vendedora',
        'Tarde',
        '2026-07-30T10:00:00Z',
        '2026-07-30T14:00:00Z',
        [escala()],
      )!,
      /cruza com outra escala/,
    );
    assert.equal(
      whyCannotSchedule(
        'ee000000-0000-4000-8000-000000000001',
        'Ana Vendedora',
        'Tarde',
        '2026-07-30T12:00:00Z',
        '2026-07-30T16:00:00Z',
        [escala()],
      ),
      null,
    );
  });

  test('faltando colaborador, nome, turno ou período vazio — recusa nomeada', () => {
    assert.match(whyCannotSchedule('', 'Ana', 'Manhã', '2026-07-30T08:00', '2026-07-30T12:00', [])!, /colaborador/);
    assert.match(whyCannotSchedule('id', '', 'Manhã', '2026-07-30T08:00', '2026-07-30T12:00', [])!, /nome/);
    assert.match(whyCannotSchedule('id', 'Ana', '', '2026-07-30T08:00', '2026-07-30T12:00', [])!, /turno/);
    assert.match(whyCannotSchedule('id', 'Ana', 'Manhã', '2026-07-30T12:00', '2026-07-30T12:00', [])!, /vazio/);
  });
});

describe('⭐ o ciclo — cancelar é terminal, com razão', () => {
  test('⭐ UM par só: scheduled → cancelled', () => {
    assert.equal(ALLOWED_TRANSITIONS.length, 1);
    assert.equal(canTransition('scheduled', 'cancelled'), true);
    assert.equal(canTransition('cancelled', 'scheduled'), false);
    assert.equal(canCancel('cancelled'), false);
    assert.equal(canEditSchedule('cancelled'), false);
    assert.equal(canEditSchedule('scheduled'), true);
  });

  test('cancelar exige a razão escrita', () => {
    assert.match(whyCannotCancel(escala(), '')!, /razão/);
    assert.equal(whyCannotCancel(escala(), 'colaborador pediu troca'), null);
    assert.match(whyCannotCancel(escala({ status: 'cancelled' }), 'x')!, /escala de novo/);
  });

  test('a agenda lê pelo tempo; canceladas por último', () => {
    const ordenada = orderSchedules([
      escala({ id: 'c', status: 'cancelled', cancelledAt: 'x', cancelReason: 'y', startsAt: '2026-07-30T06:00:00Z' }),
      escala({ id: 'b', startsAt: '2026-07-30T14:00:00Z' }),
      escala({ id: 'a', startsAt: '2026-07-30T08:00:00Z' }),
    ]);
    assert.deepEqual(ordenada.map((s) => s.id), ['a', 'b', 'c']);
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

  test('shift.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'shift.allowed_transition');
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
    assert.match(
      sql,
      /exclude using gist \(\s*employee_id with =,\s*tstzrange\(starts_at, ends_at\) with &&\s*\) where \(status = 'scheduled'\)/,
    );
    assert.match(sql, /create extension if not exists btree_gist/);
  });

  /**
   * ⭐ O CONTRASTE shift×spc: MESMA física (exclusion gist parcial sobre um
   * período meio-aberto), DONO diferente — o `spc` protege o ESPAÇO; o
   * `shift` protege a PESSOA. Se um dos lados perder a exclusion (ou trocar
   * a coluna do dono), este teste morde antes do primeiro conflito real.
   */
  test('⭐ o contraste shift×spc: a mesma física, dono diferente (pessoa × espaço)', () => {
    const spc = readFileSync(MIGRATION_SPC, 'utf8').replace(/--[^\n]*/g, '');
    const shift = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

    assert.match(spc, /exclude using gist \(\s*space_id with =/, 'o spc deixou de excluir por espaço — re-pergunte o contraste');
    assert.match(spc, /where \(status = 'booked'\)/);

    assert.match(shift, /exclude using gist \(\s*employee_id with =/, 'o shift não exclui por colaborador');
    assert.match(shift, /where \(status = 'scheduled'\)/);
  });

  /**
   * ⭐ O PASSADO é permitido — o MANTIDO consciente do `spc` (registrar a
   * escala que já rodou é fato consumado) e o DIVERGE consciente do `cash`
   * (que recusa o FUTURO). NÃO há trava de now()/current_date em starts_at.
   */
  test('⭐ o contraste cash×shift: o cash recusa o futuro; a escala aceita o passado', () => {
    const MIGRATION_CASH = resolve(HERE, '../../../supabase/migrations/0029_cash.sql');
    const cash = readFileSync(MIGRATION_CASH, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(cash, /current_date/, 'o cash deixou de recusar o futuro — re-pergunte o contraste');

    const shift = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(
      shift,
      /starts_at\s*>=?\s*(now\(\)|current_date)/,
      'apareceu trava de passado na escala — o turno já rodado é fato consumado',
    );
  });
});
