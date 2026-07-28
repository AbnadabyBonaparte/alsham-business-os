import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewReceivable } from './receivable.ts';
import type { NewReceivableInput } from './types.ts';

const BOM: NewReceivableInput = {
  externalRef: 'DOC-R-2026-0001',
  dueDate: '2026-09-10',
  amountCents: 150_000,
  currency: 'BRL',
  payerName: 'Contraparte Alfa',
  description: 'serviço prestado',
};

function problemas(input: NewReceivableInput): readonly string[] {
  const r = validateNewReceivable(input);
  return r.ok ? [] : r.problems.map((p) => p.field);
}

describe('a validação de um título a receber novo', () => {
  test('o caso bom passa e nasce aberto, sem nada recebido', () => {
    const r = validateNewReceivable(BOM);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.status, 'open');
    assert.equal(r.value.receivedAmountCents, 0);
    assert.equal(r.value.externalRef, 'DOC-R-2026-0001');
  });

  test('devolve TODOS os problemas de uma vez, não o primeiro', () => {
    assert.deepEqual(
      [...problemas({})].sort(),
      ['amountCents', 'currency', 'dueDate', 'externalRef'],
    );
  });

  test('a referência é obrigatória e espaço em branco não conta', () => {
    assert.deepEqual(problemas({ ...BOM, externalRef: '   ' }), ['externalRef']);
  });

  test('o valor tem de ser inteiro de centavos e positivo', () => {
    assert.deepEqual(problemas({ ...BOM, amountCents: 0 }), ['amountCents']);
    assert.deepEqual(problemas({ ...BOM, amountCents: -100 }), ['amountCents']);
    assert.deepEqual(problemas({ ...BOM, amountCents: 1500.5 }), ['amountCents']);
    assert.deepEqual(problemas({ ...BOM, amountCents: '150000' }), ['amountCents']);
  });

  test('a moeda é ISO de três letras — e não há default, porque presumir é viés', () => {
    assert.deepEqual(problemas({ ...BOM, currency: 'brl' }), ['currency']);
    assert.deepEqual(problemas({ ...BOM, currency: undefined }), ['currency']);
    // Qualquer moeda de três letras serve. Contas a receber em mais de uma
    // moeda é o caso de quem exporta — exatamente o cliente que um schema com
    // moeda presumida teria excluído.
    for (const m of ['MZN', 'JPY', 'AOA', 'EUR']) {
      assert.equal(validateNewReceivable({ ...BOM, currency: m }).ok, true, m);
    }
  });

  test('a data tem de existir no calendário', () => {
    assert.deepEqual(problemas({ ...BOM, dueDate: '10/09/2026' }), ['dueDate']);
    // `new Date('2026-02-30')` rola para 2 de março sem reclamar. Aqui não rola.
    assert.deepEqual(problemas({ ...BOM, dueDate: '2026-02-30' }), ['dueDate']);
    assert.equal(validateNewReceivable({ ...BOM, dueDate: '2028-02-29' }).ok, true, 'bissexto');
  });

  test('⚠️ vencimento no passado NÃO é erro — é justamente o que se quer cobrar', () => {
    assert.equal(validateNewReceivable({ ...BOM, dueDate: '2019-01-05' }).ok, true);
  });

  test('o pagador não é obrigatório — há crédito sem contraparte nomeada', () => {
    const r = validateNewReceivable({ ...BOM, payerName: undefined });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.payerName, null);
  });

  /**
   * ⛔ O identificador fiscal é NEUTRO e sem formato — a mesma decisão do `ap`
   * e do `crm`. Validar CPF/CNPJ aqui amarraria o produto ao Brasil.
   */
  test('⛔ o identificador fiscal não tem formato', () => {
    for (const id of ['12345678901', '12.345.678/0001-90', 'A-99-XYZ', 'DE123456789']) {
      const r = validateNewReceivable({ ...BOM, counterpartyTaxId: id });
      assert.equal(r.ok, true, id);
      if (r.ok) assert.equal(r.value.counterpartyTaxId, id);
    }
  });

  test('⛔ a forma de receber é texto livre — sem boleto, sem PIX, sem carnê', () => {
    for (const forma of [
      'transferência',
      'depósito',
      'cartão',
      'wire transfer',
      'SEPA',
      'o que existir em 2030',
    ]) {
      const r = validateNewReceivable({ ...BOM, settlementMethod: forma });
      assert.equal(r.ok, true, forma);
      if (r.ok) assert.equal(r.value.settlementMethod, forma);
    }
  });

  test('os textos chegam aparados e a descrição ausente vira vazia', () => {
    const r = validateNewReceivable({
      ...BOM,
      externalRef: '  DOC-9  ',
      payerName: ' Alfa ',
      description: undefined,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.externalRef, 'DOC-9');
    assert.equal(r.value.payerName, 'Alfa');
    assert.equal(r.value.description, '');
  });

  test('cada problema diz o campo culpado, para a tela saber onde pintar', () => {
    const r = validateNewReceivable({ ...BOM, amountCents: -1, currency: 'x' });
    assert.equal(r.ok, false);
    if (r.ok) return;
    for (const p of r.problems) {
      assert.ok(p.field.length > 0);
      assert.ok(p.message.length > 0);
    }
  });
});
