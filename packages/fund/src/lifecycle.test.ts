import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { canSpend, computeBalance, whyCannotSpend } from './fund.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_FUND = resolve(HERE, '../../../supabase/migrations/0055_fund.sql');
const MIGRATION_BANK = resolve(HERE, '../../../supabase/migrations/0045_bank.sql');
const MIGRATION_INVEST = resolve(HERE, '../../../supabase/migrations/0046_invest.sql');

const fundSql = readFileSync(MIGRATION_FUND, 'utf8');
const bankSql = readFileSync(MIGRATION_BANK, 'utf8');
const investSql = readFileSync(MIGRATION_INVEST, 'utf8');

/**
 * ⭐⭐ A CONTRASTE fund×bank×invest — as TRÊS respostas para "pode ficar
 * negativo?":
 *   · `bank`   PERMITE — o saldo é view sobre o livro; cheque especial é
 *     produto bancário real; NENHUMA constraint/gatilho impede o negativo.
 *   · `inv`    PERMITE — o overpay do `ar` re-perguntado para o estoque
 *     físico (não temos a migration do inv aqui, mas o `bank` já assina o
 *     mesmo argumento no seu próprio cabeçalho — "a física do inv").
 *   · `invest` RECUSA resgatar MAIS que a posição — mas SÓ o excesso: uma
 *     posição em zero aceita resgate de zero (não há guarda estrutural
 *     contra QUALQUER movimento; a checagem é "não exceda").
 *   · `fund`   RECUSA de forma ESTRUTURAL: todo gasto é conferido contra o
 *     saldo (contribuições − gastos) ANTES de aceitar — é a resposta mais
 *     estrita das quatro, porque o dinheiro é coletivo dos lojistas, não do
 *     tenant.
 */
describe('⭐⭐ o contraste fund×bank×invest — as respostas a "pode ficar negativo?"', () => {
  test('bank PERMITE: nenhuma constraint/gatilho recusa o saldo negativo', () => {
    assert.match(bankSql, /PODE ser negativo/i);
    assert.doesNotMatch(bankSql, /não pode ficar negativo/i);
    // A view de saldo soma sem filtro de sinal — nenhum "check" barra o menos.
    assert.doesNotMatch(bankSql, /balance_cents.*>=?\s*0/i);
  });

  test('inv PERMITE saldo negativo — o overpay do ar re-perguntado para o físico (assinado no cabeçalho do bank)', () => {
    assert.match(bankSql, /a física do `inv`/);
    assert.match(bankSql, /saldo negativo permitido/);
  });

  test('invest RECUSA resgatar mais que a posição — a terceira resposta, mas só o excesso', () => {
    assert.match(investSql, /RESGATAR MAIS QUE A POSIÇÃO É RECUSADO/);
    assert.match(investSql, /new\.amount_cents > v_position/);
  });

  test('⭐⭐ fund RECUSA de forma estrutural — todo gasto é conferido, sempre', () => {
    assert.match(fundSql, /O SALDO NUNCA FICA NEGATIVO/);
    assert.match(fundSql, /\(v_balance - new\.amount_cents\) < 0/);
    assert.match(fundSql, /o fundo não pode ficar negativo: gastar mais do que arrecadou é descontrole/);
  });

  test('as quatro respostas são distintas, e cada uma está escrita no próprio arquivo', () => {
    // bank/inv: PERMITEM. invest: recusa o excesso. fund: recusa qualquer
    // gasto que ultrapasse — a mesma família de pergunta, quatro respostas.
    assert.notEqual(bankSql.includes('PODE ser negativo'), fundSql.includes('PODE ser negativo'));
  });
});

describe('⭐ fund.balance é security_invoker — a RLS decide o que entra na soma', () => {
  test('a view declara security_invoker = true', () => {
    const bloco = fundSql.split('create view fund.balance')[1]?.split(';')[0] ?? '';
    assert.match(bloco, /security_invoker\s*=\s*true/);
  });
});

describe('canSpend / computeBalance — o mesmo veredito do gatilho', () => {
  test('gasto que cabe no saldo é aceito', () => {
    assert.equal(canSpend(1000, 800), true);
  });

  test('⭐ gasto que excede o saldo é recusado — nunca negativo', () => {
    assert.equal(canSpend(1000, 1500), false);
    assert.equal(canSpend(200, 300), false);
  });

  test('gasto exato ao saldo é aceito — zera, não fica negativo', () => {
    assert.equal(canSpend(1000, 1000), true);
  });

  test('computeBalance é a soma honesta — contribuições menos gastos', () => {
    const balance = computeBalance(
      [{ amountCents: 600 }, { amountCents: 400 }],
      [{ amountCents: 300 }],
    );
    assert.equal(balance, 700);
  });

  test('whyCannotSpend explica a mesma física do gatilho', () => {
    assert.equal(whyCannotSpend(1000, 1500, 'campanha de natal'), 'o fundo não pode ficar negativo: gastar mais do que arrecadou é descontrole');
    assert.equal(whyCannotSpend(1000, 500, ''), 'Todo gasto exige uma razão.');
    assert.equal(whyCannotSpend(1000, 500, 'campanha de natal'), null);
  });
});
