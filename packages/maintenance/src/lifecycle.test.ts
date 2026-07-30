import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  buildPreventiveQueue,
  canCancel,
  canComplete,
  canReopen,
  canStart,
  canTransition,
  nextDueOn,
  nextStatuses,
  whyCannotComplete,
} from './maintenance.ts';
import type { MaintenanceOrder, OrderStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0032_mnt.sql');
const MIGRATION_OPS = resolve(HERE, '../../../supabase/migrations/0018_ops.sql');

const TODOS: readonly OrderStatus[] = ['open', 'in_progress', 'done', 'cancelled'];

function ordem(over: Partial<MaintenanceOrder> = {}): MaintenanceOrder {
  return {
    id: 'm1',
    title: 'Troca de filtro do ar-condicionado',
    description: '',
    kind: 'preventive',
    target: 'ar da sala 5',
    assetId: null,
    priorityId: null,
    assigneeUserId: null,
    recurrenceDays: 90,
    costCents: null,
    currency: null,
    status: 'done',
    completedAt: '2026-07-01T10:00:00Z',
    completionNote: 'filtro trocado',
    ...over,
  };
}

describe('⭐ o ciclo — o ops re-perguntado e MANTIDO', () => {
  test('⭐ done → in_progress EXISTE: a vistoria que reprova devolve o MESMO serviço', () => {
    assert.equal(canTransition('done', 'in_progress'), true);
    assert.equal(canReopen('done'), true);
  });

  test('⭐ cancelled é terminal: a falha nova é ordem nova', () => {
    for (const destino of TODOS.filter((s) => s !== 'cancelled')) {
      assert.equal(canTransition('cancelled', destino), false, `cancelled → ${destino} não existe`);
    }
  });

  test('open → done existe: o pequeno reparo se registra depois de feito', () => {
    assert.equal(canTransition('open', 'done'), true);
  });

  test('a bancada anda nos dois sentidos', () => {
    assert.equal(canStart('open'), true);
    assert.equal(canTransition('in_progress', 'open'), true);
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('done')].sort(), ['in_progress']);
    assert.deepEqual([...nextStatuses('cancelled')], []);
    assert.equal(canCancel('in_progress'), true);
    assert.equal(canComplete('done'), false);
  });

  test('⭐ concluir exige o relato — a recusa tem nome', () => {
    const aberta = ordem({ status: 'in_progress', completedAt: null, completionNote: '' });
    assert.match(whyCannotComplete(aberta, '')!, /relato/);
    assert.equal(whyCannotComplete(aberta, 'correia trocada e testada'), null);
  });
});

describe('⭐ a próxima devida é consequência calculada', () => {
  test('concluída + N dias; sem recorrência ou corretiva, não há próxima', () => {
    assert.equal(nextDueOn(ordem()), '2026-09-29');
    assert.equal(nextDueOn(ordem({ recurrenceDays: null })), null);
    assert.equal(nextDueOn(ordem({ kind: 'corrective', recurrenceDays: null })), null);
    assert.equal(nextDueOn(ordem({ status: 'in_progress', completedAt: null })), null);
  });

  test('⭐ a fila usa a conclusão MAIS RECENTE da rotina (título+alvo)', () => {
    const fila = buildPreventiveQueue(
      [
        ordem({ id: 'antiga', completedAt: '2026-01-01T00:00:00Z' }),
        ordem({ id: 'recente', completedAt: '2026-07-01T00:00:00Z' }),
      ],
      '2026-10-15',
      30,
    );
    assert.equal(fila.length, 1);
    assert.equal(fila[0]!.order.id, 'recente');
    assert.equal(fila[0]!.daysUntilDue < 0, true);
  });

  test('⭐ rotina com ordem ABERTA não cobra de novo — cobrar em dobro é engano', () => {
    const fila = buildPreventiveQueue(
      [
        ordem({ id: 'feita', completedAt: '2026-01-01T00:00:00Z' }),
        ordem({ id: 'ja-aberta', status: 'open', completedAt: null, completionNote: '' }),
      ],
      '2026-10-15',
      30,
    );
    assert.deepEqual(fila, []);
  });

  test('a janela recorta o futuro; a atrasada sempre entra primeiro', () => {
    const fila = buildPreventiveQueue(
      [
        ordem({ id: 'a', title: 'rotina A', completedAt: '2026-05-01T00:00:00Z', recurrenceDays: 30 }),
        ordem({ id: 'b', title: 'rotina B', completedAt: '2026-07-20T00:00:00Z', recurrenceDays: 90 }),
      ],
      '2026-07-30',
      30,
    );
    assert.deepEqual(fila.map((f) => f.order.id), ['a']);
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

  test('mnt.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'mnt.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 7, 'o SQL declara sete pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O MANTIDO também se escreve: o mnt copia o `done → in_progress` do
   * ops DE PROPÓSITO (manutenção é trabalho), e este teste é a assinatura
   * da decisão — se o ops mudar, a manutenção re-pergunta em vez de herdar
   * em silêncio.
   */
  test('⭐ ops e mnt reabrem o concluído — os dois de propósito', () => {
    const doOps = paresDoSql(MIGRATION_OPS, 'ops.allowed_transition');
    const doMnt = paresDoSql(MIGRATION, 'mnt.allowed_transition');
    assert.equal(doOps.has('done→in_progress'), true, 'o ops deixou de reabrir');
    assert.equal(doMnt.has('done→in_progress'), true, 'o mnt deixou de reabrir');
    assert.equal(doMnt.has('cancelled→in_progress'), false, 'cancelada é terminal');
  });

  test('⭐ o tipo é CHECK argumentado — e a recorrência é só da preventiva', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /kind in \('corrective', 'preventive'\)/);
    assert.match(sql, /recurrence_days is null or \(kind = 'preventive' and recurrence_days > 0\)/);
    // E NÃO virou enum nem tabela — é física do domínio, argumentada no arquivo.
    assert.doesNotMatch(sql, /create\s+type\s+mnt\./i);
  });
});
