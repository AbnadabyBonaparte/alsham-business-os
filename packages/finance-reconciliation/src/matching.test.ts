import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  daysBetween,
  normalizeTaxId,
  normalizeText,
  scorePair,
  suggestMatches,
  unmatchedLines,
} from './matching.ts';
import { MANIFEST } from './manifest.ts';
import type { MatchingSettings, Payable, StatementLine } from './types.ts';

/**
 * Testes do motor de conciliação.
 *
 * Nenhum banco, nenhuma rede, nenhum relógio — o motor é puro, então o teste
 * é puro. `node --test` roda TypeScript direto no Node 22: zero dependência
 * de teste no monorepo.
 *
 * ⚠️ **Lei anti-viés nos próprios dados de teste.** Nomes de fornecedor aqui
 * são genéricos de propósito ("Fornecedor Alfa"). Nome de cliente ou de
 * fornecedor real não entra em fixture, nem em teste, nem em comentário.
 */

const TENANT = '00000000-0000-4000-8000-000000000001';

/** Política de tenant fictícia. Vem de `tenant_modules.settings` na vida real. */
const SETTINGS: MatchingSettings = {
  amountToleranceCents: 100,
  dateToleranceDays: 5,
  minScore: 0.6,
};

function line(over: Partial<StatementLine> & { id: string }): StatementLine {
  return {
    tenantId: TENANT,
    statementId: 'stmt-1',
    lineNo: 1,
    postedAt: '2026-07-10',
    amountCents: -150_00,
    currency: 'BRL',
    description: '',
    status: 'unmatched',
    ...over,
  };
}

function payable(over: Partial<Payable> & { id: string }): Payable {
  return {
    tenantId: TENANT,
    source: 'imported',
    externalRef: 'NF-1001',
    dueDate: '2026-07-10',
    amountCents: 150_00,
    settledAmountCents: 0,
    currency: 'BRL',
    description: '',
    status: 'open',
    ...over,
  };
}

describe('normalização', () => {
  test('identificador fiscal ignora pontuação e caixa', () => {
    assert.equal(normalizeTaxId('12.345.678/0001-90'), '12345678000190');
    assert.equal(normalizeTaxId('ab-12'), 'AB12');
  });

  test('identificador fiscal vazio ou só pontuação vira null', () => {
    assert.equal(normalizeTaxId(null), null);
    assert.equal(normalizeTaxId('   '), null);
    assert.equal(normalizeTaxId('.-/'), null);
  });

  test('texto perde acento, caixa e espaço duplicado', () => {
    assert.equal(normalizeText('  PAGAMENTO   Serviço Único '), 'pagamento servico unico');
  });
});

describe('distância de datas', () => {
  test('conta dias entre datas-calendário', () => {
    assert.equal(daysBetween('2026-07-10', '2026-07-15'), 5);
    assert.equal(daysBetween('2026-07-15', '2026-07-10'), 5);
    assert.equal(daysBetween('2026-07-10', '2026-07-10'), 0);
  });

  test('atravessa virada de mês e de ano', () => {
    assert.equal(daysBetween('2026-07-31', '2026-08-01'), 1);
    assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  });

  test('data malformada é erro explícito, não silêncio', () => {
    assert.throws(() => daysBetween('ontem', '2026-07-10'), TypeError);
  });
});

describe('scorePair — os portões eliminatórios', () => {
  test('entrada de dinheiro nunca quita conta a pagar', () => {
    const r = scorePair(line({ id: 'l1', amountCents: +150_00 }), payable({ id: 'p1' }), SETTINGS);
    assert.equal(r, null);
  });

  test('valor fora da tolerância não é candidato, por mais que o resto case', () => {
    const r = scorePair(
      line({ id: 'l1', amountCents: -150_00, counterpartyTaxId: '111', description: 'nf-1001' }),
      payable({ id: 'p1', amountCents: 200_00, supplierTaxId: '111' }),
      SETTINGS,
    );
    assert.equal(r, null, 'diferença de R$50 com tolerância de R$1 não pode passar');
  });

  test('moedas diferentes não se conciliam', () => {
    const r = scorePair(
      line({ id: 'l1', currency: 'USD' }),
      payable({ id: 'p1', currency: 'BRL' }),
      SETTINGS,
    );
    assert.equal(r, null);
  });

  test('título já quitado sai do páreo', () => {
    const r = scorePair(
      line({ id: 'l1' }),
      payable({ id: 'p1', settledAmountCents: 150_00 }),
      SETTINGS,
    );
    assert.equal(r, null);
  });
});

