import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewPayable } from './payable.ts';
import type { NewPayableInput } from './types.ts';

const BOM: NewPayableInput = {
  externalRef: 'DOC-2026-0001',
  dueDate: '2026-09-10',
  amountCents: 150_000,
  currency: 'BRL',
  supplierName: 'Fornecedor Alfa',
  description: 'serviço prestado',
};

function problemas(input: NewPayableInput): readonly string[] {
  const r = validateNewPayable(input);
  return r.ok ? [] : r.problems.map((p) => p.field);
}

describe('a validação de um título novo', () => {
  test('o caso bom passa e nasce aberto, sem nada liquidado', () => {
    const r = validateNewPayable(BOM);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.status, 'open');
    assert.equal(r.value.settledAmountCents, 0);
    assert.equal(r.value.externalRef, 'DOC-2026-0001');
  });

  test('devolve TODOS os problemas de uma vez, não o primeiro', () => {
    const encontrados = problemas({});
    // Formulário que revela um erro por vez faz descobrir o quarto na quarta
    // tentativa. Se este teste virar `length >= 1`, a decisão se perdeu.
    assert.deepEqual([...encontrados].sort(), ['amountCents', 'currency', 'dueDate', 'externalRef']);
  });

  test('a referência é obrigatória e espaço em branco não conta como referência', () => {
    assert.deepEqual(problemas({ ...BOM, externalRef: '   ' }), ['externalRef']);
  });

  test('o valor tem de ser inteiro de centavos e positivo', () => {
    assert.deepEqual(problemas({ ...BOM, amountCents: 0 }), ['amountCents']);
    assert.deepEqual(problemas({ ...BOM, amountCents: -100 }), ['amountCents']);
    // 1500.5 centavos não é dinheiro: é erro de conversão de alguém.
    assert.deepEqual(problemas({ ...BOM, amountCents: 1500.5 }), ['amountCents']);
    assert.deepEqual(problemas({ ...BOM, amountCents: '150000' }), ['amountCents']);
  });

  test('a moeda é ISO de três letras — e não há default, porque presumir é viés', () => {
    assert.deepEqual(problemas({ ...BOM, currency: 'brl' }), ['currency']);
    assert.deepEqual(problemas({ ...BOM, currency: 'REAL' }), ['currency']);
    assert.deepEqual(problemas({ ...BOM, currency: undefined }), ['currency']);
    // Qualquer moeda de três letras serve. Não há lista de "aceitas".
    assert.equal(validateNewPayable({ ...BOM, currency: 'MZN' }).ok, true);
    assert.equal(validateNewPayable({ ...BOM, currency: 'JPY' }).ok, true);
  });

  test('a data tem de existir no calendário', () => {
    assert.deepEqual(problemas({ ...BOM, dueDate: '10/09/2026' }), ['dueDate']);
    // `new Date('2026-02-30')` rola para 2 de março sem reclamar. Aqui não rola.
    assert.deepEqual(problemas({ ...BOM, dueDate: '2026-02-30' }), ['dueDate']);
    assert.deepEqual(problemas({ ...BOM, dueDate: '2026-13-01' }), ['dueDate']);
    assert.equal(validateNewPayable({ ...BOM, dueDate: '2028-02-29' }).ok, true, 'ano bissexto');
  });

  test('⚠️ vencimento no passado NÃO é erro — quem migra tem gaveta cheia deles', () => {
    const r = validateNewPayable({ ...BOM, dueDate: '2019-01-05' });
    assert.equal(r.ok, true);
  });

  test('fornecedor não é obrigatório — há despesa sem contraparte nomeada', () => {
    const r = validateNewPayable({ ...BOM, supplierName: undefined });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.supplierName, null);
  });

  test('a descrição ausente vira string vazia, nunca null', () => {
    const r = validateNewPayable({ ...BOM, description: undefined });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.description, '');
  });

  test('o identificador fiscal é NEUTRO e opcional — cada país põe o seu', () => {
    const r = validateNewPayable({ ...BOM, counterpartyTaxId: '  A-99-XYZ  ' });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    // Sem máscara, sem dígito verificador, sem 11-ou-14 dígitos: validar
    // formato brasileiro aqui amarraria o produto ao Brasil.
    assert.equal(r.value.counterpartyTaxId, 'A-99-XYZ');
  });

  test('a forma de pagamento é texto livre — sem lista, sem boleto, sem PIX', () => {
    for (const forma of ['transferência', 'wire transfer', 'SEPA', 'qualquer coisa']) {
      const r = validateNewPayable({ ...BOM, paymentMethod: forma });
      assert.equal(r.ok, true, `${forma} devia passar`);
      if (r.ok) assert.equal(r.value.paymentMethod, forma);
    }
  });

  test('os textos chegam aparados', () => {
    const r = validateNewPayable({ ...BOM, externalRef: '  DOC-9  ', supplierName: ' Alfa ' });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.externalRef, 'DOC-9');
    assert.equal(r.value.supplierName, 'Alfa');
  });

  test('cada problema diz o campo culpado, para a tela saber onde pintar', () => {
    const r = validateNewPayable({ ...BOM, amountCents: -1, currency: 'x' });
    assert.equal(r.ok, false);
    if (r.ok) return;
    for (const p of r.problems) {
      assert.ok(p.field.length > 0);
      assert.ok(p.message.length > 0);
    }
  });
});
