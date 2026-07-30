import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canCancel,
  canCheckIn,
  canCheckOut,
  canEditVisit,
  canMarkNoShow,
  canTransition,
  isInside,
  orderGate,
  whyCannotCancel,
  whyCannotCheckOut,
} from './visits.ts';
import type { Visit, VisitStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0036_vis.sql');
const MIGRATION_CRM = resolve(HERE, '../../../supabase/migrations/0009_crm.sql');
const MIGRATION_CARE = resolve(HERE, '../../../supabase/migrations/0030_care.sql');

const TODOS: readonly VisitStatus[] = [
  'scheduled', 'checked_in', 'checked_out', 'no_show', 'cancelled',
];

function visita(over: Partial<Visit> = {}): Visit {
  return {
    id: 'v1',
    visitorName: 'Visitante da tarde',
    visitorDocument: '',
    visitorContact: '',
    host: 'compras',
    reason: 'entrega de amostras',
    status: 'checked_in',
    expectedAt: null,
    checkedInAt: '2026-07-30T14:00:00Z',
    checkedOutAt: null,
    cancelReason: '',
    correctsVisitId: null,
    ...over,
  };
}

describe('⭐ o ciclo — quatro pares; todos os fins terminais', () => {
  test('o agendamento resolve em três: entrou, não veio, desmarcou', () => {
    assert.equal(canCheckIn('scheduled'), true);
    assert.equal(canMarkNoShow('scheduled'), true);
    assert.equal(canCancel('scheduled'), true);
  });

  test('⭐ check-out sem check-in não existe — saída sem entrada é livro que mente', () => {
    assert.equal(canTransition('scheduled', 'checked_out'), false);
    assert.equal(canCheckOut('checked_in'), true);
    assert.match(whyCannotCheckOut(visita({ status: 'scheduled', expectedAt: 'x', checkedInAt: null }))!, /entrada/);
    assert.equal(whyCannotCheckOut(visita()), null);
  });

  test('⭐ NENHUM fim volta: quem volta amanhã é visita nova', () => {
    for (const fim of ['checked_out', 'no_show', 'cancelled'] as const) {
      for (const destino of TODOS.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não existe`);
      }
    }
  });

  test('desmarcar exige razão — e só o agendamento se desmarca', () => {
    const agendada = visita({ status: 'scheduled', expectedAt: '2026-08-01T10:00:00Z', checkedInAt: null });
    assert.match(whyCannotCancel(agendada, '')!, /razão/);
    assert.equal(whyCannotCancel(agendada, 'o anfitrião viajou'), null);
    assert.match(whyCannotCancel(visita(), 'x')!, /check-out/);
  });

  test('enquanto agendada edita-se (é plano); depois é fato', () => {
    assert.equal(canEditVisit('scheduled'), true);
    assert.equal(canEditVisit('checked_in'), false);
    assert.equal(canEditVisit('checked_out'), false);
  });

  test('o pátio sabe quem está dentro', () => {
    assert.equal(isInside(visita()), true);
    assert.equal(isInside(visita({ status: 'checked_out', checkedOutAt: 'x' })), false);
  });

  test('a ordem da portaria: dentro primeiro, depois agendados, depois história', () => {
    const ordenado = orderGate([
      visita({ id: 'hist', status: 'checked_out', checkedOutAt: '2026-07-30T10:00:00Z' }),
      visita({ id: 'agendada', status: 'scheduled', expectedAt: '2026-07-31T09:00:00Z', checkedInAt: null }),
      visita({ id: 'dentro', checkedInAt: '2026-07-30T13:00:00Z' }),
    ]);
    assert.deepEqual(ordenado.map((v) => v.id), ['dentro', 'agendada', 'hist']);
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

  test('vis.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'vis.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 4, 'o SQL declara quatro pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ A QUARTA IDENTIDADE também se assina: o crm reativa (a pessoa volta),
   * o care reabre (o pedido volta) — a visita NÃO volta de fim nenhum: a
   * identidade é a PASSAGEM. Se um dos três lados mudar, este teste obriga
   * a re-perguntar em vez de herdar em silêncio.
   */
  test('⭐ o contraste crm×care×vis: a pessoa volta, o pedido volta, a passagem não', () => {
    const crm = readFileSync(MIGRATION_CRM, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(crm, /\(\s*'archived'\s*,\s*'active'\s*\)/, 'o crm deixou de reativar — re-pergunte');
    const care = readFileSync(MIGRATION_CARE, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(care, /\(\s*'resolved'\s*,\s*'open'\s*\)/, 'o care deixou de reabrir — re-pergunte');

    const doVis = paresDoSql(MIGRATION, 'vis.allowed_transition');
    for (const fim of ['checked_out', 'no_show', 'cancelled']) {
      for (const destino of TODOS) {
        assert.equal(doVis.has(`${fim}→${destino}`), false, `${fim} não volta — a passagem é única`);
      }
    }
  });

  /**
   * ⭐ O DOCUMENTO NÃO PASSEIA PELO CORREIO: o payload do fato não contém
   * visitor_document nem visitor_contact — dado pessoal fica na portaria.
   */
  test('⭐ o envelope leva nome e destino; o documento fica', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const payload = sql.split('create or replace function vis.visit_payload')[1]?.split('$$;')[0] ?? '';
    assert.ok(payload.includes('visitor_name'), 'o nome vai no envelope');
    assert.ok(!payload.includes('visitor_document'), 'o documento NÃO vai no envelope');
    assert.ok(!payload.includes('visitor_contact'), 'o contato NÃO vai no envelope');
  });

  test('⭐ nada de lista negra, crachá ou enum — e o carimbo é do servidor', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(sql, /blacklist|blocklist|lista_negra|banned/i);
    assert.doesNotMatch(sql, /badge|qr_|catraca|turnstile|photo/i);
    assert.doesNotMatch(sql, /create\s+type\s+vis\./i);
    assert.match(sql, /new\.checked_in_at := now\(\)/);
  });
});
