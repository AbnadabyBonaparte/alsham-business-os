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
  isClosed,
  canEditContent,
  requiresCloseNote,
  orderIncidents,
  summarizeIncidents,
} from './secincident.ts';
import type { SecurityIncident } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0094_secincident.sql');
const MIGRATION_OCC = resolve(HERE, '../../../supabase/migrations/0031_occ.sql');

function incidente(over: Partial<SecurityIncident> = {}): SecurityIncident {
  return {
    id: 'i1',
    title: 'Ransomware',
    description: 'arquivos criptografados',
    attackVector: '',
    affectedData: '',
    severity: 3,
    detectedAt: '2027-01-14T03:00:00Z',
    status: 'detected',
    closeNote: '',
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

describe('o ciclo de vida do incidente — a timeline NIST', () => {
  test('o caminho feliz: detected → contained → eradicated → recovered → closed', () => {
    assert.equal(canTransition('detected', 'contained'), true);
    assert.equal(canTransition('contained', 'eradicated'), true);
    assert.equal(canTransition('eradicated', 'recovered'), true);
    assert.equal(canTransition('recovered', 'closed'), true);
  });

  test('⭐ o atalho de falso-positivo: detected → closed existe', () => {
    assert.equal(canTransition('detected', 'closed'), true);
  });

  test('⭐ closed é terminal: não sai de lá', () => {
    for (const destino of ALL_STATUSES.filter((s) => s !== 'closed')) {
      assert.equal(canTransition('closed', destino), false, `closed → ${destino}`);
    }
    assert.equal(isClosed('closed'), true);
    assert.equal(isClosed('detected'), false);
  });

  test('⭐ não se pula etapa: contained NÃO vai direto a recovered nem a closed', () => {
    assert.equal(canTransition('contained', 'recovered'), false);
    assert.equal(canTransition('contained', 'closed'), false);
    assert.equal(canTransition('eradicated', 'closed'), false);
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
    assert.deepEqual([...nextStatuses('detected')].sort(), ['closed', 'contained']);
    assert.deepEqual([...nextStatuses('contained')], ['eradicated']);
    assert.deepEqual([...nextStatuses('eradicated')], ['recovered']);
    assert.deepEqual([...nextStatuses('recovered')], ['closed']);
    assert.deepEqual([...nextStatuses('closed')], []);
  });

  test('⭐ fechar exige a nota — requiresCloseNote é true só quando o destino é closed', () => {
    assert.equal(requiresCloseNote('recovered', 'closed'), true);
    assert.equal(requiresCloseNote('detected', 'closed'), true);
    assert.equal(requiresCloseNote('detected', 'contained'), false);
    assert.equal(requiresCloseNote('eradicated', 'recovered'), false);
  });

  test('⭐ canEditContent: editável enquanto aberto; o fechado congela', () => {
    assert.equal(canEditContent('detected'), true);
    assert.equal(canEditContent('contained'), true);
    assert.equal(canEditContent('recovered'), true);
    assert.equal(canEditContent('closed'), false);
  });

  test('a leitura ordena abertos antes de fechados; dentro, mais severo, depois mais recente', () => {
    const lista = [
      incidente({ id: 'c', status: 'closed', severity: 5 }),
      incidente({ id: 'a-baixo', status: 'detected', severity: 1, detectedAt: '2027-01-10T00:00:00Z' }),
      incidente({ id: 'a-alto', status: 'contained', severity: 5, detectedAt: '2027-01-09T00:00:00Z' }),
    ];
    assert.deepEqual(orderIncidents(lista).map((i) => i.id), ['a-alto', 'a-baixo', 'c']);
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      incidente({ status: 'detected' }),
      incidente({ status: 'contained' }),
      incidente({ status: 'closed' }),
    ];
    assert.deepEqual(summarizeIncidents(lista), { total: 3, open: 2, closed: 1 });
    assert.deepEqual(summarizeIncidents([]), { total: 0, open: 0, closed: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('secincident.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'secincident.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 5, 'o SQL declara CINCO pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

/**
 * ⭐⭐ O DIVERGE ASSINADO — secincident × occ. Três afirmações que têm de
 * continuar verdadeiras ao mesmo tempo. Se alguém "uniformizar" qualquer lado,
 * este teste reprova e a decisão volta a ser escrita, por extenso.
 */
describe('⭐⭐ o DIVERGE assinado: secincident (operação de resposta) × occ (fato consumado)', () => {
  test('⭐ o CICLO: secincident tem 5 estados / várias transições; occ tem UM par (open→closed)', () => {
    const doSec = paresDoSql(MIGRATION, 'secincident.allowed_transition');
    const doOcc = paresDoSql(MIGRATION_OCC, 'occ.allowed_transition');

    assert.equal(doOcc.size, 1, 'o occ tem UM par — se ganhou mais, virou timeline como o secincident');
    assert.ok(doOcc.has('open→closed'));

    assert.ok(doSec.size >= 5, 'o secincident tem a timeline NIST — 5 pares');
    // A timeline NIST de 5 fases, ausente no occ.
    for (const par of ['detected→contained', 'contained→eradicated', 'eradicated→recovered', 'recovered→closed']) {
      assert.ok(doSec.has(par), `o secincident perdeu a fase da timeline: ${par}`);
    }
    // Os estados NIST não existem no vocabulário do occ.
    const estadosSec = new Set([...doSec].flatMap((p) => p.split('→')));
    assert.ok(estadosSec.size >= 5, 'o secincident tem 5 estados; o occ, 2');
    const estadosOcc = new Set([...doOcc].flatMap((p) => p.split('→')));
    assert.equal(estadosOcc.size, 2, 'o occ tem exatamente dois estados — open e closed');
  });

  test('⭐ a MUTABILIDADE: secincident é editável-enquanto-aberto e congela no fim; occ é imutável desde o nascimento', () => {
    const sqlSec = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const sqlOcc = readFileSync(MIGRATION_OCC, 'utf8').replace(/--[^\n]*/g, '');

    // O secincident CONGELA só no fechamento — o gatilho é chaveado em old.status = 'closed'.
    assert.match(sqlSec, /guard_content_frozen/, 'sumiu o gatilho de congelamento do secincident');
    assert.match(
      sqlSec,
      /old\.status\s*=\s*'closed'/,
      'o congelamento do secincident deixou de ser chaveado no fechamento — ele é editável enquanto aberto',
    );

    // O occ recusa a reescrita do relato SEMPRE, desde o nascimento — corrigir é TRATATIVA.
    assert.match(sqlOcc, /guard_registro_immutable/, 'sumiu o gatilho de imutabilidade do occ');
    assert.match(
      sqlOcc,
      /não se reescreve\. Corrigir o relato é registrar uma TRATATIVA/,
      'o occ deixou de recusar a reescrita do relato — lá o fato é imutável desde o nascimento',
    );
    // E o occ NÃO chaveia a imutabilidade só no fechamento: ele recusa conteúdo em QUALQUER update de aberta.
    assert.doesNotMatch(
      sqlSec,
      /não se reescreve\. Corrigir o relato é registrar uma TRATATIVA/,
      'o secincident copiou a imutabilidade-desde-o-nascimento do occ — aqui o entendimento evolui',
    );
  });

  test('⭐ o MANTIDO: os DOIS guardam um livro IMUTÁVEL de atos (occ.treatments × secincident.response_actions)', () => {
    const sqlSec = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const sqlOcc = readFileSync(MIGRATION_OCC, 'utf8').replace(/--[^\n]*/g, '');

    // O secincident: a timeline de resposta é ato imutável.
    assert.match(sqlSec, /create table secincident\.response_actions/);
    assert.match(sqlSec, /guard_action_immutable/);
    assert.match(
      sqlSec,
      /trigger secincident_actions_immutable\s*\n\s*before update or delete on secincident\.response_actions/,
      'a timeline do secincident deixou de ser imutável',
    );

    // O occ: a tratativa é ato imutável.
    assert.match(sqlOcc, /create table occ\.treatments/);
    assert.match(sqlOcc, /guard_treatment_immutable/);
    assert.match(
      sqlOcc,
      /trigger treatments_immutable\s*\n\s*before update or delete on occ\.treatments/,
      'a tratativa do occ deixou de ser imutável',
    );
  });
});
