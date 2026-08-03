import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateNewProcess,
  validateDecision,
  validateStages,
} from './proc.ts';
import type { NewStage } from './types.ts';

describe('a validação de um processo novo', () => {
  const bom = {
    workflowId: 'w',
    protocolNumber: '2026.0001',
    interestedPartyName: 'Maria da Silva',
    subject: 'Requerimento de alvará',
  };

  test('sem assunto não nasce', () => {
    assert.match(validateNewProcess({ ...bom, subject: '   ' }) ?? '', /assunto/);
  });

  test('sem rito não nasce — o processo não existe fora de um', () => {
    assert.match(validateNewProcess({ ...bom, workflowId: '' }) ?? '', /rito/);
  });

  /**
   * ⭐ O DIVERGE do `ops`: o número de protocolo é OBRIGATÓRIO — é a identidade
   * pública que o cidadão cita. (O `ops` decidiu NÃO ter número.)
   */
  test('⭐ sem número de protocolo não nasce — é a identidade pública', () => {
    assert.match(validateNewProcess({ ...bom, protocolNumber: '  ' }) ?? '', /número de protocolo/);
  });

  test('⭐ sem interessado não nasce — o processo é sempre o pedido de alguém', () => {
    assert.match(validateNewProcess({ ...bom, interestedPartyName: '' }) ?? '', /interessado/);
  });

  test('prazo fora do formato é recusado com frase, não com erro de banco', () => {
    assert.match(
      validateNewProcess({ ...bom, dueDate: '30/09/2026' }) ?? '',
      /AAAA-MM-DD/,
    );
  });

  test('o número em TEXTO LIVRE — cada órgão tem a convenção dele', () => {
    // Não impomos formato: "2026.0001", "PROT-123/26", "45.678.901/2026-12".
    assert.equal(validateNewProcess({ ...bom, protocolNumber: 'PROT-123/26' }), null);
    assert.equal(validateNewProcess({ ...bom, protocolNumber: '45.678.901/2026-12' }), null);
  });

  test('sem prazo é válido — processo sem prazo existe', () => {
    assert.equal(validateNewProcess(bom), null);
    assert.equal(validateNewProcess({ ...bom, dueDate: null }), null);
    assert.equal(validateNewProcess({ ...bom, dueDate: '' }), null);
  });
});

describe('⭐ a validação do despacho da decisão formal', () => {
  test('deferir/indeferir/arquivar sem despacho é recusado — ato nulo', () => {
    assert.match(validateDecision('deferred', '   ') ?? '', /despacho/);
    assert.match(validateDecision('denied', '') ?? '', /despacho/);
    assert.match(validateDecision('dismissed', '') ?? '', /despacho/);
  });

  test('com despacho, a decisão passa', () => {
    assert.equal(validateDecision('deferred', 'Deferido nos termos do parecer nº 12.'), null);
    assert.equal(validateDecision('denied', 'Indeferido por falta de documentação.'), null);
    assert.equal(validateDecision('dismissed', 'Arquivado por desistência do interessado.'), null);
  });
});

describe('a validação de um rito', () => {
  const etapa = (over: Partial<NewStage>): NewStage => ({
    name: 'x',
    position: 0,
    requiresApproval: false,
    skippable: false,
    ...over,
  });

  test('rito sem etapa nenhuma é recusado, com frase', () => {
    assert.match(validateStages([]) ?? '', /pelo menos uma etapa/);
  });

  test('etapa sem nome é recusada', () => {
    assert.match(validateStages([etapa({ name: '  ' })]) ?? '', /nome/);
  });

  test('dois nomes iguais no mesmo rito só geram engano', () => {
    const r = validateStages([
      etapa({ name: 'parecer', position: 0 }),
      etapa({ name: 'Parecer', position: 1 }),
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

  test('o rito de um requerimento passa inteiro', () => {
    const cinco = ['protocolado', 'análise', 'instrução', 'parecer', 'decisão'].map(
      (name, i) => etapa({ name, position: i }),
    );
    assert.equal(validateStages(cinco), null);
  });

  test('⭐ e o rito de OUTRO órgão também — as etapas são dado do tenant', () => {
    const tres = ['recebido', 'triagem', 'resposta'].map((name, i) =>
      etapa({ name, position: i }),
    );
    assert.equal(validateStages(tres), null);
  });
});
