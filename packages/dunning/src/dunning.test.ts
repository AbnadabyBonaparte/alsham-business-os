import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  isInQueue,
  daysOverdue,
  dueSteps,
  nextStep,
  positionOf,
  validateRulerSteps,
  outstandingCentsOf,
  summarizeQueue,
} from './dunning.ts';
import type { DunTitle, RulerStep, StepExecution } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0027_dun.sql');

const HOJE = '2026-07-29';

/** A régua do enunciado: aviso, ligação, carta. */
const REGUA: readonly RulerStep[] = [
  { id: 's0', rulerId: 'r', position: 0, name: '1º aviso', daysAfterDue: 1, channel: 'e-mail' },
  { id: 's1', rulerId: 'r', position: 1, name: 'ligação', daysAfterDue: 7, channel: 'telefone' },
  { id: 's2', rulerId: 'r', position: 2, name: 'carta registrada', daysAfterDue: 20, channel: 'correio' },
];

function titulo(over: Partial<DunTitle> = {}): DunTitle {
  return {
    id: 't1',
    tenantId: 'tn',
    sourceModuleId: 'origem',
    externalRef: 'DOC-1',
    dueDate: '2026-07-19',
    amountCents: 100000,
    receivedAmountCents: 0,
    currency: 'BRL',
    payerName: 'Devedor Um',
    counterpartyTaxId: null,
    description: '',
    status: 'open',
    enteredAt: '2026-07-20T00:00:00Z',
    leftAt: null,
    ...over,
  };
}

function exec(over: Partial<StepExecution> = {}): StepExecution {
  return {
    id: 'e1',
    titleId: 't1',
    stepId: 's0',
    stepName: '1º aviso',
    channel: 'e-mail',
    daysAfterDue: 1,
    note: '',
    executedAt: '2026-07-21T10:00:00Z',
    ...over,
  };
}

describe('quem está na régua', () => {
  test('vencido e em aberto está; pago, cancelado e no prazo não', () => {
    assert.equal(isInQueue(titulo(), HOJE), true);
    assert.equal(isInQueue(titulo({ status: 'partially_received' }), HOJE), true);
    assert.equal(isInQueue(titulo({ status: 'received' }), HOJE), false);
    assert.equal(isInQueue(titulo({ status: 'cancelled' }), HOJE), false);
    assert.equal(isInQueue(titulo({ dueDate: '2026-08-01' }), HOJE), false);
    assert.equal(isInQueue(titulo({ dueDate: HOJE }), HOJE), false, 'vence HOJE ainda não venceu');
  });

  test('daysOverdue conta o calendário — e nunca inventa atraso', () => {
    assert.equal(daysOverdue(titulo({ dueDate: '2026-07-19' }), HOJE), 10);
    assert.equal(daysOverdue(titulo({ dueDate: '2026-08-01' }), HOJE), 0);
  });
});

describe('⭐ o próximo passo — o que a régua diz para fazer', () => {
  test('com 10 dias de atraso, os passos de 1 e 7 dias estão devidos', () => {
    assert.deepEqual(dueSteps(REGUA, 10).map((s) => s.name), ['1º aviso', 'ligação']);
  });

  test('o próximo é o primeiro devido AINDA NÃO executado', () => {
    assert.equal(nextStep(titulo(), REGUA, [], HOJE)?.name, '1º aviso');
    assert.equal(nextStep(titulo(), REGUA, [exec()], HOJE)?.name, 'ligação');
  });

  test('tudo devido já feito: null — a régua acabou, o resto é decisão fora dela', () => {
    const feitos = [exec(), exec({ id: 'e2', stepId: 's1', stepName: 'ligação' })];
    assert.equal(nextStep(titulo(), REGUA, feitos, HOJE), null);
  });

  test('⛔ título fora da régua não tem próximo passo — nem com atraso antigo', () => {
    assert.equal(nextStep(titulo({ status: 'received' }), REGUA, [], HOJE), null);
  });

  test('a posição é o último passo executado, pelo carimbo', () => {
    const feitos = [exec(), exec({ id: 'e2', stepId: 's1', stepName: 'ligação', executedAt: '2026-07-27T09:00:00Z' })];
    assert.equal(positionOf(titulo(), feitos)?.stepName, 'ligação');
    assert.equal(positionOf(titulo(), []), null);
  });
});

