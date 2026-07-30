import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  VERSION_TRANSITIONS,
  ackCount,
  canArchiveVersion,
  canEditVersion,
  canPublish,
  canTransitionVersion,
  currentVersion,
  hasAcked,
  isVersionTerminal,
  nextVersionNo,
  orderVersions,
  whyCannotAck,
  whyCannotPublish,
} from './policies.ts';
import type { Acknowledgement, PolicyVersion, VersionStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0052_pol.sql');
const MIGRATION_COMM = resolve(HERE, '../../../supabase/migrations/0039_comm.sql');

const TODOS: readonly VersionStatus[] = ['draft', 'published', 'archived'];

function versao(over: Partial<PolicyVersion> = {}): PolicyVersion {
  return {
    id: 'v1',
    policyId: 'p1',
    versionNo: 1,
    body: 'Uso do equipamento corporativo é individual e intransferível.',
    status: 'published',
    publishedAt: '2026-07-30T10:00:00Z',
    ...over,
  };
}

function ciencia(over: Partial<Acknowledgement> = {}): Acknowledgement {
  return {
    id: 'a1',
    versionId: 'v1',
    userId: 'u1',
    ackedAt: '2026-07-30T11:00:00Z',
    ...over,
  };
}

describe('⭐ o ciclo — dois pares; o arquivado é terminal', () => {
  test('o rascunho publica; o publicado arquiva', () => {
    assert.equal(canPublish('draft'), true);
    assert.equal(canArchiveVersion('published'), true);
  });

  test('⭐ archived é TERMINAL: a política volta com versão nova', () => {
    for (const destino of TODOS.filter((s) => s !== 'archived')) {
      assert.equal(canTransitionVersion('archived', destino), false, `archived → ${destino} não existe`);
    }
    assert.equal(canTransitionVersion('draft', 'archived'), false);
    assert.equal(isVersionTerminal('archived'), true);
    assert.equal(isVersionTerminal('published'), false);
  });

  test('⭐ o corpo congela ao publicar — só o rascunho é plano', () => {
    assert.equal(canEditVersion('draft'), true);
    assert.equal(canEditVersion('published'), false);
    assert.equal(canEditVersion('archived'), false);
  });

  test('⭐ política sem corpo não vale — a recusa tem nome', () => {
    const semCorpo = versao({ status: 'draft', publishedAt: null, body: '  ' });
    assert.match(whyCannotPublish(semCorpo)!, /não vale/);
    assert.equal(whyCannotPublish(versao({ status: 'draft', publishedAt: null })), null);
    assert.match(whyCannotPublish(versao())!, /já foi congelado|saiu de circulação/);
  });
});

describe('⭐⭐ a numeração de versão é CALCULADA — nunca escolhida pelo tenant', () => {
  test('a primeira versão é 1', () => {
    assert.equal(nextVersionNo([]), 1);
  });

  test('a próxima é sempre max + 1, mesmo fora de ordem', () => {
    assert.equal(nextVersionNo([1]), 2);
    assert.equal(nextVersionNo([1, 2, 3]), 4);
    assert.equal(nextVersionNo([3, 1, 2]), 4);
  });

  test('a versão vigente é a publicada de maior número; sem publicada, o rascunho mais novo', () => {
    const v = [
      versao({ id: 'v1', versionNo: 1, status: 'archived' }),
      versao({ id: 'v2', versionNo: 2, status: 'published' }),
      versao({ id: 'v3', versionNo: 3, status: 'draft', publishedAt: null }),
    ];
    assert.equal(currentVersion(v)?.id, 'v2');
    assert.deepEqual(orderVersions(v).map((x) => x.id), ['v3', 'v2', 'v1']);

    const soDraft = [versao({ id: 'v1', versionNo: 1, status: 'draft', publishedAt: null })];
    assert.equal(currentVersion(soDraft)?.id, 'v1');
    assert.equal(currentVersion([]), null);
  });
});

describe('⭐⭐ a ciência — própria, única POR VERSÃO, e só na publicada', () => {
  test('ciência em versão publicada, uma vez', () => {
    assert.equal(whyCannotAck(versao(), 'u1', []), null);
  });

  test('⭐ ciência não se dá duas vezes NA MESMA VERSÃO', () => {
    assert.match(whyCannotAck(versao(), 'u1', [ciencia()])!, /duas vezes/);
    assert.equal(hasAcked(versao(), 'u1', [ciencia()]), true);
  });

  test('⭐⭐ o CORAÇÃO do DIVERGE: uma versão nova NÃO herda a ciência da anterior', () => {
    // O MESMO usuário deu ciência da v1; a v2 (versão NOVA) nasce sem nada.
    const v1 = versao({ id: 'v1', versionNo: 1 });
    const v2 = versao({ id: 'v2', versionNo: 2 });
    const acks = [ciencia({ versionId: 'v1', userId: 'u1' })];

    assert.equal(hasAcked(v1, 'u1', acks), true, 'deu ciência da v1');
    assert.equal(hasAcked(v2, 'u1', acks), false, '⭐⭐ a v2 é versão NOVA — a ciência da v1 não vale para ela');
    assert.equal(whyCannotAck(v2, 'u1', acks), null, 'o mesmo usuário PODE (e deve) dar ciência de novo na v2');
  });

  test('rascunho não recebe ciência; fora de circulação não recebe ciência nova', () => {
    assert.match(whyCannotAck(versao({ status: 'draft', publishedAt: null }), 'u1', [])!, /não foi publicada/);
    assert.match(whyCannotAck(versao({ status: 'archived' }), 'u1', [])!, /Fora de circulação|fora de circulação/i);
  });

  test('a cobertura é contada POR VERSÃO, nunca estimada', () => {
    const acks = [
      ciencia({ versionId: 'v1' }),
      ciencia({ id: 'a2', versionId: 'v1', userId: 'u2' }),
      ciencia({ id: 'a3', versionId: 'v2', userId: 'u1' }),
    ];
    assert.equal(ackCount(versao({ id: 'v1' }), acks), 2);
    assert.equal(ackCount(versao({ id: 'v2' }), acks), 1);
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

  test('pol.allowed_transition() e VERSION_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'pol.allowed_transition');
    const doTs = new Set(VERSION_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐⭐ O CONTRASTE pol×comm — a razão de existir deste módulo, lido dos
   * DOIS arquivos aplicados. O comm dá ciência ÚNICA e ETERNA por
   * DOCUMENTO (unique notice_id,user_id): uma vez lido, lido para sempre,
   * não importa se o comunicado nunca muda de versão (ele não tem
   * versão). O pol DIVERGE: a política TEM versão, e a ciência é por
   * (versão, membro) — publicar uma versão nova EXIGE que quem já deu
   * ciência da anterior dê ciência de novo. Se um dos lados regredir para
   * o padrão do outro, este teste acusa.
   */
  test('⭐⭐ o contraste comm×pol: ciência por DOCUMENTO × ciência por VERSÃO', () => {
    const comm = readFileSync(MIGRATION_COMM, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(
      comm,
      /comm_acks_once unique \(notice_id, user_id\)/,
      'o comm deixou de dar ciência por documento — re-pergunte o contraste',
    );
    assert.doesNotMatch(
      comm,
      /version_id/,
      'o comm ganhou versão — o contraste com o pol deixou de fazer sentido',
    );

    const pol = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(
      pol,
      /pol_acks_once_per_version unique \(version_id, user_id\)/,
      'o pol deixou de dar ciência por versão — o DIVERGE sumiu',
    );
    assert.match(pol, /unique \(policy_id, version_no\)/, 'a numeração de versão por política sumiu');
  });

  test('⭐ o corpo publicado congela — presente no código', () => {
    const pol = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(pol, /a versão publicada não se edita/);
    assert.match(pol, /new\.version_no := coalesce\(v_max, 0\) \+ 1/, 'o número é calculado pelo servidor');
  });

  test('⭐ a ciência é forçada ao próprio punho — no CÓDIGO', () => {
    const pol = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(pol, /new\.user_id\s+:= \(select auth\.uid\(\)\)/);
    assert.match(pol, /pol_acks_immutable/);
  });

  test('⭐ sem cron, sem envio, sem enum, sem storage de anexo', () => {
    const pol = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(pol, /pg_cron|cron\.schedule|scheduled_for/i);
    assert.doesNotMatch(pol, /email|whatsapp|push_/i);
    assert.doesNotMatch(pol, /create\s+type\s+pol\./i);
    // O corpo não passeia no envelope.
    const payload = pol.split('create or replace function pol.version_payload')[1]?.split('$$;')[0] ?? '';
    assert.ok(!payload.includes('p.body'), 'o corpo NÃO vai no envelope');
  });
});
