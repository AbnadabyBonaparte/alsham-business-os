import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canArchive,
  canReopen,
  canTransition,
  deliverableProgress,
  isArchived,
  orderSponsorships,
} from './sponsor.ts';
import type { Deliverable, Sponsorship } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0111_sponsor.sql');
const MIGRATION_LEASE = resolve(HERE, '../../../supabase/migrations/0054_lease.sql');

function patrocinio(over: Partial<Sponsorship> = {}): Sponsorship {
  return {
    id: 's1',
    eventId: 'evt-1',
    eventRef: 'Congresso 2026',
    sponsorName: 'Marca Alfa',
    partyId: null,
    tier: 'ouro',
    amountCents: null,
    currency: null,
    contractId: null,
    contractRef: '',
    status: 'active',
    ...over,
  };
}

describe('⭐ o ciclo — active ↔ archived (a relação que volta)', () => {
  test('⭐ active ↔ archived: as duas transições, e nada mais', () => {
    assert.equal(canTransition('active', 'archived'), true);
    assert.equal(canTransition('archived', 'active'), true);
    assert.equal(canArchive('active'), true);
    assert.equal(canReopen('archived'), true);
    assert.equal(canArchive('archived'), false);
    assert.equal(isArchived('archived'), true);
    assert.equal(isArchived('active'), false);
    assert.equal(ALLOWED_TRANSITIONS.length, 2);
  });

  test('o mapa lê ativos primeiro', () => {
    const ordenado = orderSponsorships([
      patrocinio({ id: 'c', status: 'archived', sponsorName: 'Zeta' }),
      patrocinio({ id: 'b', status: 'active', sponsorName: 'Bravo' }),
      patrocinio({ id: 'a', status: 'active', sponsorName: 'Alfa' }),
    ]);
    assert.deepEqual(ordenado.map((s) => s.id), ['a', 'b', 'c']);
  });

  test('o progresso do checklist conta sem inventar número', () => {
    const ds: Deliverable[] = [
      { id: 'd1', sponsorshipId: 's1', description: 'logo no palco', delivered: true, deliveredAt: '2026-08-01' },
      { id: 'd2', sponsorshipId: 's1', description: '10 cortesias', delivered: false, deliveredAt: null },
      { id: 'd3', sponsorshipId: 's1', description: 'ativação no foyer', delivered: false, deliveredAt: null },
    ];
    assert.deepEqual(deliverableProgress(ds), { total: 3, delivered: 1, pending: 2 });
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

  test('sponsor.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'sponsor.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, ALLOWED_TRANSITIONS.length);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐⭐ o contraste sponsor×lease: a mesma família (camada-sobre-ctr), física OPOSTA de propósito', () => {
  const sponsorCode = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
  const leaseCode = readFileSync(MIGRATION_LEASE, 'utf8').replace(/--[^\n]*/g, '');

  test('o lease (a outra camada-sobre-ctr) é TERMINAL: active → ended', () => {
    assert.match(leaseCode, /\(\s*'active'\s*,\s*'ended'\s*\)/);
    // O lease NÃO reabre: não há ('ended','active').
    assert.doesNotMatch(leaseCode, /\(\s*'ended'\s*,\s*'active'\s*\)/);
  });

  test('⭐⭐ o sponsor DIVERGE: active ↔ archived — o patrocinador VOLTA', () => {
    assert.match(sponsorCode, /\(\s*'active'\s*,\s*'archived'\s*\)/);
    assert.match(sponsorCode, /\(\s*'archived'\s*,\s*'active'\s*\)/);
    // E NÃO copiou o terminal do lease.
    assert.doesNotMatch(sponsorCode, /'ended'/);
    assert.equal(canReopen('archived'), true);
  });

  test('nenhum dos dois reescreve o ctr — os dois vinculam por id solto', () => {
    assert.doesNotMatch(sponsorCode, /references\s+ctr\./i);
    assert.doesNotMatch(leaseCode, /references\s+ctr\./i);
  });
});

describe('⭐ o entregável é MUTÁVEL — o DIVERGE do livro imutável do lease', () => {
  const sponsorCode = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

  test('o checklist ganha grant de UPDATE (marca-se feito) — ao contrário do sales_reports imutável do lease', () => {
    assert.match(sponsorCode, /grant\s+select,\s*insert,\s*update\s+on\s+sponsor\.deliverables/i);
    // A FK do entregável é INTRA-schema (permitida — é o próprio módulo).
    assert.match(sponsorCode, /references\s+sponsor\.sponsorships/i);
  });
});
