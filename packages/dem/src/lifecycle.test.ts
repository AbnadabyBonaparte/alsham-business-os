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
  canPublish,
  canCancel,
  canEditContent,
  orderPlans,
  summarizePlans,
} from './dem.ts';
import type { Plan } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0063_dem.sql');
const MIGRATION_RFQ = resolve(HERE, '../../../supabase/migrations/0059_rfq.sql');

function plano(over: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    period: 'Q1 2027',
    title: '',
    status: 'draft',
    cancelReason: '',
    lines: [],
    ...over,
  };
}

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

describe('o ciclo de vida do plano de demanda', () => {
  test('o caminho feliz: draft → published', () => {
    assert.equal(canTransition('draft', 'published'), true);
    assert.equal(canPublish('draft'), true);
  });

  /**
   * ⭐ published e cancelled são TERMINAIS: o plano tem identidade por PERÍODO.
   * O próximo período é plano novo (a física do bud).
   */
  test('⭐ publicado e cancelado não saem de lá', () => {
    for (const fim of ['published', 'cancelled'] as const) {
      for (const destino of ALL_STATUSES.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
  });

  test('cancelar (abandonar) só existe para o rascunho', () => {
    assert.equal(canCancel('draft'), true);
    assert.equal(canCancel('published'), false);
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
    assert.deepEqual([...nextStatuses('draft')].sort(), ['cancelled', 'published']);
    assert.deepEqual([...nextStatuses('published')], []);
    assert.deepEqual([...nextStatuses('cancelled')], []);
  });

  test('canPublish, canCancel e canEditContent concordam com a tabela', () => {
    assert.equal(canPublish('draft'), true);
    assert.equal(canPublish('published'), false);
    assert.equal(canCancel('draft'), true);
    assert.equal(canCancel('cancelled'), false);
    assert.equal(canEditContent('draft'), true);
    assert.equal(canEditContent('published'), false);
  });

  test('a leitura ordena rascunho primeiro, depois publicados, depois cancelados', () => {
    const lista = [
      plano({ id: 'c', period: 'Cancelado', status: 'cancelled', cancelReason: 'x' }),
      plano({ id: 'p', period: 'Publicado', status: 'published' }),
      plano({ id: 'd', period: 'Draft', status: 'draft' }),
    ];
    assert.deepEqual(
      orderPlans(lista).map((p) => p.id),
      ['d', 'p', 'c'],
    );
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      plano({ status: 'draft' }),
      plano({ status: 'published' }),
      plano({ status: 'published' }),
      plano({ status: 'cancelled', cancelReason: 'x' }),
    ];
    assert.deepEqual(summarizePlans(lista), { total: 4, draft: 1, published: 2, cancelled: 1 });
    assert.deepEqual(summarizePlans([]), { total: 0, draft: 0, published: 0, cancelled: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('dem.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'dem.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE do `rfq` é EXIGIDO por escrito: os dois congelam ao publicar/
   * enviar, mas a RFQ tem um SEGUNDO ato (o comprador premia — `open→awarded`)
   * e o plano NÃO — `published` é terminal. Se alguém der uma volta ao plano
   * publicado (ou tirar o `awarded` da RFQ), este teste reprova.
   */
  test('⭐ a RFQ premia (open→awarded); o plano publica e encerra (published sem saída)', () => {
    const doRfq = paresDoSql(MIGRATION_RFQ, 'rfq.allowed_transition');
    const doDem = paresDoSql(MIGRATION, 'dem.allowed_transition');

    // A RFQ tem o segundo ato.
    assert.ok(doRfq.has('open→awarded'), 'a RFQ é decidida pelo comprador (awarded)');

    // O plano NÃO tem segundo ato: nada sai de published.
    for (const par of doDem) {
      const [de] = par.split('→');
      assert.ok(
        !['published', 'cancelled'].includes(de!),
        `o plano ganhou uma volta (${par}) — o próximo período é plano novo`,
      );
    }
    assert.ok(!doDem.has('published→draft'), 'publicado não volta a rascunho');
  });
});