describe('scorePair — pontuação', () => {
  test('casamento perfeito pontua 1 e nomeia todos os sinais', () => {
    const r = scorePair(
      line({
        id: 'l1',
        amountCents: -150_00,
        postedAt: '2026-07-10',
        description: 'PAGTO NF-1001 FORNECEDOR ALFA',
        counterpartyTaxId: '12.345.678/0001-90',
        counterpartyName: 'Fornecedor Alfa Ltda',
      }),
      payable({
        id: 'p1',
        amountCents: 150_00,
        dueDate: '2026-07-10',
        externalRef: 'NF-1001',
        supplierTaxId: '12345678000190',
        supplierName: 'Fornecedor Alfa Ltda',
      }),
      SETTINGS,
    );
    assert.ok(r);
    assert.equal(r.score, 1);
    assert.equal(r.strategy, 'amount+date+tax-id+reference+name');
    assert.equal(r.matchedAmountCents, 150_00);
  });

  test('identificador fiscal divergente derruba o score sem eliminar o par', () => {
    // Limiar zerado de propósito: aqui se compara SCORE, não se testa corte.
    // Com o limiar de 0.6 do tenant de exemplo, o par divergente já seria
    // eliminado — o que é correto, mas esconderia o que este teste mede.
    const permissivo: MatchingSettings = { ...SETTINGS, minScore: 0 };
    const iguais = scorePair(
      line({ id: 'l1', counterpartyTaxId: '111' }),
      payable({ id: 'p1', supplierTaxId: '111' }),
      permissivo,
    );
    const diferentes = scorePair(
      line({ id: 'l1', counterpartyTaxId: '111' }),
      payable({ id: 'p1', supplierTaxId: '999' }),
      permissivo,
    );
    assert.ok(iguais);
    assert.ok(diferentes);
    assert.ok(
      diferentes.score < iguais.score,
      'documento diferente tem que valer menos que documento igual',
    );
    assert.ok(!diferentes.strategy.includes('tax-id'));
  });

  test('ausência de documento não conta contra — só não conta a favor', () => {
    const semDoc = scorePair(line({ id: 'l1' }), payable({ id: 'p1' }), SETTINGS);
    assert.ok(semDoc, 'par sem documento nos dois lados continua candidato');
    assert.ok(!semDoc.strategy.includes('tax-id'));
  });

  test('referência curta demais é ignorada — não casa por acaso', () => {
    const r = scorePair(
      line({ id: 'l1', description: 'transferencia 12' }),
      payable({ id: 'p1', externalRef: '12' }),
      SETTINGS,
    );
    assert.ok(r);
    assert.ok(
      !r.strategy.includes('reference'),
      'referência com menos de 4 caracteres não pode virar sinal',
    );
  });

  test('score abaixo do mínimo do tenant não vira sugestão', () => {
    const exigente: MatchingSettings = { ...SETTINGS, minScore: 0.99 };
    const r = scorePair(
      line({ id: 'l1', postedAt: '2026-07-14', counterpartyTaxId: '111' }),
      payable({ id: 'p1', dueDate: '2026-07-10', supplierTaxId: '999' }),
      exigente,
    );
    assert.equal(r, null);
  });

  test('baixa parcial casa o menor dos dois lados', () => {
    const r = scorePair(
      line({ id: 'l1', amountCents: -100_00 }),
      payable({ id: 'p1', amountCents: 150_00, settledAmountCents: 50_00 }),
      SETTINGS,
    );
    assert.ok(r);
    assert.equal(r.matchedAmountCents, 100_00, 'saldo devedor era R$100, a linha era R$100');
  });
});

describe('a política é do tenant, não do código', () => {
  test('o mesmo par muda de resultado quando as settings mudam', () => {
    const par = [
      line({
        id: 'l1',
        amountCents: -150_50,
        postedAt: '2026-07-13',
        description: 'PAGTO NF-1001',
      }),
      payable({ id: 'p1', amountCents: 150_00, dueDate: '2026-07-10', externalRef: 'NF-1001' }),
    ] as const;

    const frouxo = scorePair(par[0], par[1], {
      amountToleranceCents: 100,
      dateToleranceDays: 10,
      minScore: 0.5,
    });
    const apertado = scorePair(par[0], par[1], {
      amountToleranceCents: 0,
      dateToleranceDays: 0,
      minScore: 0.5,
    });

    assert.ok(frouxo, 'tenant tolerante aceita R$0,50 de diferença');
    assert.equal(apertado, null, 'tenant que exige centavo exato rejeita o mesmo par');
  });
});

