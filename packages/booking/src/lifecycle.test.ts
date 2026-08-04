import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canReschedule,
  canTransition,
  isTerminal,
  orderBookings,
  requiresReason,
  summarize,
} from './booking.ts';
import type { Booking } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0112_booking.sql');
const MIGRATION_APPOINTMENT = resolve(HERE, '../../../supabase/migrations/0101_appointment.sql');

function agendamento(over: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    clientId: null,
    clientName: 'Cliente Alfa',
    professionalId: null,
    service: 'corte',
    scheduledAt: '2026-08-10T14:00:00Z',
    status: 'scheduled',
    cancelReason: '',
    ...over,
  };
}

describe('⭐ o ciclo — scheduled → attended | no_show | cancelled (a física do no-show)', () => {
  test('⭐ os três desfechos terminais, e nada mais', () => {
    assert.equal(canTransition('scheduled', 'attended'), true);
    assert.equal(canTransition('scheduled', 'no_show'), true);
    assert.equal(canTransition('scheduled', 'cancelled'), true);
    // Os fins são terminais — nenhuma saída dali.
    assert.equal(canTransition('attended', 'scheduled'), false);
    assert.equal(canTransition('cancelled', 'scheduled'), false);
    assert.equal(canTransition('no_show', 'attended'), false);
    assert.equal(isTerminal('attended'), true);
    assert.equal(isTerminal('no_show'), true);
    assert.equal(isTerminal('cancelled'), true);
    assert.equal(isTerminal('scheduled'), false);
    assert.equal(canReschedule('scheduled'), true);
    assert.equal(canReschedule('attended'), false);
    assert.equal(requiresReason('cancelled'), true);
    assert.equal(requiresReason('no_show'), false);
    assert.equal(ALLOWED_TRANSITIONS.length, 3);
  });

  test('a agenda lê os agendados primeiro, depois por horário', () => {
    const ordenado = orderBookings([
      agendamento({ id: 'c', status: 'attended', scheduledAt: '2026-08-09T10:00:00Z' }),
      agendamento({ id: 'b', status: 'scheduled', scheduledAt: '2026-08-10T16:00:00Z' }),
      agendamento({ id: 'a', status: 'scheduled', scheduledAt: '2026-08-10T09:00:00Z' }),
    ]);
    assert.deepEqual(ordenado.map((b) => b.id), ['a', 'b', 'c']);
  });

  test('o resumo conta por estado sem inventar número', () => {
    const r = summarize([
      agendamento({ status: 'scheduled' }),
      agendamento({ id: 'b2', status: 'attended' }),
      agendamento({ id: 'b3', status: 'no_show' }),
      agendamento({ id: 'b4', status: 'cancelled' }),
      agendamento({ id: 'b5', status: 'scheduled' }),
    ]);
    assert.deepEqual(r, { total: 5, scheduled: 2, attended: 1, noShow: 1, cancelled: 1 });
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

  test('booking.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'booking.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, ALLOWED_TRANSITIONS.length);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐ o contraste booking×appointment: a MESMA física de no-show, o DIVERGE de propósito', () => {
  const bookingCode = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
  const appointmentCode = readFileSync(MIGRATION_APPOINTMENT, 'utf8').replace(/--[^\n]*/g, '');

  test('os dois têm a MESMA máquina de estados: scheduled → attended | no_show | cancelled', () => {
    for (const code of [bookingCode, appointmentCode]) {
      assert.match(code, /\(\s*'scheduled'\s*,\s*'attended'\s*\)/);
      assert.match(code, /\(\s*'scheduled'\s*,\s*'no_show'\s*\)/);
      assert.match(code, /\(\s*'scheduled'\s*,\s*'cancelled'\s*\)/);
    }
  });

  test('⭐⭐ o DIVERGE: booking NÃO tem trilha de leitura clínica (não é PHI)', () => {
    // O appointment é da Saúde; o booking é da Beleza — agendar um corte não é
    // ato de saúde. Sem access_log, sem read_*().
    assert.doesNotMatch(bookingCode, /access_log/i);
    assert.doesNotMatch(bookingCode, /create\s+or\s+replace\s+function\s+booking\.read_/i);
  });

  test('⭐ o DIVERGE: o cliente é do crm (client), não um paciente (patient); e o serviço é texto livre', () => {
    assert.match(bookingCode, /client_id\s+uuid/);
    assert.match(bookingCode, /service\s+text/);
    assert.doesNotMatch(bookingCode, /patient_id/);
    // Serviço é TEXTO LIVRE — nenhum enum/type de serviço.
    assert.doesNotMatch(bookingCode, /create\s+type\s+booking\./i);
  });

  test('nenhum dos dois lê schema alheio — cliente e profissional por id solto', () => {
    assert.doesNotMatch(bookingCode, /references\s+crm\./i);
    assert.doesNotMatch(bookingCode, /references\s+professional\./i);
  });
});
