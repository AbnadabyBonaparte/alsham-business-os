import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewParty, validateNewInteraction } from './party.ts';
import type { NewInteractionInput, NewPartyInput } from './types.ts';

const BOA: NewPartyInput = {
  kind: 'org',
  displayName: 'Contraparte Alfa',
  taxId: 'A-99-XYZ',
  email: 'contato@alfa.invalid',
  tags: ['fornecedor'],
};

function problemas(input: NewPartyInput): readonly string[] {
  const r = validateNewParty(input);
  return r.ok ? [] : r.problems.map((p) => p.field);
}

describe('a validação de uma contraparte nova', () => {
  test('o caso bom passa e nasce ativa', () => {
    const r = validateNewParty(BOA);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.status, 'active');
    assert.equal(r.value.kind, 'org');
    assert.deepEqual(r.value.tags, ['fornecedor']);
  });

  test('devolve TODOS os problemas de uma vez, não o primeiro', () => {
    assert.deepEqual([...problemas({})].sort(), ['displayName', 'kind']);
  });

  test('o tipo é pessoa ou organização — e nada mais', () => {
    assert.deepEqual(problemas({ ...BOA, kind: 'cliente' }), ['kind']);
    assert.deepEqual(problemas({ ...BOA, kind: 'fornecedor' }), ['kind']);
    assert.deepEqual(problemas({ ...BOA, kind: 'lead' }), ['kind']);
    // "Cliente", "fornecedor" e "lead" são ETIQUETAS, escolhidas pelo tenant.
    // Se um dia virarem `kind`, o viés entrou — e este teste é o que morde.
    const r = validateNewParty({ ...BOA, tags: ['cliente', 'fornecedor', 'lead'] });
    assert.equal(r.ok, true);
  });

  test('o nome é obrigatório e espaço em branco não conta como nome', () => {
    assert.deepEqual(problemas({ ...BOA, displayName: '   ' }), ['displayName']);
  });

  /**
   * ⛔ **O TESTE MAIS IMPORTANTE DESTE ARQUIVO.**
   *
   * O identificador fiscal é NEUTRO e sem formato. Validar CPF/CNPJ aqui —
   * contagem de dígitos, dígito verificador, máscara — amarraria o produto ao
   * Brasil, e é o erro mais fácil de cometer neste módulo inteiro.
   */
  test('⛔ o identificador fiscal não tem formato — nem 11, nem 14, nem dígito', () => {
    for (const id of [
      '12345678901',        // pareceria CPF
      '12.345.678/0001-90', // pareceria CNPJ
      'A-99-XYZ',           // não pareceria nada
      'DE123456789',        // VAT europeu
      '123-45-6789',        // SSN
      'x',
    ]) {
      const r = validateNewParty({ ...BOA, taxId: id });
      assert.equal(r.ok, true, `${id} devia passar — formato fiscal é de um país`);
      if (r.ok) assert.equal(r.value.taxId, id);
    }
  });

  test('o identificador é OPCIONAL — nem toda contraparte tem um', () => {
    const r = validateNewParty({ ...BOA, taxId: undefined });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.taxId, null);
  });

  test('⛔ o telefone não tem formato — nem DDD, nem código de país', () => {
    for (const tel of ['+55 11 90000-0000', '11 3000-0000', '+1 (555) 010-0000', 'ramal 42']) {
      assert.equal(validateNewParty({ ...BOA, phone: tel }).ok, true, tel);
    }
  });

  test('o e-mail só precisa parecer um e-mail', () => {
    assert.deepEqual(problemas({ ...BOA, email: 'sem-arroba' }), ['email']);
    assert.deepEqual(problemas({ ...BOA, email: '@sozinho' }), ['email']);
    // Endereços estranhos e VÁLIDOS passam: regex "completa" recusa e-mails
    // reais, e quem paga é o usuário que tem um deles.
    assert.equal(validateNewParty({ ...BOA, email: "o'brien+tag@sub.exemplo.invalid" }).ok, true);
  });

  test('e-mail e telefone são opcionais', () => {
    const r = validateNewParty({ kind: 'person', displayName: 'Alguém' });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.email, null);
    assert.equal(r.value.phone, null);
    assert.deepEqual(r.value.tags, []);
  });

  test('os textos chegam aparados, e a observação ausente vira vazia', () => {
    const r = validateNewParty({ ...BOA, displayName: '  Alfa  ', note: undefined });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.displayName, 'Alfa');
    assert.equal(r.value.note, '');
  });

  test('há teto de tamanho, e ele acusa o campo certo', () => {
    assert.deepEqual(problemas({ ...BOA, displayName: 'a'.repeat(201) }), ['displayName']);
    assert.deepEqual(problemas({ ...BOA, taxId: 'a'.repeat(65) }), ['taxId']);
    assert.deepEqual(problemas({ ...BOA, note: 'a'.repeat(2001) }), ['note']);
    assert.deepEqual(
      problemas({ ...BOA, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }),
      ['tags'],
    );
  });
});

