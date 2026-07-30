import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canAnswer,
  canTransition,
  orderItems,
  runProgress,
  whyCannotAbandon,
  whyCannotAnswer,
  whyCannotComplete,
  whyCannotStart,
} from './checklists.ts';
import type { ChecklistRun, ChkRunItem, RunStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0034_chk.sql');
const MIGRATION_QUOTE = resolve(HERE, '../../../supabase/migrations/0024_quote.sql');

const TODOS: readonly RunStatus[] = ['in_progress', 'completed', 'abandoned'];

function execucao(over: Partial<ChecklistRun> = {}): ChecklistRun {
  return {
    id: 'r1',
    templateId: 't1',
    templateName: 'Abertura da loja',
    subject: 'loja 3',
    status: 'in_progress',
    startedAt: '2026-07-30T08:00:00Z',
    completedAt: null,
    abandonReason: '',
    ...over,
  };
}

function item(over: Partial<ChkRunItem> = {}): ChkRunItem {
  return {
    id: 'i1',
    runId: 'r1',
    position: 0,
    itemText: 'Portas destravadas',
    answer: null,
    note: '',
    answeredAt: null,
    ...over,
  };
}

describe('⭐ o ciclo — dois fins, ambos terminais', () => {
  test('in_progress → completed e in_progress → abandoned existem', () => {
    assert.equal(canTransition('in_progress', 'completed'), true);
    assert.equal(canTransition('in_progress', 'abandoned'), true);
  });

  test('⭐ os fins são TERMINAIS: quem volta amanhã abre execução nova', () => {
    for (const fim of ['completed', 'abandoned'] as const) {
      for (const destino of TODOS.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não existe`);
      }
    }
  });

  test('⭐ concluir exige TUDO respondido — a recusa conta os que faltam', () => {
    const r = execucao();
    const itens = [item({ answer: 'ok', answeredAt: '2026-07-30T08:05:00Z' }), item({ id: 'i2', position: 1 })];
    assert.match(whyCannotComplete(r, itens)!, /Faltam 1 item/);
    const todos = [item({ answer: 'ok', answeredAt: 'x' }), item({ id: 'i2', position: 1, answer: 'not_ok', answeredAt: 'x' })];
    assert.equal(whyCannotComplete(r, todos), null);
  });

  test('abandonar exige a razão escrita', () => {
    assert.match(whyCannotAbandon(execucao(), '')!, /razão/);
    assert.equal(whyCannotAbandon(execucao(), 'faltou luz na loja'), null);
    assert.match(whyCannotAbandon(execucao({ status: 'completed' }), 'x')!, /condição/);
  });
});

describe('⭐ a resposta é ato — uma vez, com a execução viva', () => {
  test('responde-se item sem resposta em execução viva', () => {
    assert.equal(canAnswer(execucao(), item()), true);
  });

  test('⭐ resposta dada não se rasura', () => {
    const respondido = item({ answer: 'ok', answeredAt: '2026-07-30T08:05:00Z' });
    assert.equal(canAnswer(execucao(), respondido), false);
    assert.match(whyCannotAnswer(execucao(), respondido)!, /não se rasura/);
  });

  test('execução terminada não responde mais', () => {
    assert.match(whyCannotAnswer(execucao({ status: 'completed', completedAt: 'x' }), item())!, /terminou/);
  });

  test('o andamento é contado, nunca estimado', () => {
    const p = runProgress([
      item({ answer: 'ok', answeredAt: 'x' }),
      item({ id: 'i2', answer: 'not_ok', answeredAt: 'x' }),
      item({ id: 'i3', answer: 'not_applicable', answeredAt: 'x' }),
      item({ id: 'i4' }),
    ]);
    assert.deepEqual(p, { total: 4, answered: 3, ok: 1, notOk: 1, notApplicable: 1 });
  });

  test('a prancheta lê na ordem do desenho', () => {
    const ordenado = orderItems([item({ id: 'b', position: 2 }), item({ id: 'a', position: 0 })]);
    assert.deepEqual(ordenado.map((i) => i.id), ['a', 'b']);
  });

  test('modelo arquivado ou vazio não abre execução', () => {
    assert.match(whyCannotStart(undefined, 3)!, /não existe/);
    assert.match(whyCannotStart({ id: 't', name: 'x', status: 'archived' }, 3)!, /arquivado/);
    assert.match(whyCannotStart({ id: 't', name: 'x', status: 'active' }, 0)!, /vazia/);
    assert.equal(whyCannotStart({ id: 't', name: 'x', status: 'active' }, 3), null);
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

  test('chk.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'chk.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O MANTIDO também se assina: a execução congela como o DOCUMENTO do
   * quote — mas na ABERTURA, não no envio, e por CÓPIA, não por trava de
   * edição. Se o quote mudar a física dele, o chk re-pergunta em vez de
   * herdar em silêncio.
   */
  test('⭐ o contraste quote×chk: os dois congelam; o chk congela por CÓPIA na abertura', () => {
    const quote = readFileSync(MIGRATION_QUOTE, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(quote, /quote\.guard_item_frozen/,
      'o quote deixou de congelar o documento — re-pergunte o contraste');
    const chk = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(chk, /insert into chk\.run_items \(tenant_id, run_id, position, item_text\)\s*\n\s*select/,
      'a cópia da prancheta sumiu — o congelo do chk é por CÓPIA, pelo gatilho');
    assert.doesNotMatch(chk, /references\s+chk\.template_items/,
      'apareceu FK da prancheta para o item de origem — a cópia é por VALOR');
  });

  test('⭐ a resposta é CHECK argumentado — e não virou enum', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /answer in \('ok', 'not_ok', 'not_applicable'\)/);
    assert.doesNotMatch(sql, /create\s+type\s+chk\./i);
    assert.doesNotMatch(sql, /pg_cron|cron\.schedule/i);
  });
});
