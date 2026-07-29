import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateNewOrder,
  validateStages,
  nextVersion,
  latestDeliverables,
} from './order.ts';
import type { Deliverable, NewStage } from './types.ts';

function entregavel(over: Partial<Deliverable> = {}): Deliverable {
  return {
    id: 'd',
    orderId: 'o1',
    stageId: null,
    stageName: null,
    kind: 'arte',
    reference: 'https://exemplo.invalido/x',
    version: 1,
    instruction: '',
    ...over,
  };
}

describe('a validação de uma OS nova', () => {
  test('sem título não nasce', () => {
    assert.match(validateNewOrder({ pipelineId: 'p', title: '   ' }) ?? '', /título/);
  });

  test('sem esteira não nasce — a OS não existe fora de uma', () => {
    assert.match(validateNewOrder({ pipelineId: '', title: 'x' }) ?? '', /esteira/);
  });

  test('prazo fora do formato é recusado com frase, não com erro de banco', () => {
    assert.match(
      validateNewOrder({ pipelineId: 'p', title: 'x', dueDate: '30/09/2026' }) ?? '',
      /AAAA-MM-DD/,
    );
  });

  test('sem prazo é válido — trabalho sem prazo existe', () => {
    assert.equal(validateNewOrder({ pipelineId: 'p', title: 'x' }), null);
    assert.equal(validateNewOrder({ pipelineId: 'p', title: 'x', dueDate: null }), null);
    assert.equal(validateNewOrder({ pipelineId: 'p', title: 'x', dueDate: '' }), null);
  });
});

describe('a validação de uma esteira', () => {
  const etapa = (over: Partial<NewStage>): NewStage => ({
    name: 'x',
    position: 0,
    requiresApproval: false,
    skippable: false,
    ...over,
  });

  /**
   * ⚠️ Esteira vazia aceitaria uma OS que nasce sem etapa nenhuma. A coerência
   * do banco recusaria — mas com um erro de chave estrangeira que ninguém
   * entende. Aqui a recusa tem frase.
   */
  test('esteira sem etapa nenhuma é recusada, com frase', () => {
    assert.match(validateStages([]) ?? '', /pelo menos uma etapa/);
  });

  test('etapa sem nome é recusada', () => {
    assert.match(validateStages([etapa({ name: '  ' })]) ?? '', /nome/);
  });

  test('dois nomes iguais na mesma esteira só geram engano', () => {
    const r = validateStages([
      etapa({ name: 'revisão', position: 0 }),
      etapa({ name: 'Revisão', position: 1 }),
    ]);
    assert.match(r ?? '', /mesmo nome/);
  });

  test('duas etapas na mesma posição são recusadas', () => {
    const r = validateStages([
      etapa({ name: 'a', position: 2 }),
      etapa({ name: 'b', position: 2 }),
    ]);
    assert.match(r ?? '', /mesma posição/);
  });

  test('a esteira do enunciado passa inteira', () => {
    const seis = ['abertura', 'briefing', 'criação', 'revisão', 'aprovação', 'veiculação'].map(
      (name, i) => etapa({ name, position: i }),
    );
    assert.equal(validateStages(seis), null);
  });

  test('⭐ e a esteira de OUTRO ofício também — o módulo não é de marketing', () => {
    const tres = ['chamado', 'vistoria', 'execução'].map((name, i) =>
      etapa({ name, position: i }),
    );
    assert.equal(validateStages(tres), null);
  });
});

describe('o versionamento do entregável', () => {
  test('o primeiro de um tipo é v1', () => {
    assert.equal(nextVersion([], 'o1', 'arte'), 1);
  });

  test('refazer soma um', () => {
    assert.equal(nextVersion([entregavel({ version: 1 })], 'o1', 'arte'), 2);
    assert.equal(
      nextVersion([entregavel({ version: 1 }), entregavel({ version: 2 })], 'o1', 'arte'),
      3,
    );
  });

  /**
   * ⭐ A numeração é por (OS, tipo): a segunda arte é v2 mesmo que já existam
   * cinco versões da legenda. Contar por OS faria o número saltar sem motivo e
   * o cliente perguntar o que aconteceu com as versões que faltam.
   */
  test('⭐ a numeração é por TIPO, não pela OS inteira', () => {
    const existentes = [
      entregavel({ kind: 'legenda', version: 1 }),
      entregavel({ kind: 'legenda', version: 2 }),
      entregavel({ kind: 'legenda', version: 3 }),
    ];
    assert.equal(nextVersion(existentes, 'o1', 'arte'), 1);
    assert.equal(nextVersion(existentes, 'o1', 'legenda'), 4);
  });

  test('e por OS: a v1 de uma não é a v2 da outra', () => {
    const existentes = [entregavel({ orderId: 'o1', version: 1 })];
    assert.equal(nextVersion(existentes, 'o2', 'arte'), 1);
  });

  test('⚠️ um buraco na numeração não faz a próxima retroceder', () => {
    // Se a v2 falhar e ficar só a v1 e a v3, a próxima é a v4. `length + 1`
    // devolveria 3 e colidiria com a que já existe — e o banco recusaria, o
    // que é a rede de segurança, não o comportamento desejado.
    const existentes = [entregavel({ version: 1 }), entregavel({ version: 3 })];
    assert.equal(nextVersion(existentes, 'o1', 'arte'), 4);
  });
});

describe('a versão corrente de cada entregável', () => {
  test('devolve a mais alta de cada tipo, uma vez só', () => {
    const todas = [
      entregavel({ id: '1', kind: 'arte', version: 1 }),
      entregavel({ id: '2', kind: 'arte', version: 2 }),
      entregavel({ id: '3', kind: 'legenda', version: 1 }),
    ];
    const correntes = latestDeliverables(todas);
    assert.equal(correntes.length, 2);
    assert.deepEqual(correntes.map((d) => d.id), ['2', '3']);
  });

  test('não depende da ordem em que o banco devolveu', () => {
    const desordenada = [
      entregavel({ id: '2', kind: 'arte', version: 2 }),
      entregavel({ id: '1', kind: 'arte', version: 1 }),
    ];
    assert.deepEqual(latestDeliverables(desordenada).map((d) => d.id), ['2']);
  });

  test('sem entregável nenhum, devolve lista vazia — não quebra', () => {
    assert.deepEqual(latestDeliverables([]), []);
  });
});
