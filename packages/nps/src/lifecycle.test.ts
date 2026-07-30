import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canEditSurvey,
  canOpen,
  canClose,
  canTransition,
  computeScore,
  isValidScore,
  orderSurveys,
  whyCannotRespond,
} from './nps.ts';
import type { Survey, SurveyResponse, SurveyStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0042_nps.sql');
const MIGRATION_CARE = resolve(HERE, '../../../supabase/migrations/0030_care.sql');
const MIGRATION_MNT = resolve(HERE, '../../../supabase/migrations/0032_mnt.sql');

const TODOS: readonly SurveyStatus[] = ['draft', 'open', 'closed'];

function rodada(over: Partial<Survey> = {}): Survey {
  return {
    id: 's1',
    title: 'A voz da praça — julho',
    question: 'De 0 a 10, o quanto você recomendaria a nossa praça?',
    status: 'open',
    openedAt: '2026-07-01T10:00:00Z',
    closedAt: null,
    ...over,
  };
}

function voz(over: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    id: 'r1',
    seq: 1,
    surveyId: 's1',
    score: 9,
    comment: '',
    respondent: '',
    respondedAt: '2026-07-02T10:00:00Z',
    ...over,
  };
}

describe('⭐ o ciclo — dois pares; closed é terminal', () => {
  test('o rascunho abre; a aberta encerra', () => {
    assert.equal(canOpen('draft'), true);
    assert.equal(canClose('open'), true);
  });

  test('⭐ closed é TERMINAL: a rodada que volta é pesquisa nova', () => {
    for (const destino of TODOS.filter((s) => s !== 'closed')) {
      assert.equal(canTransition('closed', destino), false, `closed → ${destino} não existe`);
    }
    // E a aberta não volta ao rascunho: a coleta começou.
    assert.equal(canTransition('open', 'draft'), false);
  });

  test('⭐ abrir congela a pergunta — só o rascunho é plano', () => {
    assert.equal(canEditSurvey('draft'), true);
    assert.equal(canEditSurvey('open'), false);
    assert.equal(canEditSurvey('closed'), false);
  });

  test('⭐ só a aberta colhe — a recusa com nome', () => {
    assert.match(whyCannotRespond(rodada({ status: 'draft', openedAt: null }), 9)!, /rascunho/);
    assert.match(whyCannotRespond(rodada({ status: 'closed', closedAt: 'x' }), 9)!, /encerrou/);
    assert.equal(whyCannotRespond(rodada(), 9), null);
  });

  test('⭐ a régua é do MÉTODO: inteiro de 0 a 10', () => {
    assert.equal(isValidScore(0), true);
    assert.equal(isValidScore(10), true);
    assert.equal(isValidScore(11), false);
    assert.equal(isValidScore(-1), false);
    assert.equal(isValidScore(7.5), false);
    assert.match(whyCannotRespond(rodada(), 11)!, /régua do método/);
  });
});

describe('⭐ o placar — calculado do livro, nunca guardado', () => {
  test('%promotores − %detratores, como o mundo conta', () => {
    const livro = [
      voz(),                              // 9 → promotor
      voz({ id: 'r2', seq: 2, score: 10 }), // promotor
      voz({ id: 'r3', seq: 3, score: 7 }),  // neutro
      voz({ id: 'r4', seq: 4, score: 3 }),  // detrator
    ];
    const placar = computeScore(rodada(), livro);
    assert.ok(placar);
    assert.equal(placar.responses, 4);
    assert.equal(placar.promoters, 2);
    assert.equal(placar.passives, 1);
    assert.equal(placar.detractors, 1);
    assert.equal(placar.score, 25); // 50% − 25%
  });

  test('⭐ sem resposta NÃO há placar — sem número inventado (Lei 7)', () => {
    assert.equal(computeScore(rodada(), []), null);
    assert.equal(computeScore(rodada(), [voz({ surveyId: 'OUTRA' })]), null);
  });

  test('o quadro na ordem de leitura: abertas primeiro', () => {
    const ordenado = orderSurveys([
      rodada({ id: 'fechada', status: 'closed', closedAt: 'x' }),
      rodada({ id: 'rasc', status: 'draft', openedAt: null }),
      rodada({ id: 'aberta' }),
    ]);
    assert.deepEqual(ordenado.map((s) => s.id), ['aberta', 'rasc', 'fechada']);
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

  test('nps.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'nps.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE assinado nos dois lados: o care REABRE de resolved (o
   * pedido é o mesmo); a pesquisa fechada NÃO reabre (a rodada nova é
   * outra medição — misturar respostas de épocas diferentes no mesmo
   * placar mentiria as duas). Se um dos lados mudar, re-pergunte.
   */
  test('⭐ o contraste care×nps: o caso reabre; a medição não', () => {
    const care = paresDoSql(MIGRATION_CARE, 'care.allowed_transition');
    assert.ok(care.has('resolved→open'), 'o care deixou de reabrir — re-pergunte o contraste');
    const doSql = paresDoSql(MIGRATION, 'nps.allowed_transition');
    assert.ok(!doSql.has('closed→open'), 'a medição passou a reabrir — a decisão era NÃO');
  });

  /**
   * ⭐ A régua 0–10 é a SEGUNDA física da onda em CHECK argumentado — o
   * precedente é o corretiva/preventiva do mnt. Os dois lados assinados.
   */
  test('⭐ o contraste mnt×nps: a física do domínio pode ser CHECK — com argumento', () => {
    const mnt = readFileSync(MIGRATION_MNT, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(mnt, /'corrective'|'preventive'/, 'o mnt perdeu o CHECK argumentado — re-pergunte');
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /score >= 0 and score <= 10\)/, 'a régua do método saiu do CHECK');
    assert.doesNotMatch(sql, /create\s+type\s+nps\./i, 'régua em enum não — CHECK com argumento');
  });

  test('⭐ o livro: carimbo do servidor, sequência, imutável — e o placar é view', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /new\.responded_at := now\(\)/);
    assert.match(sql, /new\.recorded_by\s+:= \(select auth\.uid\(\)\)/);
    assert.match(sql, /seq\s+bigint\s+generated always as identity/);
    assert.match(sql, /nps_responses_immutable/);
    assert.match(sql, /create view nps\.survey_score\s*\nwith \(security_invoker = true\)/);
    // A voz não passeia inteira no envelope: nem comentário, nem respondente.
    const payload = sql.split('nps.on_response_recorded')[1]?.split('$$;')[0] ?? '';
    assert.ok(!payload.includes('new.comment'), 'o comentário NÃO vai no envelope');
    assert.ok(!payload.includes('new.respondent'), 'o respondente NÃO vai no envelope — LGPD-mínimo');
  });

  test('⛔ anon = NADA — e sem envio, sem link, sem sentimento, sem meta', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const code = sql.replace(/--[^\n]*/g, '');
    assert.doesNotMatch(code, /grant[^;]*to[^;]*anon/i, 'anon recebeu grant — anon = NADA, sem exceção');
    assert.doesNotMatch(code, /public_link|share_token|anonymous/i);
    assert.doesNotMatch(code, /sentiment/i);
    assert.doesNotMatch(code, /email|whatsapp|sms/i);
  });
});
