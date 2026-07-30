import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  ackCount,
  canArchive,
  canEditNotice,
  canPublish,
  canTransition,
  hasAcked,
  orderBoard,
  whyCannotAck,
  whyCannotPublish,
} from './comms.ts';
import type { Notice, NoticeAck, NoticeStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0039_comm.sql');
const MIGRATION_QUOTE = resolve(HERE, '../../../supabase/migrations/0024_quote.sql');
const MIGRATION_SPC = resolve(HERE, '../../../supabase/migrations/0035_spc.sql');

const TODOS: readonly NoticeStatus[] = ['draft', 'published', 'archived'];

function comunicado(over: Partial<Notice> = {}): Notice {
  return {
    id: 'n1',
    title: 'Recesso de fim de ano',
    body: 'O prédio fecha do dia 24 ao dia 2.',
    audience: 'todos',
    status: 'published',
    publishedAt: '2026-07-30T10:00:00Z',
    correctsNoticeId: null,
    correctsTitle: '',
    ...over,
  };
}

function ciencia(over: Partial<NoticeAck> = {}): NoticeAck {
  return {
    id: 'a1',
    noticeId: 'n1',
    userId: 'u1',
    ackedAt: '2026-07-30T11:00:00Z',
    ...over,
  };
}

describe('⭐ o ciclo — dois pares; o arquivado é terminal', () => {
  test('o rascunho publica; o publicado arquiva', () => {
    assert.equal(canPublish('draft'), true);
    assert.equal(canArchive('published'), true);
  });

  test('⭐ o arquivado é TERMINAL: o aviso que volta é comunicado novo', () => {
    for (const destino of TODOS.filter((s) => s !== 'archived')) {
      assert.equal(canTransition('archived', destino), false, `archived → ${destino} não existe`);
    }
    // E o rascunho não arquiva: nunca esteve no mural.
    assert.equal(canTransition('draft', 'archived'), false);
  });

  test('⭐ a palavra dada não se edita — só o rascunho é plano', () => {
    assert.equal(canEditNotice('draft'), true);
    assert.equal(canEditNotice('published'), false);
    assert.equal(canEditNotice('archived'), false);
  });

  test('⭐ comunicado sem corpo não comunica — a recusa tem nome', () => {
    const semCorpo = comunicado({ status: 'draft', publishedAt: null, body: '  ' });
    assert.match(whyCannotPublish(semCorpo)!, /não comunica/);
    assert.equal(whyCannotPublish(comunicado({ status: 'draft', publishedAt: null })), null);
    assert.match(whyCannotPublish(comunicado())!, /palavra já foi dada/);
  });
});

describe('⭐ a ciência — própria, única, e só no mural', () => {
  test('ciência em publicado, uma vez', () => {
    assert.equal(whyCannotAck(comunicado(), 'u1', []), null);
  });

  test('⭐ ciência não se dá duas vezes', () => {
    assert.match(whyCannotAck(comunicado(), 'u1', [ciencia()])!, /duas vezes/);
    assert.equal(hasAcked(comunicado(), 'u1', [ciencia()]), true);
  });

  test('⭐ rascunho não comunica; fora do mural não há ciência nova', () => {
    assert.match(whyCannotAck(comunicado({ status: 'draft', publishedAt: null }), 'u1', [])!, /rascunho/);
    assert.match(whyCannotAck(comunicado({ status: 'archived' }), 'u1', [])!, /Fora do mural/);
  });

  test('a cobertura é contada, nunca estimada', () => {
    assert.equal(ackCount(comunicado(), [ciencia(), ciencia({ id: 'a2', userId: 'u2' }), ciencia({ id: 'a3', noticeId: 'OUTRO' })]), 2);
  });

  test('o mural na ordem de leitura: publicados novos primeiro', () => {
    const ordenado = orderBoard([
      comunicado({ id: 'arq', status: 'archived', publishedAt: '2026-07-01T00:00:00Z' }),
      comunicado({ id: 'velho', publishedAt: '2026-07-10T00:00:00Z' }),
      comunicado({ id: 'novo', publishedAt: '2026-07-29T00:00:00Z' }),
      comunicado({ id: 'rasc', status: 'draft', publishedAt: null }),
    ]);
    assert.deepEqual(ordenado.map((n) => n.id), ['novo', 'velho', 'rasc', 'arq']);
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

  test('comm.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'comm.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O MANTIDO também se assina: publicar congela como o quote congela o
   * documento — a palavra dada não muda. E a recusa de ciência no
   * arquivado é a física do spc (o arquivado não recebe ato novo). Se um
   * dos lados mudar, o comm re-pergunta em vez de herdar em silêncio.
   */
  test('⭐ o contraste quote×spc×comm: a palavra congela e o arquivado não recebe ato', () => {
    const quote = readFileSync(MIGRATION_QUOTE, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(quote, /quote\.guard_item_frozen/, 'o quote deixou de congelar — re-pergunte');
    const spc = readFileSync(MIGRATION_SPC, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(spc, /fora de uso não recebe reserva nova/, 'o spc deixou de recusar o arquivado — re-pergunte');
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /palavra dada não se edita/);
    assert.match(sql, /cobertura conta quem leu/);
  });

  test('⭐ a ciência é forçada ao próprio punho — no CÓDIGO', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /new\.user_id\s+:= \(select auth\.uid\(\)\)/);
    assert.match(sql, /comm_acks_once unique \(notice_id, user_id\)/);
    assert.match(sql, /comm_acks_immutable/);
  });

  test('⭐ o título da correção é carimbo do servidor; sem envio, sem cron, sem enum', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /new\.corrects_title := coalesce\(v_title, ''\)/);
    assert.doesNotMatch(sql, /pg_cron|cron\.schedule|scheduled_for/i);
    assert.doesNotMatch(sql, /email|whatsapp|push_/i);
    assert.doesNotMatch(sql, /create\s+type\s+comm\./i);
    // O corpo não passeia no envelope.
    const payload = sql.split('create or replace function comm.notice_payload')[1]?.split('$$;')[0] ?? '';
    assert.ok(!payload.includes('p.body'), 'o corpo NÃO vai no envelope');
  });
});
