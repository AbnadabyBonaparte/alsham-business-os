import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  ALL_STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  nextStatuses,
  isTerminal,
} from './vuln.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0093_vuln.sql');
const MIGRATION_NC = resolve(HERE, '../../../supabase/migrations/0078_nc.sql');

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

describe('o ciclo de vida da vulnerabilidade', () => {
  test('o caminho feliz: open → in_progress → remediated', () => {
    assert.equal(canTransition('open', 'in_progress'), true);
    assert.equal(canTransition('in_progress', 'remediated'), true);
  });

  test('⭐ in_progress → open EXISTE (reavaliar — o carimbo nunca chegou)', () => {
    assert.equal(canTransition('in_progress', 'open'), true);
  });

  test('⭐⭐ AS DUAS respostas terminais: aceitar o risco do aberto e do em progresso; remediar do em progresso', () => {
    assert.equal(canTransition('open', 'accepted_risk'), true);
    assert.equal(canTransition('in_progress', 'accepted_risk'), true);
    assert.equal(canTransition('in_progress', 'remediated'), true);
    // remediar direto do aberto NÃO existe: só se remedia o que se pôs em progresso.
    assert.equal(canTransition('open', 'remediated'), false);
  });

  test('⭐⭐ remediated E accepted_risk são TERMINAIS — não sai de lá (a que reaparece é registro novo)', () => {
    assert.deepEqual([...TERMINAL_STATUSES].sort(), ['accepted_risk', 'remediated']);
    for (const terminal of TERMINAL_STATUSES) {
      assert.equal(isTerminal(terminal), true);
      assert.deepEqual([...nextStatuses(terminal)], [], `${terminal} devia ser terminal`);
      for (const destino of ALL_STATUSES.filter((s) => s !== terminal)) {
        assert.equal(canTransition(terminal, destino), false, `${terminal} → ${destino}`);
      }
    }
    assert.equal(isTerminal('open'), false);
    assert.equal(isTerminal('in_progress'), false);
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
    assert.deepEqual([...nextStatuses('open')].sort(), ['accepted_risk', 'in_progress']);
    assert.deepEqual([...nextStatuses('in_progress')].sort(), ['accepted_risk', 'open', 'remediated']);
    assert.deepEqual([...nextStatuses('remediated')], []);
    assert.deepEqual([...nextStatuses('accepted_risk')], []);
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('vuln.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'vuln.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 5, 'o SQL declara cinco pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('⭐⭐ os dois terminais NÃO reabrem, e in_progress → open é a única volta', () => {
    const doSql = paresDoSql(MIGRATION, 'vuln.allowed_transition');
    for (const par of doSql) {
      const [de] = par.split('→');
      assert.ok(
        de !== 'remediated' && de !== 'accepted_risk',
        `um terminal ganhou saída (${par}) — remediated e accepted_risk são terminais`,
      );
    }
    assert.ok(doSql.has('in_progress→open'), 'a reavaliação (in_progress → open) sumiu');
    assert.ok(doSql.has('open→in_progress'), 'open → in_progress devia existir');
  });
});

/**
 * ⭐⭐ A IDENTIDADE do `nc`/`capa`, ASSINADA — e o DIVERGE escrito.
 *
 * A vulnerabilidade REAPROVEITA a identidade do `nc`: um FATO CONSTATADO amarrado
 * a uma NOTA DE RESPOSTA no encerramento. Nos dois módulos há uma constraint de
 * COERÊNCIA DO ENCERRAMENTO que EXIGE a nota escrita (o `nc` a chama
 * `verification_note`; o `vuln`, `resolution`) — `length(btrim(...)) > 0`.
 *
 * O DIVERGE do `vuln` está em DUAS coisas que o `nc` não tem:
 *   1. a SEVERIDADE 1–5 é CHECK argumentado (a física do método);
 *   2. há uma SEGUNDA resposta terminal — `accepted_risk` (aceitar o risco), ao
 *      lado de `remediated`. O `nc` fecha por uma porta só (`closed`).
 *
 * Copiar sem pensar e divergir sem escrever são o mesmo erro: aqui o que se
 * mantém e o que muda estão, os dois, assinados.
 */
describe('⭐⭐ a identidade do nc e o DIVERGE assinado', () => {
  const nc = readFileSync(MIGRATION_NC, 'utf8');
  const vuln = readFileSync(MIGRATION, 'utf8');

  test('o nc amarra o fato constatado à nota de verificação no encerramento (a identidade compartilhada)', () => {
    assert.match(nc, /verification_note\s+text/);
    assert.match(nc, /constraint\s+nc_entries_closure_coherent\s+check/i);
    assert.match(nc, /length\(btrim\(verification_note\)\)\s*>\s*0/);
  });

  test('o vuln amarra o mesmo — o fato constatado à resposta escrita no encerramento', () => {
    assert.match(vuln, /resolution\s+text/);
    assert.match(vuln, /constraint\s+vuln_findings_closure_coherent\s+check/i);
    assert.match(vuln, /length\(btrim\(resolution\)\)\s*>\s*0/);
  });

  test('⭐ o DIVERGE 1: o vuln tem a severidade 1–5 CHECK; o nc NÃO', () => {
    assert.match(vuln, /severity\s+int\s+not null\s+check \(severity between 1 and 5\)/i);
    assert.doesNotMatch(nc, /severity\s+int/i);
  });

  test('⭐⭐ o DIVERGE 2: o vuln tem a SEGUNDA resposta terminal accepted_risk; o nc fecha por uma porta só', () => {
    assert.match(vuln, /'accepted_risk'/);
    assert.match(vuln, /'remediated'/);
    assert.doesNotMatch(nc, /'accepted_risk'/);
    // O nc tem o par único open → closed; o vuln tem cinco pares com dois terminais.
    const doNc = paresDoSql(MIGRATION_NC, 'nc.allowed_transition');
    const doVuln = paresDoSql(MIGRATION, 'vuln.allowed_transition');
    assert.deepEqual([...doNc], ['open→closed']);
    assert.equal(doVuln.size, 5);
  });
});
