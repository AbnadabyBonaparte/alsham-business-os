import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  LINE_KINDS,
  canArchive,
  canRestore,
  canTransition,
  computeResult,
  orderLines,
} from './dre.ts';
import type { DreLine, StatementRow } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0047_dre.sql');

function line(over: Partial<DreLine> = {}): DreLine {
  return { id: 'l1', name: 'Vendas', kind: 'revenue', matchCategory: 'Vendas', position: 0, currency: 'BRL', status: 'active', ...over };
}

function row(kind: StatementRow['kind'], amount: number, over: Partial<StatementRow> = {}): StatementRow {
  return { lineId: `r-${kind}`, lineName: kind, kind, position: 0, currency: 'BRL', competenceMonth: '2026-07-01', amountCents: amount, entryCount: 1, ...over };
}

describe('o ciclo de vida da linha — espelho da migration', () => {
  test('ALLOWED_TRANSITIONS é idêntico ao corpo de dre.allowed_transition()', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const corpo = sql.match(/allowed_transition[\s\S]*?\(p_from, p_to\) in \(([\s\S]*?)\)\s*;/);
    assert.ok(corpo, 'não achei o corpo de dre.allowed_transition na migration');
    const listaSql = corpo[1] ?? '';
    const paresSql = [...listaSql.matchAll(/\('([a-z]+)',\s*'([a-z]+)'\)/g)].map((m) => `${m[1]}->${m[2]}`).sort();
    const paresTs = ALLOWED_TRANSITIONS.map(([f, t]) => `${f}->${t}`).sort();
    assert.deepEqual(paresTs, paresSql);
  });

  test('⭐ a linha volta do arquivo', () => {
    assert.ok(canArchive('active'));
    assert.ok(canRestore('archived'));
    assert.ok(!canTransition('active', 'active'));
  });

  test('⭐ a natureza é o ÚNICO enum — física contábil (CHECK argumentado)', () => {
    assert.deepEqual([...LINE_KINDS], ['revenue', 'cost', 'expense']);
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /kind in \('revenue', 'cost', 'expense'\)/);
    // ⭐ mas não há enum de tipo Postgres — o vocabulário fixo é só a natureza.
    assert.doesNotMatch(sql, /create\s+type\s+dre\./i);
  });
});

describe('o resultado — soma dos sinais; totais calculados', () => {
  test('receita soma, custo e despesa (negativos) subtraem', () => {
    const r = computeResult([
      row('revenue', 500000),
      row('cost', -200000),
      row('expense', -80000),
    ]);
    assert.equal(r.revenueCents, 500000);
    assert.equal(r.costCents, -200000);
    assert.equal(r.expenseCents, -80000);
    assert.equal(r.resultCents, 220000, 'resultado = 500.000 − 200.000 − 80.000');
  });

  test('sem linhas, resultado zero', () => {
    const r = computeResult([]);
    assert.equal(r.resultCents, 0);
  });

  test('⭐ os totais/subtotais são VIEWS na migration, nunca colunas', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /create view dre\.result/);
    assert.match(sql, /create view dre\.statement/);
    // nenhuma coluna result_cents/total numa create table
    assert.doesNotMatch(sql, /create table[\s\S]*?result_cents\s+bigint/i);
    // ⭐ INNER JOIN: linha sem lançamento não aparece (nps).
    assert.match(sql, /from dre\.lines l\s*\n\s*join dre\.realized_entries/);
  });
});

describe('a ordem de leitura do plano', () => {
  test('por posição, depois por nome', () => {
    const lista: DreLine[] = [
      line({ id: 'c', name: 'Custos', position: 2 }),
      line({ id: 'r', name: 'Receita', position: 0 }),
      line({ id: 'd', name: 'Despesas', position: 1 }),
    ];
    assert.deepEqual(orderLines(lista).map((l) => l.id), ['r', 'd', 'c']);
  });
});
