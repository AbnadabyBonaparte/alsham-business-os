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
  canHomologate,
  canCancel,
  canEditContent,
  canReceiveProposals,
  orderTenders,
  summarizeTenders,
} from './bid.ts';
import type { Tender } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0107_bid.sql');
const MIGRATION_RFQ = resolve(HERE, '../../../supabase/migrations/0059_rfq.sql');

function licitacao(over: Partial<Tender> = {}): Tender {
  return {
    id: 't1',
    title: 'Licitação',
    description: '',
    modality: '',
    status: 'draft',
    homologatedBidderId: null,
    homologatedBidderName: '',
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

describe('o ciclo de vida da licitação', () => {
  test('o caminho feliz: draft → open → homologated', () => {
    assert.equal(canTransition('draft', 'open'), true);
    assert.equal(canTransition('open', 'homologated'), true);
  });

  /**
   * ⭐ homologated e cancelled são TERMINAIS: a licitação tem identidade por
   * EDITAL (a régua do `rfq`/`quote`). Refazer é licitação nova.
   */
  test('⭐ homologada e cancelada não saem de lá', () => {
    for (const fim of ['homologated', 'cancelled'] as const) {
      for (const destino of ALL_STATUSES.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
  });

  test('⛔ rascunho não se homologa: homologar é ato sobre licitação ABERTA', () => {
    assert.equal(canTransition('draft', 'homologated'), false);
  });

  test('cancelar existe do rascunho e da licitação aberta', () => {
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
    assert.deepEqual([...nextStatuses('open')].sort(), ['cancelled', 'homologated']);
    assert.deepEqual([...nextStatuses('homologated')], []);
    assert.deepEqual([...nextStatuses('cancelled')], []);
  });

  test('canPublish, canHomologate, canCancel, canEditContent e canReceiveProposals concordam com a tabela', () => {
    assert.equal(canPublish('draft'), true);
    assert.equal(canPublish('open'), false);
    assert.equal(canHomologate('open'), true);
    assert.equal(canHomologate('draft'), false);
    assert.equal(canHomologate('homologated'), false);
    assert.equal(canCancel('draft'), true);
    assert.equal(canCancel('open'), true);
    assert.equal(canCancel('homologated'), false);
    assert.equal(canEditContent('draft'), true);
    assert.equal(canEditContent('open'), false);
    // ⭐ propostas só na janela aberta.
    assert.equal(canReceiveProposals('open'), true);
    assert.equal(canReceiveProposals('draft'), false);
    assert.equal(canReceiveProposals('homologated'), false);
  });

  test('a leitura ordena aberta primeiro, depois rascunho, depois os fins', () => {
    const lista = [
      licitacao({ id: 'h', title: 'Homologada', status: 'homologated', homologatedBidderId: 's', homologatedBidderName: 'S' }),
      licitacao({ id: 'd', title: 'Draft', status: 'draft' }),
      licitacao({ id: 'o', title: 'Open', status: 'open' }),
      licitacao({ id: 'c', title: 'Cancelada', status: 'cancelled', cancelReason: 'x' }),
    ];
    assert.deepEqual(
      orderTenders(lista).map((t) => t.id),
      ['o', 'd', 'h', 'c'],
    );
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      licitacao({ status: 'draft' }),
      licitacao({ status: 'open' }),
      licitacao({ status: 'open' }),
      licitacao({ status: 'homologated', homologatedBidderId: 's', homologatedBidderName: 'S' }),
    ];
    assert.deepEqual(summarizeTenders(lista), { total: 4, draft: 1, open: 2, homologated: 1, cancelled: 0 });
    assert.deepEqual(summarizeTenders([]), { total: 0, draft: 0, open: 0, homologated: 0, cancelled: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('bid.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'bid.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 4, 'o SQL declara quatro pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE do `rfq` é EXIGIDO por escrito: os dois congelam ao publicar e
   * têm fins terminais decididos por quem CONDUZ (não pelo fornecedor), mas o
   * TERMINAL tem NOME diferente. No `rfq`, o comprador PREMIA — `open → awarded`.
   * Na licitação, o órgão HOMOLOGA — `open → homologated` (o ato solene da Lei
   * 14.133). Se alguém "uniformizar" qualquer lado, este teste reprova e obriga a
   * decisão a ser tomada de novo.
   */
  test('⭐ o rfq premia (awarded) e a licitação homologa (homologated) — os dois de propósito', () => {
    const doRfq = paresDoSql(MIGRATION_RFQ, 'rfq.allowed_transition');
    const doBid = paresDoSql(MIGRATION, 'bid.allowed_transition');

    // O rfq termina no prêmio neutro do comprador.
    assert.ok(doRfq.has('open→awarded'), 'o rfq é decidido pelo comprador (awarded)');
    assert.ok(!doRfq.has('open→homologated'), 'o rfq não homologa — não é ato público solene');

    // A licitação termina na homologação do órgão.
    assert.ok(doBid.has('open→homologated'), 'a licitação é decidida pela homologação (homologated)');
    assert.ok(!doBid.has('open→awarded'), 'a licitação não premia — homologa (Lei 14.133)');
    // E nenhum fim da licitação tem volta.
    for (const par of doBid) {
      const [de] = par.split('→');
      assert.ok(
        !['homologated', 'cancelled'].includes(de!),
        `a licitação ganhou uma volta (${par}) — refazer é licitação nova`,
      );
    }
  });
});
