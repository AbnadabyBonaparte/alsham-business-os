import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  canSend,
  canDecide,
  canCancel,
  canEditContent,
  isExpirable,
} from './quote.ts';
import type { Proposal, ProposalStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0024_quote.sql');
const MIGRATION_OPS = resolve(HERE, '../../../supabase/migrations/0018_ops.sql');

const TODOS: readonly ProposalStatus[] = [
  'draft',
  'sent',
  'accepted',
  'declined',
  'expired',
  'cancelled',
];

function proposta(over: Partial<Proposal> = {}): Proposal {
  return {
    externalRef: 'PROP-2026-001',
    currency: 'BRL',
    prospectName: 'Prospecto Demo',
    counterpartyTaxId: null,
    description: '',
    validUntil: null,
    totalCents: 100000,
    status: 'sent',
    decidedAt: null,
    decisionNote: '',
    items: [],
    ...over,
  };
}

describe('o ciclo de vida da proposta', () => {
  /**
   * ⭐⭐ **A DECISÃO DE CANON DO MÓDULO: os quatro fins são TERMINAIS.**
   *
   * A proposta tem identidade por DOCUMENTO — a régua do `ap`, não a do
   * `ops`. O cliente aceitou ou recusou UMA proposta específica, com valores
   * específicos; renegociar é documento novo, com referência nova.
   */
  test('⭐ aceita, recusada, expirada e cancelada não saem de lá', () => {
    for (const fim of ['accepted', 'declined', 'expired', 'cancelled'] as const) {
      for (const destino of TODOS.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
  });

  test('o caminho feliz: draft → sent → accepted', () => {
    assert.equal(canTransition('draft', 'sent'), true);
    assert.equal(canTransition('sent', 'accepted'), true);
  });

  test('⛔ rascunho não se aceita: aceite é resposta a proposta NA MESA', () => {
    assert.equal(canTransition('draft', 'accepted'), false);
    assert.equal(canTransition('draft', 'declined'), false);
    assert.equal(canTransition('draft', 'expired'), false);
  });

  test('retirar (cancelled) existe do rascunho e da mesa', () => {
    assert.equal(canTransition('draft', 'cancelled'), true);
    assert.equal(canTransition('sent', 'cancelled'), true);
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('draft')].sort(), ['cancelled', 'sent']);
    assert.deepEqual([...nextStatuses('sent')].sort(), [
      'accepted',
      'cancelled',
      'declined',
      'expired',
    ]);
    assert.deepEqual([...nextStatuses('accepted')], []);
  });

  test('canSend, canDecide, canCancel e canEditContent concordam com a tabela', () => {
    assert.equal(canSend('draft'), true);
    assert.equal(canSend('sent'), false);
    assert.equal(canDecide('sent'), true);
    assert.equal(canDecide('draft'), false);
    assert.equal(canDecide('accepted'), false);
    assert.equal(canCancel('sent'), true);
    assert.equal(canCancel('accepted'), false);
    assert.equal(canEditContent('draft'), true);
    assert.equal(canEditContent('sent'), false);
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

  test('quote.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'quote.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 6, 'o SQL declara seis pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O contraste com o `ops` é EXIGIDO: lá `done → in_progress` existe
   * (trabalho tem identidade por serviço); aqui nenhum fim volta (proposta
   * tem identidade por documento). Se alguém "uniformizar" qualquer lado,
   * este teste reprova e obriga a decisão a ser tomada de novo, por escrito.
   */
  test('⭐ o ops reabre e a proposta NÃO — os dois de propósito', () => {
    const doOps = paresDoSql(MIGRATION_OPS, 'ops.allowed_transition');
    const doQuote = paresDoSql(MIGRATION, 'quote.allowed_transition');

    assert.equal(doOps.has('done→in_progress'), true, 'o ops reabre o trabalho');
    for (const par of doQuote) {
      const [de] = par.split('→');
      assert.ok(
        !['accepted', 'declined', 'expired', 'cancelled'].includes(de!),
        `a proposta ganhou uma volta (${par}) — renegociar é documento novo`,
      );
    }
  });
});

describe('⭐ expirar é calendário, nunca vontade', () => {
  test('sem validade, nunca expira — recusa-se ou retira-se', () => {
    assert.equal(isExpirable(proposta({ validUntil: null }), '2026-07-29'), false);
  });

  test('validade no futuro não expira; vencida, expira', () => {
    assert.equal(isExpirable(proposta({ validUntil: '2026-08-01' }), '2026-07-29'), false);
    assert.equal(isExpirable(proposta({ validUntil: '2026-07-28' }), '2026-07-29'), true);
  });

  test('⛔ só proposta NA MESA expira — rascunho e fins não', () => {
    assert.equal(
      isExpirable(proposta({ status: 'draft', validUntil: '2020-01-01' }), '2026-07-29'),
      false,
    );
    assert.equal(
      isExpirable(proposta({ status: 'accepted', validUntil: '2020-01-01' }), '2026-07-29'),
      false,
    );
  });
});
