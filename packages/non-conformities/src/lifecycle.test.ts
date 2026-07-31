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
  orderEntries,
  summarizeEntries,
} from './non-conformities.ts';
import type { Entry } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0078_nc.sql');
const MIGRATION_OCC = resolve(HERE, '../../../supabase/migrations/0031_occ.sql');

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: 'nc1',
    origin: 'auditoria interna',
    description: 'desvio constatado',
    rootCause: '',
    capaActionId: null,
    previousEntryId: null,
    status: 'open',
    verificationNote: '',
    ...over,
  };
}

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

describe('o ciclo de vida da não conformidade', () => {
  test('o caminho: open → closed (terminal — a física do occ)', () => {
    assert.equal(canTransition('open', 'closed'), true);
    assert.equal(canTransition('closed', 'open'), false); // closed é TERMINAL
  });

  test('⭐ fechar existe da aberta; a fechada é terminal', () => {
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

  test('a leitura ordena abertas primeiro, depois fechadas; dentro, por origem', () => {
    const lista = [
      entry({ id: 'z', origin: 'zeladoria', status: 'closed' }),
      entry({ id: 'a', origin: 'auditoria', status: 'open' }),
      entry({ id: 'm', origin: 'inspeção', status: 'open' }),
    ];
    assert.deepEqual(orderEntries(lista).map((e) => e.id), ['a', 'm', 'z']);
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      entry({ status: 'open' }),
      entry({ status: 'closed' }),
      entry({ status: 'closed' }),
    ];
    assert.deepEqual(summarizeEntries(lista), { total: 3, open: 1, closed: 2 });
    assert.deepEqual(summarizeEntries([]), { total: 0, open: 0, closed: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('nc.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'nc.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 1, 'o SQL declara um par');
    assert.deepEqual([...doSql], [...doTs]);
    assert.deepEqual([...doSql], ['open→closed']);
  });

  /**
   * ⭐ O contraste com o `occ`: a NC REAPROVEITA a identidade do `occ` — o
   * registro imutável, e o MESMO ciclo `open → closed` terminal (recorrência é
   * registro novo, nunca reabertura). Este teste lê as duas migrations e prova
   * que as duas físicas de ciclo coincidem — o DIVERGE do módulo NÃO está aqui,
   * na transição, mas no FECHAMENTO (a NC exige a nota de verificação; o occ
   * fecha com um desfecho livre). Copiar sem pensar e divergir sem escrever são
   * o mesmo erro: aqui o que se mantém está assinado.
   */
  test('⭐ a NC mantém o ciclo do occ: open → closed terminal, nos dois', () => {
    const doNc = paresDoSql(MIGRATION, 'nc.allowed_transition');
    const doOcc = paresDoSql(MIGRATION_OCC, 'occ.allowed_transition');
    assert.deepEqual([...doNc].sort(), [...doOcc].sort());
    assert.ok(doNc.has('open→closed'), 'fechar existe');
    assert.ok(!doNc.has('closed→open'), 'a NC fechada é terminal — recorrência é NC nova');
  });
});