const CONTATO: NewInteractionInput = {
  partyId: '00000000-0000-4000-8000-000000000001',
  occurredAt: '2026-07-20T14:00:00.000Z',
  channel: 'ligação',
  note: 'primeiro contato',
};

function problemasI(input: NewInteractionInput): readonly string[] {
  const r = validateNewInteraction(input);
  return r.ok ? [] : r.problems.map((p) => p.field);
}

describe('a validação de uma interação nova', () => {
  test('o caso bom passa, com a data normalizada em ISO', () => {
    const r = validateNewInteraction(CONTATO);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.occurredAt, '2026-07-20T14:00:00.000Z');
    assert.equal(r.value.channel, 'ligação');
  });

  test('devolve todos os problemas de uma vez', () => {
    assert.deepEqual([...problemasI({})].sort(), ['channel', 'occurredAt', 'partyId']);
  });

  /**
   * ⛔ O canal é TEXTO LIVRE. A Taxonomia lista *WhatsApp* como capacidade do
   * Domain, e é assim que o mercado nomeia — mas congelar o instrumento de um
   * país e de uma década num enum é o viés inteiro.
   */
  test('⛔ o canal é texto livre — nenhum enum, nenhum aplicativo no schema', () => {
    for (const canal of [
      'ligação',
      'visita',
      'e-mail',
      'aplicativo de mensagem',
      'carta registrada',
      'videochamada',
      'o que existir em 2030',
    ]) {
      const r = validateNewInteraction({ ...CONTATO, channel: canal });
      assert.equal(r.ok, true, canal);
      if (r.ok) assert.equal(r.value.channel, canal);
    }
  });

  test('⚠️ data no futuro NÃO é erro — registrar a visita de amanhã é uso legítimo', () => {
    assert.equal(validateNewInteraction({ ...CONTATO, occurredAt: '2099-01-01T10:00:00.000Z' }).ok, true);
  });

  test('data no passado também não é erro — registrar a visita de ontem é o caso comum', () => {
    assert.equal(validateNewInteraction({ ...CONTATO, occurredAt: '2019-01-01T10:00:00.000Z' }).ok, true);
  });

  test('data que não é data é erro', () => {
    assert.deepEqual(problemasI({ ...CONTATO, occurredAt: 'ontem' }), ['occurredAt']);
  });

  test('interação sem contraparte não existe', () => {
    assert.deepEqual(problemasI({ ...CONTATO, partyId: '  ' }), ['partyId']);
  });

  test('a anotação é opcional e vira vazia', () => {
    const r = validateNewInteraction({ ...CONTATO, note: undefined });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.note, '');
  });

  test('cada problema diz o campo culpado, para a tela saber onde pintar', () => {
    const r = validateNewInteraction({});
    assert.equal(r.ok, false);
    if (r.ok) return;
    for (const p of r.problems) {
      assert.ok(p.field.length > 0);
      assert.ok(p.message.length > 0);
    }
  });
});
