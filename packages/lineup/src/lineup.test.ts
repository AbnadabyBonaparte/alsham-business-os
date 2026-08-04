import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { orderSlots, summarizeLineup, validateNewSlot } from './lineup.ts';
import * as motor from './lineup.ts';
import * as tipos from './types.ts';
import type { Slot } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0110_lineup.sql');
const MIGRATION_SCHED = resolve(HERE, '../../../supabase/migrations/0069_sched.sql');

function slot(over: Partial<Slot> = {}): Slot {
  return {
    id: 's1',
    eventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    eventName: 'Congresso',
    title: 'Abertura',
    stage: '',
    startsAt: null,
    endsAt: null,
    performer: '',
    position: 0,
    ...over,
  };
}

describe('⭐⭐ a agenda é PLANO MUTÁVEL — a decisão vive por AUSÊNCIA de máquina de estados', () => {
  test('o motor NÃO exporta ciclo de vida (nada de ALLOWED_TRANSITIONS/canComplete/canCancel)', () => {
    // O DIVERGE assinado do sched: o item de line-up não conclui, se edita.
    assert.equal((motor as Record<string, unknown>).ALLOWED_TRANSITIONS, undefined);
    assert.equal((motor as Record<string, unknown>).canComplete, undefined);
    assert.equal((motor as Record<string, unknown>).canCancel, undefined);
    assert.equal((motor as Record<string, unknown>).canTransition, undefined);
  });

  test('os tipos NÃO declaram SlotStatus — não há estado', () => {
    // Um enum de status seria um tipo em runtime só se fosse valor; aqui a prova
    // é estrutural: nenhum símbolo "Status" é exportado do pacote de tipos.
    assert.deepEqual(
      Object.keys(tipos).filter((k) => /status/i.test(k)),
      [],
    );
  });

  test('⭐⭐ a migration do lineup NÃO tem allowed_transition; a do sched TEM — o contraste assinado', () => {
    const lineup = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const sched = readFileSync(MIGRATION_SCHED, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(lineup, /allowed_transition/i, 'o lineup ganhou uma máquina de estados — a agenda é plano');
    assert.match(sched, /allowed_transition/i, 'o sched perdeu sua máquina de estados (base do contraste)');
  });

  test('⭐⭐ a linha se APAGA: a migration concede DELETE (o DIVERGE dos livros imutáveis)', () => {
    const lineup = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(lineup, /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+lineup\.slots/i);
  });
});

describe('a leitura ordena a grade', () => {
  test('⭐ por posição, depois por horário (os sem horário — TBD — ao fim), depois por título', () => {
    const lista = [
      slot({ id: 'tbd', title: 'TBD', position: 1, startsAt: null }),
      slot({ id: 'tarde', title: 'Tarde', position: 1, startsAt: '2027-05-10T14:00:00Z' }),
      slot({ id: 'manha', title: 'Manhã', position: 1, startsAt: '2027-05-10T09:00:00Z' }),
      slot({ id: 'abertura', title: 'Abertura', position: 0, startsAt: '2027-05-10T08:00:00Z' }),
    ];
    assert.deepEqual(
      orderSlots(lista).map((s) => s.id),
      ['abertura', 'manha', 'tarde', 'tbd'],
    );
  });

  test('empate de posição e horário desempata por título', () => {
    const lista = [
      slot({ id: 'b', title: 'Banda B', position: 0, startsAt: '2027-05-10T20:00:00Z' }),
      slot({ id: 'a', title: 'Banda A', position: 0, startsAt: '2027-05-10T20:00:00Z' }),
    ];
    assert.deepEqual(orderSlots(lista).map((s) => s.id), ['a', 'b']);
  });
});

describe('o resumo conta a grade', () => {
  test('total, agendados (com horário) e TBD — todo número é length, nunca chute', () => {
    const lista = [
      slot({ startsAt: '2027-05-10T09:00:00Z' }),
      slot({ startsAt: '2027-05-10T10:00:00Z' }),
      slot({ startsAt: null }),
    ];
    assert.deepEqual(summarizeLineup(lista), { total: 3, scheduled: 2, tbd: 1 });
    assert.deepEqual(summarizeLineup([]), { total: 0, scheduled: 0, tbd: 0 });
  });
});

describe('a validação de um item novo', () => {
  test('o caminho feliz: evento + título; palco/horário/atração/posição opcionais', () => {
    const r = validateNewSlot({ eventId: 'e1', eventName: 'Festival', title: 'Show de abertura' });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.value.title, 'Show de abertura');
      assert.equal(r.value.stage, '');
      assert.equal(r.value.startsAt, null);
      assert.equal(r.value.endsAt, null);
      assert.equal(r.value.performer, '');
      assert.equal(r.value.position, 0);
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ o programa pode nascer TBD — sem horário é válido', () => {
    const r = validateNewSlot({ eventId: 'e1', title: 'Palestra a definir' });
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.value.startsAt, null);
  });

  test('sem evento e sem título: reprova nos dois', () => {
    const r = validateNewSlot({});
    assert.ok(!r.ok);
    if (!r.ok) {
      const campos = r.problems.map((p) => p.field).sort();
      assert.deepEqual(campos, ['eventId', 'title']);
    }
  });

  test('física do intervalo: fim sem início reprova', () => {
    const r = validateNewSlot({ eventId: 'e1', title: 'X', endsAt: '2027-05-10T10:00:00Z' });
    assert.ok(!r.ok);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'endsAt'));
  });

  test('física do intervalo: fim antes do início reprova', () => {
    const r = validateNewSlot({
      eventId: 'e1',
      title: 'X',
      startsAt: '2027-05-10T10:00:00Z',
      endsAt: '2027-05-10T09:00:00Z',
    });
    assert.ok(!r.ok);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'endsAt'));
  });

  test('posição negativa reprova; inteira >= 0 passa', () => {
    assert.ok(!validateNewSlot({ eventId: 'e1', title: 'X', position: -1 }).ok);
    const r = validateNewSlot({ eventId: 'e1', title: 'X', position: 3 });
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.value.position, 3);
  });
});
