import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { ALLOWED_TRANSITIONS, canEnd, canTransition, isEnded, orderAgreements, whyCannotEnd } from './lease.ts';
import type { Agreement } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0054_lease.sql');
const MIGRATION_CTR = resolve(HERE, '../../../supabase/migrations/0028_ctr.sql');

function locacao(over: Partial<Agreement> = {}): Agreement {
  return {
    id: 'a1',
    contractId: 'ctr-1',
    contractRef: 'Contrato 042',
    storeId: 'store-1',
    storeName: 'Ateliê da Praça',
    revenueShare: '8% sobre vendas',
    status: 'active',
    endReason: '',
    endedAt: null,
    ...over,
  };
}

describe('⭐ o ciclo — a mais simples do catálogo, de propósito', () => {
  test('⭐ active → ended: a única transição', () => {
    assert.equal(canTransition('active', 'ended'), true);
    assert.equal(canTransition('ended', 'active'), false);
    assert.equal(canEnd('active'), true);
    assert.equal(canEnd('ended'), false);
    assert.equal(isEnded('ended'), true);
    assert.equal(isEnded('active'), false);
    assert.equal(ALLOWED_TRANSITIONS.length, 1);
  });

  test('whyCannotEnd explica antes de o botão falhar em silêncio', () => {
    assert.equal(whyCannotEnd('active', ''), 'encerrar exige a razão: locação sem motivo é história que ninguém consegue ler depois');
    assert.equal(whyCannotEnd('active', 'fim do contrato'), null);
    assert.match(whyCannotEnd('ended', 'qualquer coisa') ?? '', /terminal/);
  });

  test('o mapa lê ativas primeiro', () => {
    const ordenado = orderAgreements([
      locacao({ id: 'c', status: 'ended', storeName: 'Zeta' }),
      locacao({ id: 'b', status: 'active', storeName: 'Bravo' }),
      locacao({ id: 'a', status: 'active', storeName: 'Alfa' }),
    ]);
    assert.deepEqual(ordenado.map((a) => a.id), ['a', 'b', 'c']);
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

  test('lease.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'lease.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, ALLOWED_TRANSITIONS.length);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐⭐ o contraste lease×ctr: a Lei do Reaproveitamento provada', () => {
  const leaseSql = readFileSync(MIGRATION, 'utf8');
  const ctrSql = readFileSync(MIGRATION_CTR, 'utf8');
  const leaseCode = leaseSql.replace(/--[^\n]*/g, '');
  const ctrCode = ctrSql.replace(/--[^\n]*/g, '');

  test('o ctr é quem possui vigência/termo — a view do termo vigente vive lá', () => {
    assert.match(ctrCode, /ctr\.contract_terms/, 'o ctr perdeu a view do termo vigente');
    assert.match(ctrCode, /current_value_cents|current_ends_on/, 'o ctr perdeu o cálculo do termo vigente');
    assert.match(ctrCode, /ctr\.adjustments/, 'o ctr perdeu o livro de reajustes');
    assert.match(ctrCode, /ctr\.renewals/, 'o ctr perdeu o livro de renovações');
  });

  test('⭐⭐ o lease NÃO reimplementa a física do ctr: nenhuma tabela de vigência/reajuste/renovação', () => {
    assert.doesNotMatch(leaseCode, /create\s+table\s+lease\.terms/i);
    assert.doesNotMatch(leaseCode, /create\s+table\s+lease\.amendment/i);
    assert.doesNotMatch(leaseCode, /create\s+table\s+lease\.adjustments/i);
    assert.doesNotMatch(leaseCode, /create\s+table\s+lease\.renewals/i);
    assert.doesNotMatch(leaseCode, /register_adjustment|renew_contract/i);
  });

  test('o vínculo com o ctr é ID SOLTO — nunca FK cruzada', () => {
    assert.doesNotMatch(
      leaseCode,
      /references\s+ctr\./i,
      'o lease criou FK para o schema ctr — o vínculo tem que ser solto',
    );
    assert.match(leaseCode, /contract_id\s+uuid\s+not\s+null/);
  });

  test('o vínculo com o mall também é ID SOLTO — nunca FK cruzada', () => {
    assert.doesNotMatch(
      leaseCode,
      /references\s+mall\./i,
      'o lease criou FK para o schema mall — o vínculo tem que ser solto',
    );
    assert.match(leaseCode, /store_id\s+uuid\s+not\s+null/);
  });

  test('a locação é a mais simples: só active → ended, sem meio-termo', () => {
    assert.equal(ALLOWED_TRANSITIONS.length, 1);
    // O ctr tem quatro transições (draft/active/ended/terminated/cancelled) —
    // a locação, como camada fina, tem uma só.
    const ctrPares = paresDoSql(ctrCode);
    assert.ok(ctrPares.size > ALLOWED_TRANSITIONS.length, 'o ctr precisa ter mais física do que a camada fina');
  });

  function paresDoSql(codigoSemComentario: string): Set<string> {
    const corpo = codigoSemComentario.split('create or replace function ctr.allowed_transition')[1];
    const bloco = corpo?.split('$$;')[0] ?? '';
    const pares = new Set<string>();
    for (const m of bloco.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
      pares.add(`${m[1]}→${m[2]}`);
    }
    return pares;
  }
});
