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
  canComplete,
  canCancel,
  canEditContent,
} from './pdv.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0086_pdv.sql');
const MIGRATION_RFQ = resolve(HERE, '../../../supabase/migrations/0059_rfq.sql');

/** Os pares `('a','b')` de uma função `allowed_transition` na migration. */
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

describe('o ciclo de vida da venda', () => {
  test('o caminho feliz: draft → completed', () => {
    assert.equal(canTransition('draft', 'completed'), true);
    assert.equal(canTransition('draft', 'cancelled'), true);
  });

  /**
   * ⭐ completed e cancelled são TERMINAIS: a venda tem identidade por CUPOM
   * (a física do `proj`/`bud`). Venda cancelada não reabre — refazer é venda
   * nova.
   */
  test('⭐ finalizada e cancelada não saem de lá (os dois terminais)', () => {
    for (const fim of ['completed', 'cancelled'] as const) {
      for (const destino of ALL_STATUSES.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
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
    assert.deepEqual([...nextStatuses('draft')].sort(), ['cancelled', 'completed']);
    assert.deepEqual([...nextStatuses('completed')], []);
    assert.deepEqual([...nextStatuses('cancelled')], []);
  });

  test('⭐ finalizar e cancelar só existem a partir do rascunho', () => {
    assert.equal(canComplete('draft'), true);
    assert.equal(canComplete('completed'), false);
    assert.equal(canComplete('cancelled'), false);
    assert.equal(canCancel('draft'), true);
    assert.equal(canCancel('completed'), false);
    assert.equal(canCancel('cancelled'), false);
    assert.equal(canEditContent('draft'), true);
    assert.equal(canEditContent('completed'), false);
    assert.equal(canEditContent('cancelled'), false);
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados (TS × SQL)', () => {
  test('pdv.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'pdv.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE do `rfq` é EXIGIDO por escrito: a RFQ vai ao MERCADO
   * (`draft → open → awarded`) — tem um estado intermediário `open`. A VENDA
   * fecha na hora (`draft → completed/cancelled`), sem intermediário: o cupom
   * do balcão não "vai ao mercado". Se alguém "uniformizar" os dois, este teste
   * reprova e obriga a decisão a ser tomada de novo.
   */
  test('⭐ a RFQ tem o meio-termo `open`; a venda NÃO — o cupom fecha na hora', () => {
    const doRfq = paresDoSql(MIGRATION_RFQ, 'rfq.allowed_transition');
    const doPdv = paresDoSql(MIGRATION, 'pdv.allowed_transition');

    // A RFQ passa por `open` antes de premiar.
    const rfqTemOpen = [...doRfq].some((par) => par.split('→').includes('open'));
    assert.ok(rfqTemOpen, 'a RFQ perdeu o meio-termo open — o contraste deixa de existir');

    // A venda NUNCA toca em `open` (nem de origem, nem de destino).
    const pdvTemOpen = [...doPdv].some((par) => par.split('→').includes('open'));
    assert.ok(!pdvTemOpen, 'a venda ganhou um meio-termo open — ela deveria fechar na hora');

    // E nenhum fim da venda tem volta (completed/cancelled terminais).
    for (const par of doPdv) {
      const [de] = par.split('→');
      assert.ok(
        !['completed', 'cancelled'].includes(de!),
        `a venda ganhou uma volta (${par}) — venda cancelada não reabre`,
      );
    }
  });

  test('⭐ o congelamento é do schema: item e cabeçalho travam fora do rascunho', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.match(sql, /guard_item_frozen/, 'o gatilho que congela os itens sumiu');
    assert.match(sql, /guard_header_frozen/, 'o gatilho que congela o cabeçalho sumiu');
  });
});
