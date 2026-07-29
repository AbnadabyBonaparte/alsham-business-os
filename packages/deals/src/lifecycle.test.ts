import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  canClose,
  buildFunnelBoard,
  orderedStages,
  weightedCents,
  isPastExpectedClose,
  whyCannotLose,
  summarizeFunnel,
} from './deal.ts';
import type { FunnelStage, Opportunity, OpportunityStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0025_deal.sql');
const MIGRATION_OPS = resolve(HERE, '../../../supabase/migrations/0018_ops.sql');

const FUNIL: readonly FunnelStage[] = [
  { id: 's0', funnelId: 'f', position: 0, name: 'contato' },
  { id: 's1', funnelId: 'f', position: 1, name: 'conversa' },
  { id: 's2', funnelId: 'f', position: 2, name: 'proposta na mesa' },
  { id: 's3', funnelId: 'f', position: 3, name: 'aperto de mão' },
];

function opp(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'o1',
    tenantId: 't1',
    funnelId: 'f',
    currentStageId: 's1',
    title: 'Contrato anual',
    description: '',
    valueCents: 100000,
    currency: 'BRL',
    probability: 50,
    expectedCloseDate: null,
    partyId: null,
    partyName: null,
    tags: [],
    status: 'open',
    outcomeReason: '',
    ...over,
  };
}

describe('o ciclo de vida da negociação', () => {
  /**
   * ⭐⭐ **A DECISÃO DE CANON: `won` e `lost` são TERMINAIS.** O desfecho é
   * registrado com razão; reabri-lo reescreveria o que foi decidido. O
   * cliente que volta é negociação NOVA — e a história da anterior fica.
   */
  test('⭐ ganho e perda não voltam', () => {
    const TODOS: readonly OpportunityStatus[] = ['open', 'won', 'lost'];
    for (const fim of ['won', 'lost'] as const) {
      for (const destino of TODOS.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
  });

  test('aberta se ganha ou se perde — e nada mais', () => {
    assert.equal(canTransition('open', 'won'), true);
    assert.equal(canTransition('open', 'lost'), true);
    assert.equal(canClose('open'), true);
    assert.equal(canClose('won'), false);
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

  test('deal.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'deal.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O contraste com o `ops` é EXIGIDO: lá o trabalho reabre; aqui o
   * desfecho não. Se alguém "uniformizar", este teste obriga a decisão a
   * ser tomada de novo, por escrito.
   */
  test('⭐ o ops reabre e a negociação NÃO — os dois de propósito', () => {
    const doOps = paresDoSql(MIGRATION_OPS, 'ops.allowed_transition');
    const doDeal = paresDoSql(MIGRATION, 'deal.allowed_transition');
    assert.equal(doOps.has('done→in_progress'), true);
    for (const par of doDeal) {
      assert.ok(par.startsWith('open→'), `só se sai de open — apareceu ${par}`);
    }
  });
});

/**
 * ⭐⭐ A LEI DAS ETAPAS E O MOVIMENTO LIVRE, conferidos no ARQUIVO: nenhum
 * enum de estágio, nenhum `requires_approval` (a decisão do funil é
 * ganhar/perder), e nenhuma FK para o crm — o vínculo é solto.
 */
describe('⭐⭐ o schema honra as três divergências', () => {
  const codigo = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

  test('nenhum estágio virou enum', () => {
    assert.doesNotMatch(codigo, /create\s+type\s+deal\./i);
  });

  test('⭐ sem requires_approval e sem skippable — a divergência 2', () => {
    assert.doesNotMatch(codigo, /requires_approval|skippable/);
  });

  test('⭐ o vínculo com o crm é SOLTO — nenhuma FK atravessa a fronteira', () => {
    assert.doesNotMatch(codigo, /references\s+crm\./i);
    assert.match(codigo, /party_id\s+uuid,/);
    assert.match(codigo, /party_name\s+text,/);
  });

  test('⛔ a metodologia de venda de uma casa não virou schema de todas', () => {
    assert.doesNotMatch(codigo, /competitors|pain_points|decision_makers|deal_size|score_ia/i);
  });
});

describe('o quadro é montado com os estágios DO TENANT', () => {
  test('uma coluna por estágio, na ordem', () => {
    const colunas = buildFunnelBoard(FUNIL, []);
    assert.deepEqual(colunas.map((c) => c.stage.name), [
      'contato',
      'conversa',
      'proposta na mesa',
      'aperto de mão',
    ]);
  });

  test('⛔ negociação encerrada não entra em coluna nenhuma', () => {
    const colunas = buildFunnelBoard(FUNIL, [
      opp({ id: 'a', currentStageId: 's3', status: 'won', outcomeReason: 'fechado' }),
      opp({ id: 'b', currentStageId: 's3' }),
    ]);
    assert.equal(colunas[3]!.opportunities.length, 1);
    assert.equal(colunas[3]!.opportunities[0]!.id, 'b');
  });

  test('orderedStages ordena por posição mesmo embaralhado', () => {
    assert.deepEqual(
      orderedStages([FUNIL[2]!, FUNIL[0]!]).map((s) => s.name),
      ['contato', 'proposta na mesa'],
    );
  });
});

describe('⭐ o forecast pondera pela mão humana — e não inventa número', () => {
  test('valor × probabilidade, arredondado', () => {
    assert.equal(weightedCents(opp({ valueCents: 100000, probability: 50 })), 50000);
  });

  test('⛔ sem probabilidade não entra na conta — nem como 0, nem como 100', () => {
    assert.equal(weightedCents(opp({ probability: null })), null);
    assert.equal(weightedCents(opp({ valueCents: null, currency: null })), null);
  });

  test('o resumo separa aberto de ponderado, por moeda', () => {
    const r = summarizeFunnel([
      opp({ id: 'a', valueCents: 100000, probability: 50 }),
      opp({ id: 'b', valueCents: 40000, probability: null }),
      opp({ id: 'c', status: 'won', outcomeReason: 'ok' }),
      opp({ id: 'd', status: 'lost', outcomeReason: 'preço' }),
    ]);
    assert.equal(r.open, 2);
    assert.equal(r.won, 1);
    assert.equal(r.lost, 1);
    assert.equal(r.openCentsByCurrency.get('BRL'), 140000);
    assert.equal(r.weightedCentsByCurrency.get('BRL'), 50000, 'só o que tem probabilidade pondera');
  });
});

describe('perder exige razão; a expectativa vencida sinaliza', () => {
  test('whyCannotLose explica as duas recusas', () => {
    assert.match(whyCannotLose(opp({ status: 'won' }), 'x') ?? '', /encerrada/);
    assert.match(whyCannotLose(opp(), '  ') ?? '', /razão/);
    assert.equal(whyCannotLose(opp(), 'preço acima do concorrente'), null);
  });

  test('expectativa passada + aberta = atrasada; encerrada nunca', () => {
    assert.equal(
      isPastExpectedClose(opp({ expectedCloseDate: '2026-07-01' }), '2026-07-29'),
      true,
    );
    assert.equal(
      isPastExpectedClose(
        opp({ expectedCloseDate: '2026-07-01', status: 'won', outcomeReason: 'ok' }),
        '2026-07-29',
      ),
      false,
    );
    assert.equal(isPastExpectedClose(opp({ expectedCloseDate: null }), '2026-07-29'), false);
  });
});
