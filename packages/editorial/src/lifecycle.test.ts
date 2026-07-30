import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canEditPiece,
  canMove,
  canReschedule,
  canTransition,
  latePieces,
  orderCalendar,
  orderStages,
  whyCannotClose,
  whyCannotMove,
  whyCannotPlanOn,
} from './editorial.ts';
import type { Piece, PieceStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0040_edcal.sql');
const MIGRATION_OPS = resolve(HERE, '../../../supabase/migrations/0018_ops.sql');
const MIGRATION_DEAL = resolve(HERE, '../../../supabase/migrations/0025_deal.sql');

const TODOS: readonly PieceStatus[] = ['planned', 'published', 'dropped'];

function pauta(over: Partial<Piece> = {}): Piece {
  return {
    id: 'p1',
    title: 'Bastidores da obra',
    brief: 'roteiro em três blocos',
    channelId: 'c1',
    currentStageId: 's1',
    plannedOn: '2026-08-10',
    status: 'planned',
    publishedAt: null,
    dropReason: '',
    ...over,
  };
}

describe('⭐ o ciclo — dois pares, dois fins terminais', () => {
  test('a planejada publica ou morre', () => {
    assert.equal(canTransition('planned', 'published'), true);
    assert.equal(canTransition('planned', 'dropped'), true);
  });

  test('⭐ os fins são TERMINAIS: a pauta que revive é pauta nova', () => {
    for (const fim of ['published', 'dropped'] as const) {
      for (const destino of TODOS) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não existe`);
      }
    }
  });

  test('⭐ enquanto planejada, TUDO é plano: edita, reagenda, move', () => {
    assert.equal(canEditPiece('planned'), true);
    assert.equal(canReschedule('planned'), true);
    assert.equal(canMove('planned'), true);
    for (const fim of ['published', 'dropped'] as const) {
      assert.equal(canEditPiece(fim), false);
      assert.equal(canReschedule(fim), false);
      assert.equal(canMove(fim), false);
    }
  });

  test('⭐ descartar exige a razão; o fim não se registra duas vezes', () => {
    assert.match(whyCannotClose(pauta(), 'dropped', '  ')!, /razão/);
    assert.equal(whyCannotClose(pauta(), 'dropped', 'o cliente cancelou a campanha'), null);
    assert.equal(whyCannotClose(pauta(), 'published', ''), null);
    assert.match(
      whyCannotClose(pauta({ status: 'published', publishedAt: 'x' }), 'dropped', 'r')!,
      /terminal/,
    );
  });

  test('mover: só no fluxo vivo, e para etapa diferente', () => {
    assert.equal(whyCannotMove(pauta(), 's2'), null);
    assert.match(whyCannotMove(pauta(), 's1')!, /já está/);
    assert.match(whyCannotMove(pauta({ status: 'dropped', dropReason: 'r' }), 's2')!, /fim registrado/);
  });

  test('⭐ canal arquivado não recebe pauta nova — mas volta do arquivo', () => {
    assert.match(whyCannotPlanOn({ id: 'c1', name: 'blog', status: 'archived' })!, /arquivado/);
    assert.equal(whyCannotPlanOn({ id: 'c1', name: 'blog', status: 'active' }), null);
  });
});

describe('a leitura do calendário', () => {
  test('o fluxo na ordem do desenho do tenant', () => {
    const ordenado = orderStages([
      { id: 'b', name: 'revisão', position: 2 },
      { id: 'a', name: 'pauta', position: 0 },
      { id: 'c', name: 'redação', position: 1 },
    ]);
    assert.deepEqual(ordenado.map((s) => s.name), ['pauta', 'redação', 'revisão']);
  });

  test('planejadas pela data, publicadas pelas mais recentes, mortas por último', () => {
    const ordenado = orderCalendar([
      pauta({ id: 'morta', status: 'dropped', dropReason: 'r' }),
      pauta({ id: 'pub', status: 'published', publishedAt: '2026-07-20T10:00:00Z' }),
      pauta({ id: 'longe', plannedOn: '2026-09-01' }),
      pauta({ id: 'perto', plannedOn: '2026-08-02' }),
    ]);
    assert.deepEqual(ordenado.map((p) => p.id), ['perto', 'longe', 'pub', 'morta']);
  });

  test('⭐ atrasada é planejada com a data vencida — e o hoje vem de fora', () => {
    const pecas = [pauta({ id: 'v', plannedOn: '2026-07-01' }), pauta({ id: 'ok' })];
    assert.deepEqual(latePieces(pecas, '2026-07-30').map((p) => p.id), ['v']);
    // Publicada com data antiga NÃO é atraso: o fato já foi registrado.
    assert.equal(
      latePieces([pauta({ status: 'published', publishedAt: 'x', plannedOn: '2026-01-01' })], '2026-07-30').length,
      0,
    );
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

  test('edcal.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'edcal.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ A LEI DAS ETAPAS, quarta aplicação — e o DIVERGE assinado: o ops tem
   * `requires_approval` nas etapas dele; o edcal NÃO trouxe a flag —
   * aprovação multi-nível está FORA por decisão de canon (spec §5). Se o
   * ops mudar, o edcal re-pergunta em vez de herdar em silêncio.
   */
  test('⭐ o contraste ops×edcal: etapas do tenant, sem a flag de aprovação', () => {
    const ops = readFileSync(MIGRATION_OPS, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(ops, /requires_approval/, 'o ops perdeu a flag — re-pergunte o contraste');
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(sql, /requires_approval/, 'a flag entrou no edcal — a decisão era NÃO trazê-la');
    assert.doesNotMatch(sql, /create\s+type\s+edcal\./i, 'etapa e canal são DADO, nunca enum');
  });

  /** ⭐ O MANTIDO também se assina: a trilha com nome carimbado é a do deal. */
  test('⭐ o contraste deal×edcal: trilha imutável com id solto + nome carimbado', () => {
    const deal = readFileSync(MIGRATION_DEAL, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(deal, /from_stage_name/, 'o deal deixou de carimbar o nome — re-pergunte');
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /from_stage_name/);
    assert.match(sql, /to_stage_name/);
    assert.match(sql, /edcal_piece_events_immutable/);
  });

  test('⭐ a data real é do servidor; sem cron, sem upload, sem métrica', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /new\.published_at := now\(\)/);
    assert.match(sql, /new\.published_by := \(select auth\.uid\(\)\)/);
    assert.doesNotMatch(sql, /pg_cron|cron\.schedule|scheduled_for/i);
    assert.doesNotMatch(sql, /storage\.|upload|thumbnail/i);
    assert.doesNotMatch(sql, /engagement|impression|clicks/i);
    // O texto de trabalho não passeia no envelope.
    const payload = sql.split('create or replace function edcal.piece_payload')[1]?.split('$$;')[0] ?? '';
    assert.ok(!payload.includes('p.brief'), 'o texto de trabalho NÃO vai no envelope');
  });
});
