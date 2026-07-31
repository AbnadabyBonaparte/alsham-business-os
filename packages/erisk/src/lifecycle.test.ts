import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  ALL_STATUSES,
  TREATMENTS,
  canTransition,
  nextStatuses,
  canReopen,
  canClose,
  canMitigate,
  canEditContent,
  severity,
  orderBySeverity,
  summarizeRisks,
} from './erisk.ts';
import type { EnterpriseRisk } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0090_erisk.sql');
const MIGRATION_RISK = resolve(HERE, '../../../supabase/migrations/0075_risk.sql');

function risco(over: Partial<EnterpriseRisk> = {}): EnterpriseRisk {
  return {
    id: 'r1',
    description: 'Um risco',
    category: '',
    owner: '',
    ownerId: null,
    probability: 3,
    impact: 3,
    treatment: null,
    treatmentPlan: '',
    controlId: null,
    status: 'open',
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

describe('o ciclo de vida do risco corporativo', () => {
  test('o caminho feliz: open → mitigated → closed', () => {
    assert.equal(canTransition('open', 'mitigated'), true);
    assert.equal(canTransition('mitigated', 'closed'), true);
  });

  test('encerrar direto do aberto também existe', () => {
    assert.equal(canTransition('open', 'closed'), true);
  });

  test('⭐⭐ mitigated REABRE (mitigated → open)', () => {
    assert.equal(canTransition('mitigated', 'open'), true);
    assert.equal(canReopen('mitigated'), true);
    assert.equal(canReopen('open'), false);
    assert.equal(canReopen('closed'), false);
  });

  test('⭐ closed é terminal: não sai de lá', () => {
    for (const destino of ALL_STATUSES.filter((s) => s !== 'closed')) {
      assert.equal(canTransition('closed', destino), false, `closed → ${destino}`);
    }
  });

  test('mitigar só do aberto; encerrar do aberto e do mitigado', () => {
    assert.equal(canMitigate('open'), true);
    assert.equal(canMitigate('mitigated'), false);
    assert.equal(canMitigate('closed'), false);
    assert.equal(canClose('open'), true);
    assert.equal(canClose('mitigated'), true);
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
    assert.deepEqual([...nextStatuses('open')].sort(), ['closed', 'mitigated']);
    assert.deepEqual([...nextStatuses('mitigated')].sort(), ['closed', 'open']);
    assert.deepEqual([...nextStatuses('closed')], []);
  });

  test('canEditContent: o encerrado não se edita', () => {
    assert.equal(canEditContent('open'), true);
    assert.equal(canEditContent('mitigated'), true);
    assert.equal(canEditContent('closed'), false);
  });

  test('⭐ severity é probabilidade × impacto — a matriz (leitura, nunca decisão)', () => {
    assert.equal(severity(risco({ probability: 1, impact: 1 })), 1);
    assert.equal(severity(risco({ probability: 3, impact: 4 })), 12);
    assert.equal(severity(risco({ probability: 5, impact: 5 })), 25);
  });

  test('a leitura ordena abertos, depois mitigados, depois fechados; dentro, mais severo primeiro', () => {
    const lista = [
      risco({ id: 'c', status: 'closed', probability: 5, impact: 5 }),
      risco({ id: 'a-baixo', status: 'open', probability: 1, impact: 2 }),
      risco({ id: 'a-alto', status: 'open', probability: 4, impact: 5 }),
      risco({ id: 'm', status: 'mitigated', probability: 2, impact: 2 }),
    ];
    assert.deepEqual(orderBySeverity(lista).map((r) => r.id), ['a-alto', 'a-baixo', 'm', 'c']);
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      risco({ status: 'open' }),
      risco({ status: 'mitigated' }),
      risco({ status: 'closed' }),
      risco({ status: 'closed' }),
    ];
    assert.deepEqual(summarizeRisks(lista), { total: 4, open: 1, mitigated: 1, closed: 2 });
    assert.deepEqual(summarizeRisks([]), { total: 0, open: 0, mitigated: 0, closed: 0 });
  });
});

describe('⭐⭐ O DIVERGE assinado — erisk × risk (Módulo 60, PMO)', () => {
  test('a tabela de transições do TS é o espelho EXATO do SQL do erisk', () => {
    const doSql = paresDoSql(MIGRATION, 'erisk.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 4, 'o SQL declara quatro pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O MANTIDO assinado: a FÍSICA DO CICLO do `risk` foi copiada de propósito.
   * O `erisk` e o `risk` têm o MESMO conjunto de transições — os dois reabrem de
   * `mitigated` e os dois têm `closed` terminal. Se alguém "uniformizar" um sem o
   * outro, este teste reprova.
   */
  test('⭐ MANTIDO: erisk e risk têm o MESMO ciclo (mitigated→open reabre, closed terminal)', () => {
    const doErisk = paresDoSql(MIGRATION, 'erisk.allowed_transition');
    const doRisk = paresDoSql(MIGRATION_RISK, 'risk.allowed_transition');
    assert.deepEqual([...doErisk].sort(), [...doRisk].sort());

    for (const conjunto of [doErisk, doRisk]) {
      assert.ok(conjunto.has('mitigated→open'), 'a reabertura (mitigated → open) sumiu');
      for (const par of conjunto) {
        const [de] = par.split('→');
        assert.ok(de !== 'closed', `closed ganhou uma volta (${par}) — closed é terminal`);
      }
    }
  });

  /**
   * ⭐⭐ O DIVERGE, camada 1 — O ESCOPO. O `risk` é escopado a um PROJETO
   * (`project_id NOT NULL`, o risco de ENTREGA). O `erisk` NÃO tem projeto: é o
   * risco do NEGÓCIO, vive enquanto a empresa vive. Se alguém colar um
   * `project_id` no erisk "por consistência", este teste reprova.
   */
  test('⭐⭐ DIVERGE: o risk TEM project_id; o erisk NÃO tem', () => {
    const erisk = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const risk = readFileSync(MIGRATION_RISK, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(risk, /^\s*project_id\s+uuid/im, 'o risk perdeu o project_id (o escopo de projeto)');
    assert.doesNotMatch(erisk, /^\s*project_id\s+uuid/im, 'o erisk ganhou um project_id — não é risco de projeto');
  });

  /**
   * ⭐⭐ O DIVERGE, camada 2 — O TRATAMENTO. Os 4 T's da ISO 31000 são a
   * estratégia de tratamento do risco corporativo — um CHECK argumentado no
   * `erisk` que o `risk` (risco de projeto) não tem.
   */
  test('⭐⭐ DIVERGE: o erisk tem o CHECK de treatment (os 4 Ts); o risk não', () => {
    const erisk = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const risk = readFileSync(MIGRATION_RISK, 'utf8').replace(/--[^\n]*/g, '');
    for (const t of TREATMENTS) {
      assert.ok(erisk.includes(`'${t}'`), `o CHECK de treatment do erisk perdeu '${t}'`);
    }
    assert.match(erisk, /treatment\s+text\s+check/i, 'o erisk perdeu o CHECK de treatment');
    assert.doesNotMatch(risk, /treatment\s+text\s+check/i, 'o risk (de projeto) ganhou treatment — não devia');
  });

  /**
   * ⭐ A régua 1–5 é física do método — mora numa CHECK constraint no banco. Este
   * teste confere que as duas colunas carregam o CHECK de 1..5 na migration do
   * erisk (o MANTIDO do risk também aqui).
   */
  test('⭐ a régua 1–5 é CHECK no banco, nas duas colunas', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.match(sql, /probability\s+int\s+not null\s+check \(probability between 1 and 5\)/i);
    assert.match(sql, /impact\s+int\s+not null\s+check \(impact between 1 and 5\)/i);
  });

  /**
   * ⭐ A severidade NÃO é coluna: é leitura (a matriz de riscos, `orderBySeverity`).
   * Este teste confere que nenhuma coluna de severidade nasceu na migration.
   */
  test('⭐ severidade não é coluna — é leitura do pacote (a matriz)', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.doesNotMatch(sql, /\bseverity\s+(int|smallint|numeric|integer)/i);
  });
});
