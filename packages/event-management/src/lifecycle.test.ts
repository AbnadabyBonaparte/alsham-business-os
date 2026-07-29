import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  EVENT_TRANSITIONS,
  REGISTRATION_TRANSITIONS,
  canTransitionEvent,
  canTransitionRegistration,
  canHold,
  canRegister,
  canAttend,
  activeRegistrations,
  remainingCapacity,
  isFull,
  isUpcoming,
  summarizeEvents,
} from './event.ts';
import type { EventStatus, Registration, RegistrationStatus, TenantEvent } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0026_evt.sql');

function evento(over: Partial<TenantEvent> = {}): TenantEvent {
  return {
    id: 'e1',
    tenantId: 't1',
    name: 'Feira de inverno',
    description: '',
    startsAt: '2026-08-10T18:00:00Z',
    endsAt: null,
    location: 'salão 2',
    capacity: null,
    status: 'published',
    ...over,
  };
}

function inscricao(over: Partial<Registration> = {}): Registration {
  return {
    id: 'r1',
    eventId: 'e1',
    attendeeName: 'Pessoa Um',
    contact: null,
    note: '',
    status: 'registered',
    attendedAt: null,
    ...over,
  };
}

describe('o ciclo de vida do evento', () => {
  test('⭐ publicado NÃO volta a rascunho — compromisso é compromisso', () => {
    assert.equal(canTransitionEvent('published', 'draft'), false);
  });

  test('held e cancelled são terminais', () => {
    const TODOS: readonly EventStatus[] = ['draft', 'published', 'held', 'cancelled'];
    for (const fim of ['held', 'cancelled'] as const) {
      for (const destino of TODOS.filter((s) => s !== fim)) {
        assert.equal(canTransitionEvent(fim, destino), false, `${fim} → ${destino}`);
      }
    }
  });

  test('rascunho não se realiza — primeiro se publica', () => {
    assert.equal(canTransitionEvent('draft', 'held'), false);
    assert.equal(canTransitionEvent('draft', 'published'), true);
    assert.equal(canTransitionEvent('published', 'held'), true);
  });

  test('⭐ realizado só DEPOIS de começar — honestidade de calendário', () => {
    const e = evento({ startsAt: '2026-08-10T18:00:00Z' });
    assert.equal(canHold(e, '2026-08-01T00:00:00Z'), false, 'antes de começar, não');
    assert.equal(canHold(e, '2026-08-10T19:00:00Z'), true, 'depois de começar, sim');
    assert.equal(canHold(evento({ status: 'draft' }), '2026-12-31T00:00:00Z'), false);
  });
});

describe('o ciclo de vida da inscrição', () => {
  test('⭐ presença e cancelamento são terminais — voltar atrás é inscrição nova', () => {
    const TODOS: readonly RegistrationStatus[] = [
      'registered',
      'confirmed',
      'cancelled',
      'attended',
    ];
    for (const fim of ['cancelled', 'attended'] as const) {
      for (const destino of TODOS.filter((s) => s !== fim)) {
        assert.equal(canTransitionRegistration(fim, destino), false, `${fim} → ${destino}`);
      }
    }
  });

  test('inscrita confirma, cancela ou comparece; confirmada não "desconfirma"', () => {
    assert.equal(canTransitionRegistration('registered', 'confirmed'), true);
    assert.equal(canTransitionRegistration('registered', 'attended'), true);
    assert.equal(canTransitionRegistration('confirmed', 'registered'), false);
  });

  test('inscrição só em evento PUBLICADO; presença em publicado ou realizado', () => {
    assert.equal(canRegister(evento({ status: 'draft' })), false);
    assert.equal(canRegister(evento({ status: 'published' })), true);
    assert.equal(canRegister(evento({ status: 'held' })), false);
    assert.equal(canAttend(inscricao(), evento({ status: 'held' })), true);
    assert.equal(canAttend(inscricao(), evento({ status: 'cancelled' })), false);
    assert.equal(canAttend(inscricao({ status: 'cancelled' }), evento()), false);
  });
});

