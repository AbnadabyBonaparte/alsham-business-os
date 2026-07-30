import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  canActivate,
  canCancel,
  canEditTerms,
  canEnd,
  canTerminate,
  canAdjust,
  canRenew,
  whyCannotTerminate,
} from './contract.ts';
import type { Contract, ContractStatus, Renewal } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0028_ctr.sql');
const MIGRATION_QUOTE = resolve(HERE, '../../../supabase/migrations/0024_quote.sql');

const TODOS: readonly ContractStatus[] = ['draft', 'active', 'ended', 'terminated', 'cancelled'];

function contrato(over: Partial<Contract> = {}): Contract {
  return {
    externalRef: 'CTR-2026-001',
    title: 'Prestação de serviços contínuos',
    description: '',
    contractType: null,
    counterpartyName: 'Contraparte Demo',
    counterpartyTaxId: null,
    partyId: null,
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
    valueCents: 500_000,
    currency: 'BRL',
    status: 'active',
    outcomeReason: '',
    decidedAt: null,
    ...over,
  };
}

function renovacao(over: Partial<Renewal> = {}): Renewal {
  return {
    id: 'ren-1',
    contractId: 'ctr-1',
    previousEndsOn: '2026-12-31',
    newEndsOn: '2027-12-31',
    note: '',
    renewedAt: '2026-12-01T12:00:00Z',
    ...over,
  };
}

describe('o ciclo de vida do contrato', () => {
  /**
   * ⭐ **Os três fins são TERMINAIS.** O contrato que continua é RENOVAÇÃO —
   * ato no mesmo documento; o que recomeça é documento novo.
   */
  test('⭐ ended, terminated e cancelled não saem de lá', () => {
    for (const fim of ['ended', 'terminated', 'cancelled'] as const) {
      for (const destino of TODOS.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
  });

  test('o caminho feliz: draft → active → ended', () => {
    assert.equal(canTransition('draft', 'active'), true);
    assert.equal(canTransition('active', 'ended'), true);
  });

  test('⛔ rascunho não acaba nem se rescinde: só o que está em vigor tem desfecho', () => {
    assert.equal(canTransition('draft', 'ended'), false);
    assert.equal(canTransition('draft', 'terminated'), false);
  });

  test('⛔ contrato em vigor não se cancela: cancelar é do rascunho — em vigor, rescinde-se', () => {
    assert.equal(canTransition('active', 'cancelled'), false);
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('draft')].sort(), ['active', 'cancelled']);
    assert.deepEqual([...nextStatuses('active')].sort(), ['ended', 'terminated']);
    assert.deepEqual([...nextStatuses('ended')], []);
  });
});

describe('⭐ entrar em vigor exige o essencial', () => {
  test('com contraparte e início, o rascunho entra em vigor', () => {
    assert.equal(canActivate(contrato({ status: 'draft' })), true);
  });

  test('⛔ sem contraparte não há com quem contratar', () => {
    assert.equal(canActivate(contrato({ status: 'draft', counterpartyName: null })), false);
  });

  test('⛔ sem início de vigência não há desde quando', () => {
    assert.equal(canActivate(contrato({ status: 'draft', startsOn: null })), false);
  });

  test('cancelar é do rascunho; editar termos também', () => {
    assert.equal(canCancel(contrato({ status: 'draft' })), true);
    assert.equal(canCancel(contrato({ status: 'active' })), false);
    assert.equal(canEditTerms('draft'), true);
    assert.equal(canEditTerms('active'), false);
  });
});

describe('⭐ encerrar é CALENDÁRIO; rescindir é DECISÃO com razão', () => {
  test('vigência vencida encerra; vigente não', () => {
    assert.equal(canEnd(contrato({ endsOn: '2026-07-01' }), [], '2026-07-30'), true);
    assert.equal(canEnd(contrato({ endsOn: '2026-08-01' }), [], '2026-07-30'), false);
  });

  test('⛔ contrato sem fim não se encerra por prazo — rescinde-se', () => {
    assert.equal(canEnd(contrato({ endsOn: null }), [], '2026-07-30'), false);
    assert.equal(canTerminate(contrato({ endsOn: null })), true);
  });

  test('⭐ a renovação ADIA o encerramento: o fim vigente é o da última renovação', () => {
    const c = contrato({ endsOn: '2026-07-01' });
    assert.equal(canEnd(c, [], '2026-07-30'), true);
    assert.equal(
      canEnd(c, [renovacao({ previousEndsOn: '2026-07-01', newEndsOn: '2027-07-01' })], '2026-07-30'),
      false,
    );
  });

  test('rescindir sem razão tem recusa com nome', () => {
    assert.equal(whyCannotTerminate(contrato(), ''),
      'Rescindir exige a razão: o livro existe para se aprender por que se rompe.');
    assert.equal(whyCannotTerminate(contrato(), 'inadimplência reiterada'), null);
    assert.notEqual(whyCannotTerminate(contrato({ status: 'draft' }), 'x'), null);
  });
});

describe('⭐ reajustar e renovar são atos de contrato EM VIGOR', () => {
  test('reajuste exige vigor E valor que exista', () => {
    assert.equal(canAdjust(contrato()), true);
    assert.equal(canAdjust(contrato({ status: 'draft' })), false);
    assert.equal(canAdjust(contrato({ valueCents: null, currency: null })), false);
  });

  test('renovar exige vigor E prazo a estender', () => {
    assert.equal(canRenew(contrato(), []), true);
    assert.equal(canRenew(contrato({ endsOn: null }), []), false);
    assert.equal(canRenew(contrato({ status: 'ended' }), []), false);
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

  test('ctr.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'ctr.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 4, 'o SQL declara quatro pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐⭐ O contraste com o `quote` é EXIGIDO: lá "renegociar é documento
   * novo" (nenhum ato muda uma proposta posta na mesa); aqui a RENOVAÇÃO
   * estende o MESMO contrato — porque a relação contratual é contínua e
   * obrigar documento novo partiria o livro de reajustes em dois. Se alguém
   * "uniformizar" qualquer lado, este teste reprova e obriga a decisão a
   * ser tomada de novo, por escrito.
   */
  test('⭐⭐ o quote NÃO renova e o ctr SIM — os dois de propósito', () => {
    const sqlQuote = readFileSync(MIGRATION_QUOTE, 'utf8').replace(/--[^\n]*/g, '');
    const sqlCtr = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

    assert.doesNotMatch(sqlQuote, /renew|renewal/i, 'o quote ganhou renovação — lá é documento novo');
    assert.match(sqlCtr, /create table ctr\.renewals/, 'a renovação do ctr sumiu');
    assert.match(sqlCtr, /ctr\.renew_contract/, 'o ato de renovar sumiu');
  });

  test('⭐ e os fins continuam sem volta TAMBÉM no SQL', () => {
    const doCtr = paresDoSql(MIGRATION, 'ctr.allowed_transition');
    for (const par of doCtr) {
      const [de] = par.split('→');
      assert.ok(
        !['ended', 'terminated', 'cancelled'].includes(de!),
        `o contrato ganhou uma volta (${par}) — o que recomeça é documento novo`,
      );
    }
  });
});
