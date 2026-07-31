import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  ALL_STATUSES,
  canTransition,
  nextStatuses,
  canComplete,
  canCancel,
  orderAudits,
  summarizeAudits,
} from './audits.ts';
import type { Audit } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0079_audit.sql');
const MIGRATION_PROJ = resolve(HERE, '../../../supabase/migrations/0068_proj.sql');

function audit(over: Partial<Audit> = {}): Audit {
  return {
    id: 'a1',
    auditType: 'Interna',
    scope: 'Processo de compras',
    scheduledFor: null,
    status: 'planned',
    cancelReason: '',
    outcomeNote: '',
    ...over,
  };
}

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

describe('o ciclo de vida da auditoria', () => {
  test('o caminho: planned → completed | cancelled', () => {
    assert.equal(canTransition('planned', 'completed'), true);
    assert.equal(canTransition('planned', 'cancelled'), true);
  });

  test('⭐ concluir e cancelar existem só da planejada', () => {
    assert.equal(canComplete('planned'), true);
    assert.equal(canComplete('completed'), false);
    assert.equal(canComplete('cancelled'), false);
    assert.equal(canCancel('planned'), true);
    assert.equal(canCancel('completed'), false);
    assert.equal(canCancel('cancelled'), false);
  });

  test('⭐ completed e cancelled são TERMINAIS — não sai transição de nenhum (física do proj)', () => {
    assert.deepEqual([...nextStatuses('completed')], []);
    assert.deepEqual([...nextStatuses('cancelled')], []);
    // e nenhuma transição parte de um fim
    for (const [de] of ALLOWED_TRANSITIONS) {
      assert.notEqual(de, 'completed', 'apareceu uma volta de completed — o fim é terminal');
      assert.notEqual(de, 'cancelled', 'apareceu uma volta de cancelled — o fim é terminal');
    }
  });

  test('⭐ a matriz N×N: canTransition concorda com a tabela (o mesmo estado é no-op)', () => {
    const permitidos = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    for (const de of ALL_STATUSES) {
      for (const para of ALL_STATUSES) {
        const esperado = de === para || permitidos.has(`${de}→${para}`);
        assert.equal(canTransition(de, para), esperado, `${de} → ${para}`);
      }
    }
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('planned')].sort(), ['cancelled', 'completed']);
  });

  test('a leitura ordena planejadas, concluídas, canceladas; dentro, por data', () => {
    const lista = [
      audit({ id: 'x', status: 'cancelled', cancelReason: 'r' }),
      audit({ id: 'b', status: 'planned', scheduledFor: '2027-02-01' }),
      audit({ id: 'a', status: 'planned', scheduledFor: '2027-01-01' }),
      audit({ id: 'c', status: 'completed' }),
    ];
    assert.deepEqual(orderAudits(lista).map((a) => a.id), ['a', 'b', 'c', 'x']);
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      audit({ status: 'planned' }),
      audit({ status: 'completed' }),
      audit({ status: 'cancelled', cancelReason: 'r' }),
      audit({ status: 'cancelled', cancelReason: 'r' }),
    ];
    assert.deepEqual(summarizeAudits(lista), { total: 4, planned: 1, completed: 1, cancelled: 2 });
    assert.deepEqual(summarizeAudits([]), { total: 0, planned: 0, completed: 0, cancelled: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('audit.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'audit.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
    assert.ok(doSql.has('planned→completed'));
    assert.ok(doSql.has('planned→cancelled'));
  });

  /**
   * ⭐ A física dos fins é a do `proj` (Módulo 53): os dois fins da auditoria
   * (completed/cancelled) são TERMINAIS e NÃO reabrem, exatamente como os do
   * `proj`. Este teste lê as duas migrations e prova que nenhuma volta parte de
   * um fim, dos dois lados.
   */
  test('⭐ nem a auditoria nem o proj reabrem de um fim — a mesma física', () => {
    const doAudit = paresDoSql(MIGRATION, 'audit.allowed_transition');
    for (const par of doAudit) {
      const [de] = par.split('→');
      assert.ok(
        !['completed', 'cancelled'].includes(de!),
        `a auditoria ganhou uma volta (${par}) — o encerrado é terminal`,
      );
    }

    const doProj = paresDoSql(MIGRATION_PROJ, 'proj.allowed_transition');
    for (const par of doProj) {
      const [de] = par.split('→');
      assert.ok(
        !['completed', 'cancelled'].includes(de!),
        `o projeto ganhou uma volta (${par}) — o encerrado é terminal`,
      );
    }
  });

  /**
   * ⭐ Os dois vínculos do achado são de NATUREZA diferente, de propósito: FK
   * COMPOSTA INTRA-schema à auditoria (peça do próprio módulo) e ID SOLTO ao nc
   * (cross-module, sem FK). Este teste lê a migration e confere a presença da FK
   * intra-schema à `audit.audits` e a AUSÊNCIA de FK cross-schema para o `nc`.
   */
  test('⭐⭐ o achado: FK intra-schema à auditoria; id solto ao nc (sem FK cross-schema)', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.match(
      sql,
      /foreign key\s*\(\s*audit_id\s*,\s*tenant_id\s*\)\s*references\s+audit\.audits/i,
      'a FK composta intra-schema à auditoria sumiu',
    );
    assert.doesNotMatch(
      sql,
      /nc_entry_id[^\n]*references\s+nc\./i,
      'apareceu FK cross-schema para o nc — o vínculo é ID SOLTO',
    );
  });
});
