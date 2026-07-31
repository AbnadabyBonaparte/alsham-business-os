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
  canApprove,
  canCancel,
  canEditContent,
  orderRounds,
  summarizeRounds,
} from './sop.ts';
import type { Round } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0064_sop.sql');
const MIGRATION_DEM = resolve(HERE, '../../../supabase/migrations/0063_dem.sql');

function rodada(over: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    period: 'Q1 2027',
    title: '',
    planId: null,
    planName: '',
    status: 'draft',
    cancelReason: '',
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

describe('o ciclo de vida da rodada de consenso', () => {
  test('o caminho feliz: draft → approved', () => {
    assert.equal(canTransition('draft', 'approved'), true);
    assert.equal(canApprove('draft'), true);
  });

  /**
   * ⭐ approved e cancelled são TERMINAIS: aprovar CONGELA a rodada. A próxima
   * rodada é rodada nova.
   */
  test('⭐ aprovada e cancelada não saem de lá', () => {
    for (const fim of ['approved', 'cancelled'] as const) {
      for (const destino of ALL_STATUSES.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
  });

  test('cancelar (abandonar) só existe para o rascunho', () => {
    assert.equal(canCancel('draft'), true);
    assert.equal(canCancel('approved'), false);
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
    assert.deepEqual([...nextStatuses('draft')].sort(), ['approved', 'cancelled']);
    assert.deepEqual([...nextStatuses('approved')], []);
    assert.deepEqual([...nextStatuses('cancelled')], []);
  });

  test('canApprove, canCancel e canEditContent concordam com a tabela', () => {
    assert.equal(canApprove('draft'), true);
    assert.equal(canApprove('approved'), false);
    assert.equal(canCancel('draft'), true);
    assert.equal(canCancel('cancelled'), false);
    assert.equal(canEditContent('draft'), true);
    assert.equal(canEditContent('approved'), false);
  });

  test('a leitura ordena rascunho primeiro, depois aprovadas, depois canceladas', () => {
    const lista = [
      rodada({ id: 'c', period: 'Cancelada', status: 'cancelled', cancelReason: 'x' }),
      rodada({ id: 'a', period: 'Aprovada', status: 'approved' }),
      rodada({ id: 'd', period: 'Draft', status: 'draft' }),
    ];
    assert.deepEqual(
      orderRounds(lista).map((r) => r.id),
      ['d', 'a', 'c'],
    );
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      rodada({ status: 'draft' }),
      rodada({ status: 'approved' }),
      rodada({ status: 'approved' }),
      rodada({ status: 'cancelled', cancelReason: 'x' }),
    ];
    assert.deepEqual(summarizeRounds(lista), { total: 4, draft: 1, approved: 2, cancelled: 1 });
    assert.deepEqual(summarizeRounds([]), { total: 0, draft: 0, approved: 0, cancelled: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('sop.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'sop.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐ a governança sobre o plano — o sop×dem assinado', () => {
  const sopMigration = readFileSync(MIGRATION, 'utf8');

  /**
   * ⭐ A rodada é a CAMADA DE GOVERNANÇA — ela referencia o plano por ID SOLTO,
   * nunca por FK, e NUNCA lê o schema do plano. Se alguém "amarrar" a rodada ao
   * schema do outro módulo, a palavra dele apareceria aqui e este teste reprova.
   */
  test('⭐ o vínculo com o plano é ID SOLTO — a migration não toca o schema do plano', () => {
    assert.match(sopMigration, /plan_id\s+uuid/, 'a rodada referencia o plano por plan_id (id solto)');
    // A migration não menciona o schema do módulo de Planejamento de Demanda:
    // vínculo solto, sem FK, sem ler tabela alheia.
    const semComentario = sopMigration
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    assert.doesNotMatch(semComentario, /dem\./, 'a rodada não lê o schema do plano — o vínculo é solto');
  });

  /**
   * ⭐ O DIVERGE é de FUNDO, não de régua: o plano de demanda só tem quem o
   * DESENHA (uma permissão de manage). A rodada de S&OP tem, ALÉM do manage, um
   * gate de APROVAÇÃO próprio (`sop.round.approve`) — porque fechar o consenso é
   * papel mais sênior do que montar a pauta. Se alguém fundir as permissões, o
   * gate some da migration e este teste reprova.
   */
  test('⭐ aprovar tem gate PRÓPRIO (sop.round.approve), separado de quem desenha', () => {
    // O gatilho de transição exige a permissão de aprovação, distinta do manage.
    assert.match(sopMigration, /sop\.round\.approve/, 'o gate de aprovação existe');
    assert.match(sopMigration, /sop\.round\.manage/, 'o gate de gestão existe');
    // can_access ORa as DUAS — quem só aprova também alcança a linha.
    assert.match(
      sopMigration,
      /has_permission\(p_tenant_id,\s*'sop\.round\.manage'\)[\s\S]*?or[\s\S]*?has_permission\(p_tenant_id,\s*'sop\.round\.approve'\)/,
      'can_access é o OR das duas permissões',
    );

    // O plano de demanda NÃO tem permissão de aprovação — só quem desenha.
    const demMigration = readFileSync(MIGRATION_DEM, 'utf8');
    assert.doesNotMatch(demMigration, /\.plan\.approve/, 'o plano de demanda não tem gate de aprovação — só manage');
  });
});