describe('⭐ as DUAS tabelas de transição são as MESMAS nos dois lados', () => {
  function paresDoSql(fn: string): Set<string> {
    const sql = readFileSync(MIGRATION, 'utf8');
    const corpo = sql.split(`create or replace function ${fn}`)[1];
    assert.ok(corpo !== undefined, `${fn} não encontrada`);
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

  test('evt.allowed_transition() espelha EVENT_TRANSITIONS', () => {
    const doSql = paresDoSql('evt.allowed_transition');
    const doTs = new Set(EVENT_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 4);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('evt.allowed_registration_transition() espelha REGISTRATION_TRANSITIONS', () => {
    const doSql = paresDoSql('evt.allowed_registration_transition');
    const doTs = new Set(REGISTRATION_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 5);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

/**
 * ⭐⭐ O ANTI-VIÉS E O PERIGO DA PEDREIRA, conferidos no ARQUIVO: nada do
 * ofício do vertical entrou no schema do evento universal.
 */
describe('⭐⭐ o ofício do vertical NÃO entrou', () => {
  const codigo = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

  test('⛔ sem ingresso, pagamento, QR, credenciamento, line-up, patrocínio', () => {
    assert.doesNotMatch(codigo, /ticket|ingresso|payment|price_cents|qr_code|credencia|line_?up|sponsor/i);
  });

  test('⛔ sem colunas de canal congelado — o contato é texto livre', () => {
    assert.doesNotMatch(codigo, /\bemail\s+text|\bphone\s+text|whatsapp/i);
  });

  test('sem enum de tipo de evento', () => {
    assert.doesNotMatch(codigo, /create\s+type\s+evt\./i);
  });
});

describe('⭐ a lotação conta certo — e não inventa número', () => {
  test('cancelada não ocupa vaga', () => {
    const regs = [
      inscricao({ id: 'a' }),
      inscricao({ id: 'b', status: 'confirmed' }),
      inscricao({ id: 'c', status: 'cancelled' }),
      inscricao({ id: 'd', status: 'attended', attendedAt: '2026-08-10T19:00:00Z' }),
    ];
    assert.equal(activeRegistrations(regs, 'e1'), 3);
  });

  test('sem teto, sem conta: remainingCapacity devolve null', () => {
    assert.equal(remainingCapacity(evento({ capacity: null }), []), null);
    assert.equal(isFull(evento({ capacity: null }), []), false);
  });

  test('com teto, as vagas nunca ficam negativas na tela', () => {
    const e = evento({ capacity: 2 });
    const regs = [inscricao({ id: 'a' }), inscricao({ id: 'b' }), inscricao({ id: 'c' })];
    assert.equal(remainingCapacity(e, regs), 0);
    assert.equal(isFull(e, regs), true);
  });
});

describe('agenda e resumo', () => {
  test('isUpcoming: futuro e vivo; realizado e cancelado não são "próximos"', () => {
    assert.equal(isUpcoming(evento(), '2026-08-01T00:00:00Z'), true);
    assert.equal(isUpcoming(evento(), '2026-09-01T00:00:00Z'), false);
    assert.equal(isUpcoming(evento({ status: 'held' }), '2026-08-01T00:00:00Z'), false);
  });

  test('o resumo conta, nunca estima', () => {
    const r = summarizeEvents(
      [evento({ id: 'a' }), evento({ id: 'b', status: 'held' })],
      [inscricao(), inscricao({ id: 'r2', status: 'cancelled' })],
      '2026-08-01T00:00:00Z',
    );
    assert.equal(r.total, 2);
    assert.equal(r.upcoming, 1);
    assert.equal(r.held, 1);
    assert.equal(r.activeRegistrations, 1);
  });
});
