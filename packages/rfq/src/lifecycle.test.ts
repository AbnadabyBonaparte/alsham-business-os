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
  canSend,
  canAward,
  canCancel,
  canEditContent,
  orderRequests,
  summarizeRequests,
} from './rfq.ts';
import type { Request } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0059_rfq.sql');
const MIGRATION_QUOTE = resolve(HERE, '../../../supabase/migrations/0024_quote.sql');

function cotacao(over: Partial<Request> = {}): Request {
  return {
    id: 'r1',
    title: 'Cotação',
    description: '',
    status: 'draft',
    awardedSupplierId: null,
    awardedSupplierName: '',
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

describe('o ciclo de vida da cotação', () => {
  test('o caminho feliz: draft → open → awarded', () => {
    assert.equal(canTransition('draft', 'open'), true);
    assert.equal(canTransition('open', 'awarded'), true);
  });

  /**
   * ⭐ awarded e cancelled são TERMINAIS: a cotação tem identidade por
   * DOCUMENTO (a régua do `quote`). Refazer é cotação nova.
   */
  test('⭐ premiada e cancelada não saem de lá', () => {
    for (const fim of ['awarded', 'cancelled'] as const) {
      for (const destino of ALL_STATUSES.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
  });

  test('⛔ rascunho não se premia: premiar é escolha sobre cotação NO MERCADO', () => {
    assert.equal(canTransition('draft', 'awarded'), false);
  });

  test('cancelar existe do rascunho e do mercado', () => {
    assert.equal(canTransition('draft', 'cancelled'), true);
    assert.equal(canTransition('open', 'cancelled'), true);
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
    assert.deepEqual([...nextStatuses('draft')].sort(), ['cancelled', 'open']);
    assert.deepEqual([...nextStatuses('open')].sort(), ['awarded', 'cancelled']);
    assert.deepEqual([...nextStatuses('awarded')], []);
    assert.deepEqual([...nextStatuses('cancelled')], []);
  });

  test('canSend, canAward, canCancel e canEditContent concordam com a tabela', () => {
    assert.equal(canSend('draft'), true);
    assert.equal(canSend('open'), false);
    assert.equal(canAward('open'), true);
    assert.equal(canAward('draft'), false);
    assert.equal(canAward('awarded'), false);
    assert.equal(canCancel('draft'), true);
    assert.equal(canCancel('open'), true);
    assert.equal(canCancel('awarded'), false);
    assert.equal(canEditContent('draft'), true);
    assert.equal(canEditContent('open'), false);
  });

  test('a leitura ordena mercado primeiro, depois rascunho, depois os fins', () => {
    const lista = [
      cotacao({ id: 'a', title: 'Awarded', status: 'awarded', awardedSupplierId: 's', awardedSupplierName: 'S' }),
      cotacao({ id: 'd', title: 'Draft', status: 'draft' }),
      cotacao({ id: 'o', title: 'Open', status: 'open' }),
      cotacao({ id: 'c', title: 'Cancelled', status: 'cancelled', cancelReason: 'x' }),
    ];
    assert.deepEqual(
      orderRequests(lista).map((r) => r.id),
      ['o', 'd', 'a', 'c'],
    );
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      cotacao({ status: 'draft' }),
      cotacao({ status: 'open' }),
      cotacao({ status: 'open' }),
      cotacao({ status: 'awarded', awardedSupplierId: 's', awardedSupplierName: 'S' }),
    ];
    assert.deepEqual(summarizeRequests(lista), { total: 4, draft: 1, open: 2, awarded: 1, cancelled: 0 });
    assert.deepEqual(summarizeRequests([]), { total: 0, draft: 0, open: 0, awarded: 0, cancelled: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('rfq.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'rfq.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 4, 'o SQL declara quatro pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE do `quote` é EXIGIDO por escrito: os dois congelam ao enviar e
   * têm fins terminais, mas o TERMINAL é diferente. No `quote`, quem decide é o
   * CLIENTE — `sent → accepted` (a contraparte responde). Na RFQ, quem decide é
   * o COMPRADOR — `open → awarded` (a empresa premia). Se alguém "uniformizar"
   * qualquer lado, este teste reprova e obriga a decisão a ser tomada de novo.
   */
  test('⭐ o quote responde (accepted) e a RFQ premia (awarded) — os dois de propósito', () => {
    const doQuote = paresDoSql(MIGRATION_QUOTE, 'quote.allowed_transition');
    const doRfq = paresDoSql(MIGRATION, 'rfq.allowed_transition');

    // O quote termina na resposta do cliente.
    assert.ok(doQuote.has('sent→accepted'), 'o quote é decidido pelo cliente (accepted)');
    assert.ok(!doQuote.has('open→awarded'), 'o quote não premia — não é decisão do comprador');

    // A RFQ termina na escolha do comprador.
    assert.ok(doRfq.has('open→awarded'), 'a RFQ é decidida pelo comprador (awarded)');
    assert.ok(!doRfq.has('sent→accepted'), 'a RFQ não espera resposta de cliente');
    // E nenhum fim da RFQ tem volta.
    for (const par of doRfq) {
      const [de] = par.split('→');
      assert.ok(
        !['awarded', 'cancelled'].includes(de!),
        `a cotação ganhou uma volta (${par}) — refazer é cotação nova`,
      );
    }
  });
});