describe('suggestMatches — atribuição', () => {
  test('cada linha e cada título são usados no máximo uma vez', () => {
    const lines = [
      line({ id: 'l1', counterpartyTaxId: '111' }),
      line({ id: 'l2', counterpartyTaxId: '111' }),
    ];
    const payables = [
      payable({ id: 'p1', externalRef: 'NF-1001', supplierTaxId: '111' }),
      payable({ id: 'p2', externalRef: 'NF-1002', supplierTaxId: '111' }),
    ];

    const out = suggestMatches(lines, payables, SETTINGS);
    assert.equal(out.length, 2);
    assert.equal(new Set(out.map((s) => s.statementLineId)).size, 2);
    assert.equal(new Set(out.map((s) => s.payableId)).size, 2);
  });

  test('o melhor par ganha o título disputado', () => {
    const lines = [
      line({ id: 'l1', description: 'pagamento diverso' }),
      line({ id: 'l2', description: 'PAGTO NF-1001' }),
    ];
    const payables = [payable({ id: 'p1', externalRef: 'NF-1001' })];

    const out = suggestMatches(lines, payables, SETTINGS);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.statementLineId, 'l2', 'a linha que cita a nota tem que vencer');
  });

  test('linhas e títulos já fechados são ignorados', () => {
    const out = suggestMatches(
      [line({ id: 'l1', status: 'matched' }), line({ id: 'l2', status: 'ignored' })],
      [payable({ id: 'p1' }), payable({ id: 'p2', status: 'settled' })],
      SETTINGS,
    );
    assert.deepEqual(out, []);
  });

  test('é determinístico — a ordem da entrada não muda a saída', () => {
    const lines = [
      line({ id: 'l1', counterpartyTaxId: '111' }),
      line({ id: 'l2', counterpartyTaxId: '111' }),
      line({ id: 'l3', counterpartyTaxId: '111' }),
    ];
    const payables = [
      payable({ id: 'p1', externalRef: 'NF-1001', supplierTaxId: '111' }),
      payable({ id: 'p2', externalRef: 'NF-1002', supplierTaxId: '111' }),
      payable({ id: 'p3', externalRef: 'NF-1003', supplierTaxId: '111' }),
    ];

    const direto = suggestMatches(lines, payables, SETTINGS);
    const invertido = suggestMatches([...lines].reverse(), [...payables].reverse(), SETTINGS);
    assert.deepEqual(
      [...direto].sort((a, b) => a.statementLineId.localeCompare(b.statementLineId)),
      [...invertido].sort((a, b) => a.statementLineId.localeCompare(b.statementLineId)),
    );
  });

  test('sem candidato, devolve lista vazia — nunca inventa casamento', () => {
    const out = suggestMatches(
      [line({ id: 'l1', amountCents: -999_00 })],
      [payable({ id: 'p1', amountCents: 10_00 })],
      SETTINGS,
    );
    assert.deepEqual(out, []);
  });
});

describe('unmatchedLines — a divergência', () => {
  test('devolve o que sobrou, que é o que interessa ao humano', () => {
    const lines = [
      line({ id: 'l1', description: 'PAGTO NF-1001' }),
      line({ id: 'l2', amountCents: -777_00, description: 'debito nao identificado' }),
    ];
    const payables = [payable({ id: 'p1', externalRef: 'NF-1001' })];

    const sug = suggestMatches(lines, payables, SETTINGS);
    const sobra = unmatchedLines(lines, sug);

    assert.equal(sobra.length, 1);
    assert.equal(sobra[0]?.id, 'l2');
  });
});

describe('o manifesto obedece ao contrato do Core', () => {
  test('declara o Domain finance da Taxonomia', () => {
    assert.equal(MANIFEST.taxonomy.layer, 'domain');
    assert.equal(MANIFEST.taxonomy.domain, 'finance');
  });

  test('toda permissão usa o prefixo do módulo', () => {
    for (const p of MANIFEST.permissions) {
      assert.equal(p.moduleId, MANIFEST.id);
      assert.ok(
        p.key.startsWith(`${MANIFEST.id}.`),
        `permissão ${p.key} sem o prefixo do módulo não pode ser revogada em bloco`,
      );
      assert.equal(p.key.split('.').length, 3, 'permissão é <módulo>.<recurso>.<ação>');
    }
  });

  test('todo evento emitido usa o prefixo do módulo e verbo no passado', () => {
    for (const e of MANIFEST.events.emits) {
      assert.ok(e.type.startsWith(`${MANIFEST.id}.`));
      assert.equal(e.type.split('.').length, 3);
      assert.equal(e.version, 1);
    }
  });

  test('não declara consumo sem consumidor construído (Lei 7)', () => {
    assert.deepEqual(MANIFEST.events.consumes, []);
  });

  test('não existe dependência de outro módulo — só do Core', () => {
    assert.ok(MANIFEST.requiresCore);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(MANIFEST, 'dependsOn'),
      'módulo não depende de módulo — a comunicação passa pelo Core',
    );
  });
});
