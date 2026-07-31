import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  ALL_STATUSES,
  canTransition,
  nextStatuses,
  canClose,
} from './cashregister.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0088_cashregister.sql');
const MIGRATION_CASH = resolve(HERE, '../../../supabase/migrations/0029_cash.sql');

/** Extrai os pares ('de','para') do corpo de uma função de transição do SQL. */
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

describe('o ciclo de vida da sessão de caixa', () => {
  test('o caminho feliz: open → closed', () => {
    assert.equal(canTransition('open', 'closed'), true);
  });

  test('⭐ open → closed é a ÚNICA transição', () => {
    assert.equal(ALLOWED_TRANSITIONS.length, 1);
    assert.deepEqual(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`), ['open→closed']);
  });

  test('⭐ closed é TERMINAL: nada sai de closed', () => {
    for (const destino of ALL_STATUSES.filter((s) => s !== 'closed')) {
      assert.equal(canTransition('closed', destino), false, `closed → ${destino}`);
    }
    assert.deepEqual([...nextStatuses('closed')], []);
  });

  test('fechar só existe da sessão aberta', () => {
    assert.equal(canClose('open'), true);
    assert.equal(canClose('closed'), false);
  });

  test('⭐ a matriz N×N: canTransition concorda com a tabela (o mesmo estado é no-op)', () => {
    const permitidos = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    for (const de of ALL_STATUSES) {
      for (const para of ALL_STATUSES) {
        const esperado = de === para || permitidos.has(`${de}→${para}`);
        assert.equal(canTransition(de, para), esperado, `${de} → ${para}`);
      }
    }
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('open')], ['closed']);
    assert.deepEqual([...nextStatuses('closed')], []);
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('cashregister.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'cashregister.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 1, 'o SQL declara UM par (open→closed)');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('⭐ closed é terminal também no SQL: nenhum par sai de closed', () => {
    const doSql = paresDoSql(MIGRATION, 'cashregister.allowed_transition');
    for (const par of doSql) {
      const [de] = par.split('→');
      assert.ok(de !== 'closed', `a sessão ganhou uma volta (${par}) — closed é terminal`);
    }
  });

  test('⭐⭐ o índice único parcial "uma sessão aberta por caixa" existe na migration', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.match(
      sql,
      /create\s+unique\s+index\s+cashregister_sessions_one_open[\s\S]*?on\s+cashregister\.sessions[\s\S]*?where\s+status\s*=\s*'open'/i,
      'o índice único parcial "uma aberta por caixa" sumiu da migration',
    );
  });

  test('⭐ a abertura CONGELA no fechamento: o gatilho guard_content_frozen existe', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.match(
      sql,
      /create\s+or\s+replace\s+function\s+cashregister\.guard_content_frozen/i,
      'o gatilho de congelamento do conteúdo sumiu da migration',
    );
  });
});

/**
 * ⭐⭐ O DIVERGE ASSINADO cashregister × cash — DUAS FÍSICAS DIFERENTES.
 *
 * O `cash` (Módulo 14) é um LIVRO-CAIXA CORPORATIVO: lançamentos IMUTÁVEIS, sem
 * ciclo de vida — um livro perpétuo que nunca "fecha um turno". O
 * `cashregister` é a SESSÃO FÍSICA de uma gaveta: um turno com começo e fim,
 * com ciclo `open → closed` e `closed` terminal. Copiar sem pensar e divergir
 * sem escrever são o mesmo erro — este bloco ASSINA o contraste.
 */
describe('⭐⭐ o DIVERGE cashregister × cash — livro perpétuo × turno com fim', () => {
  test('⭐ o cash NÃO tem allowed_transition (é livro, não máquina de estados)', () => {
    const cashSql = readFileSync(MIGRATION_CASH, 'utf8');
    // O cash tem allowed_transition SÓ para a CATEGORIA (active/archived), nunca
    // para os lançamentos (entries) — o livro não tem ciclo. Confere que não
    // existe transição de status de LANÇAMENTO.
    assert.doesNotMatch(
      cashSql,
      /cash\.entry[_a-z]*allowed_transition/i,
      'apareceu uma transição de status para os lançamentos do cash — o livro não tem ciclo',
    );
  });

  test('⭐ o LIVRO do cash (entries) não tem coluna status — não tem ciclo de vida', () => {
    const cashSql = readFileSync(MIGRATION_CASH, 'utf8');
    const entriesBloco = cashSql.split('create table cash.entries')[1]?.split(');')[0] ?? '';
    assert.ok(entriesBloco.length > 0, 'a tabela cash.entries sumiu da migration do cash');
    assert.doesNotMatch(
      entriesBloco,
      /^\s*status\s/im,
      'cash.entries ganhou uma coluna status — o livro-caixa não fecha turno',
    );
  });

  test('⭐ o cashregister TEM ciclo com fechamento terminal — a física oposta', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    // A sessão TEM coluna status com o CHECK das duas fases do turno.
    assert.match(sql, /status\s+text[\s\S]*?check\s*\(\s*status\s+in\s*\(\s*'open'\s*,\s*'closed'\s*\)\s*\)/i);
    // E TEM a função de transição que o cash não tem.
    assert.match(sql, /create\s+or\s+replace\s+function\s+cashregister\.allowed_transition/i);
    // No motor TS, o fim é terminal.
    assert.deepEqual([...nextStatuses('closed')], []);
  });
});
