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
  canGrant,
  canReject,
  canExpire,
  canEditIdentity,
  orderAssets,
  summarizeAssets,
} from './ip.ts';
import type { IpAsset } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0084_ip.sql');
const MIGRATION_ISO = resolve(HERE, '../../../supabase/migrations/0081_iso.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');

function ativo(over: Partial<IpAsset> = {}): IpAsset {
  return {
    id: 'a1',
    title: 'Ativo',
    assetType: 'patent',
    registrationNumber: '',
    filedOn: null,
    status: 'filed',
    sourceId: null,
    sourceName: '',
    note: '',
    ...over,
  };
}

function paresDoSql(caminho: string, fn: string): Set<string> {
  const texto = readFileSync(caminho, 'utf8');
  const corpo = texto.split(`create or replace function ${fn}`)[1];
  assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
  const bloco = corpo.split('$$;')[0] ?? '';
  const semComentario = bloco.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  const pares = new Set<string>();
  for (const m of semComentario.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
    pares.add(`${m[1]}→${m[2]}`);
  }
  return pares;
}

describe('o ciclo de vida do ativo de PI', () => {
  test('o caminho: filed → granted → expired; e filed → rejected', () => {
    assert.equal(canTransition('filed', 'granted'), true);
    assert.equal(canTransition('granted', 'expired'), true);
    assert.equal(canTransition('filed', 'rejected'), true);
  });

  test('⭐⭐ rejected e expired são TERMINAIS e NÃO REABREM (depósito novo)', () => {
    for (const fim of ['rejected', 'expired'] as const) {
      for (const destino of ALL_STATUSES.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
  });

  test('⛔ não se concede o que não foi depositado; não se expira o que não foi concedido', () => {
    assert.equal(canTransition('filed', 'expired'), false); // pula granted
    assert.equal(canTransition('granted', 'rejected'), false); // rejeitar concedido não existe
  });

  test('⭐ a matriz N×N: canTransition concorda com a tabela', () => {
    const permitidos = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    for (const de of ALL_STATUSES) {
      for (const para of ALL_STATUSES) {
        const esperado = de === para || permitidos.has(`${de}→${para}`);
        assert.equal(canTransition(de, para), esperado, `${de} → ${para}`);
      }
    }
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('filed')].sort(), ['granted', 'rejected']);
    assert.deepEqual([...nextStatuses('granted')], ['expired']);
    assert.deepEqual([...nextStatuses('rejected')], []);
    assert.deepEqual([...nextStatuses('expired')], []);
  });

  test('canGrant/canReject/canExpire/canEditIdentity concordam com a tabela', () => {
    assert.equal(canGrant('filed'), true);
    assert.equal(canGrant('granted'), false);
    assert.equal(canReject('filed'), true);
    assert.equal(canExpire('granted'), true);
    assert.equal(canExpire('filed'), false);
    // ⭐ a identidade só muda enquanto depositado.
    assert.equal(canEditIdentity('filed'), true);
    assert.equal(canEditIdentity('granted'), false);
    assert.equal(canEditIdentity('rejected'), false);
  });

  test('⭐ a tabela de transições é a MESMA nos dois lados (SQL × TS)', () => {
    const doSql = paresDoSql(MIGRATION, 'ip.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 3, 'o SQL declara três pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐⭐ o tipo é CHECK das quatro categorias, e o ciclo é terminal (o DIVERGE do iso)', () => {
  const iso = readFileSync(MIGRATION_ISO, 'utf8').replace(/--[^\n]*/g, '');

  test('o CHECK do asset_type traz as quatro categorias clássicas do direito de PI', () => {
    assert.match(
      code,
      /asset_type\s+text\s+not null\s+check\s*\(\s*asset_type in \(\s*'patent',\s*'trademark',\s*'copyright',\s*'trade_secret'\s*\)\s*\)/i,
    );
  });

  test('⭐⭐ o ciclo do ip é TERMINAL; a CONFORMIDADE do iso é MUTÁVEL (o DIVERGE)', () => {
    // O ip é uma máquina de estados terminal do STATUS do ativo.
    assert.match(code, /create\s+or\s+replace\s+function\s+ip\.allowed_transition/i);
    // ⭐⭐ O DIVERGE: a conformidade do iso (compliant/non_compliant/not_applicable)
    // é um CHECK MUTÁVEL, reavaliável a cada auditoria — NÃO uma máquina de
    // estados. O iso até tem allowed_transition, mas ela governa APENAS o ciclo
    // de arquivamento (active ↔ archived), jamais a conformidade.
    assert.match(iso, /compliance\s+text[\s\S]*?check\s*\(\s*compliance in \(\s*'compliant',\s*'non_compliant',\s*'not_applicable'\s*\)/i);
    const isoPairs = paresDoSql(MIGRATION_ISO, 'iso.allowed_transition');
    const conformidades = ['compliant', 'non_compliant', 'not_applicable'];
    for (const par of isoPairs) {
      const [de, para] = par.split('→');
      assert.ok(
        !conformidades.includes(de!) && !conformidades.includes(para!),
        `a máquina de estados do iso tocou a conformidade (${par}) — ela deveria ser mutável, fora do ciclo`,
      );
    }
  });

  test('⭐ nenhum par de transição sai de um terminal (rejected/expired não reabrem)', () => {
    const pares = paresDoSql(MIGRATION, 'ip.allowed_transition');
    for (const par of pares) {
      const [de] = par.split('→');
      assert.ok(!['rejected', 'expired'].includes(de!), `o ativo de PI ganhou uma volta (${par}) — terminal não reabre`);
    }
  });
});

describe('a leitura do acervo', () => {
  test('orderAssets: vivos primeiro (filed, granted), depois os terminais', () => {
    const lista = [
      ativo({ id: 'e', title: 'E', status: 'expired' }),
      ativo({ id: 'f', title: 'F', status: 'filed' }),
      ativo({ id: 'g', title: 'G', status: 'granted' }),
      ativo({ id: 'r', title: 'R', status: 'rejected' }),
    ];
    assert.deepEqual(orderAssets(lista).map((a) => a.id), ['f', 'g', 'r', 'e']);
  });

  test('summarizeAssets conta por estado — todo número é length', () => {
    const lista = [
      ativo({ status: 'filed' }),
      ativo({ status: 'granted' }),
      ativo({ status: 'granted' }),
      ativo({ status: 'rejected' }),
      ativo({ status: 'expired' }),
    ];
    assert.deepEqual(summarizeAssets(lista), { total: 5, filed: 1, granted: 2, rejected: 1, expired: 1 });
    assert.deepEqual(summarizeAssets([]), { total: 0, filed: 0, granted: 0, rejected: 0, expired: 0 });
  });
});