describe('⭐ o desenho da régua', () => {
  test('régua sem passo não existe; nomes e posições não repetem', () => {
    assert.match(validateRulerSteps([]) ?? '', /pelo menos um/);
    assert.match(
      validateRulerSteps([
        { name: 'aviso', position: 0, daysAfterDue: 1 },
        { name: 'Aviso', position: 1, daysAfterDue: 5 },
      ]) ?? '',
      /mesmo nome/,
    );
  });

  test('⭐ os dias não diminuem ao longo da régua — o calendário manda', () => {
    assert.match(
      validateRulerSteps([
        { name: '2º aviso', position: 0, daysAfterDue: 15 },
        { name: '3º aviso', position: 1, daysAfterDue: 5 },
      ]) ?? '',
      /não podem diminuir/,
    );
    assert.equal(
      validateRulerSteps([
        { name: 'aviso', position: 0, daysAfterDue: 1, channel: 'e-mail' },
        { name: 'ligação', position: 1, daysAfterDue: 7, channel: 'telefone' },
        { name: 'no mesmo dia', position: 2, daysAfterDue: 7, channel: 'visita' },
      ]),
      null,
      'dias IGUAIS em passos seguidos são desenho válido',
    );
  });

  test('o canal é texto livre e opcional', () => {
    assert.equal(
      validateRulerSteps([{ name: 'visita', position: 0, daysAfterDue: 30 }]),
      null,
    );
  });
});

describe('saldo e resumo', () => {
  test('o saldo em aberto nunca é negativo na tela — receber a maior existe', () => {
    assert.equal(outstandingCentsOf(titulo({ receivedAmountCents: 30000 })), 70000);
    assert.equal(outstandingCentsOf(titulo({ receivedAmountCents: 120000 })), 0);
  });

  test('o resumo conta a fila e soma o que falta, por moeda', () => {
    const r = summarizeQueue(
      [
        titulo({ id: 'a', externalRef: 'A' }),
        titulo({ id: 'b', externalRef: 'B', receivedAmountCents: 40000 }),
        titulo({ id: 'c', externalRef: 'C', status: 'received', leftAt: '2026-07-25T00:00:00Z' }),
        titulo({ id: 'd', externalRef: 'D', dueDate: '2026-09-01' }),
      ],
      HOJE,
    );
    assert.equal(r.inQueue, 2);
    assert.equal(r.leftBehind, 1);
    assert.equal(r.outstandingCentsByCurrency.get('BRL'), 160000);
  });
});

/**
 * ⭐ O ESPELHO SQL ↔ TypeScript deste módulo não é de transições (o estado
 * do título é do PRODUTOR) — é a LISTA DE ESTADOS da projeção: se o schema
 * aprender um estado que o tipo não conhece, ou vice-versa, este teste
 * reprova.
 */
describe('⭐ a lista de estados é a MESMA nos dois lados', () => {
  test('o check da migration e o tipo TitleStatus dizem a mesma coisa', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const semComentario = sql.replace(/--[^\n]*/g, '');
    const bloco = semComentario.split('create table dun.titles')[1]?.split(';')[0] ?? '';
    const m = bloco.match(/status in \(([^)]*)\)/);
    assert.ok(m, 'o check de status sumiu de dun.titles');
    const doSql = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    const doTs = ['open', 'partially_received', 'received', 'cancelled'].sort();
    assert.deepEqual(doSql, doTs);
  });

  test('⭐ e a projeção não tem porta de escrita para o cliente', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /grant select on dun\.titles to authenticated/);
    assert.doesNotMatch(sql, /grant[^;]*insert[^;]*on dun\.titles/i);
    assert.doesNotMatch(sql, /create policy titles_(insert|update|delete)/);
  });
});
