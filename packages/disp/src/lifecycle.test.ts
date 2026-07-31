import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { orderDispatches, summarizeDispatches } from './disp.ts';
import type { Dispatch } from './types.ts';
import * as disp from './disp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0066_disp.sql');
const MIGRATION_RECV = resolve(HERE, '../../../supabase/migrations/0060_recv.sql');

function despacho(over: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'd1',
    dcCenterId: null,
    dcCenterName: '',
    destination: 'Destino',
    carrier: '',
    quantity: 1,
    dispatchedOn: '2026-07-31',
    note: '',
    ...over,
  };
}

describe('o despacho é ATO PONTUAL — sem ciclo de vida', () => {
  test('⭐ o motor NÃO exporta transição de estado (a ausência é a lei)', () => {
    // Um ato pontual não tem ciclo: nada de canTransition/ALLOWED_TRANSITIONS.
    assert.equal((disp as Record<string, unknown>)['canTransition'], undefined);
    assert.equal((disp as Record<string, unknown>)['ALLOWED_TRANSITIONS'], undefined);
    assert.equal((disp as Record<string, unknown>)['nextStatuses'], undefined);
  });

  test('⭐ a migration do disp NÃO declara allowed_transition, mas TEM o gatilho de imutabilidade', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+disp\.allowed_transition/i);
    // Nem coluna de status.
    assert.doesNotMatch(sql, /status\s+text/i);
    // A imutabilidade é gatilho before update or delete que RAISE.
    assert.match(sql, /before\s+update\s+or\s+delete\s+on\s+disp\.dispatches/i);
    assert.match(sql, /guard_dispatch_immutable/);
    assert.match(sql, /fato consumado/);
  });

  test('⭐ SEM policy/grant de update ou delete — o cliente não tem porta de reescrita', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    // A única concessão sobre a tabela é select, insert.
    assert.match(sql, /grant\s+select,\s*insert\s+on\s+disp\.dispatches\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+update\s+on\s+disp\.dispatches/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+delete\s+on\s+disp\.dispatches/i);
  });
});

describe('⭐⭐ o espelho disp × recv: a saída e a chegada, a MESMA física do ato imutável', () => {
  test('as DUAS migrations são atos pontuais imutáveis — nem status, nem allowed_transition, nem updated_at', () => {
    const desp = readFileSync(MIGRATION, 'utf8');
    const receb = readFileSync(MIGRATION_RECV, 'utf8');
    for (const [nome, sql] of [['disp', desp], ['recv', receb]] as const) {
      // Sobre o CÓDIGO (sem comentários), o que não existe é a ausência da lei.
      const code = sql.replace(/--[^\n]*/g, '');
      assert.doesNotMatch(code, /status\s+text/i, `${nome} não pode ter coluna de status`);
      assert.doesNotMatch(code, /allowed_transition/i, `${nome} não pode declarar allowed_transition`);
      assert.doesNotMatch(code, /updated_at/i, `${nome} não pode ter updated_at`);
      // Os dois têm o gatilho de imutabilidade que recusa até o dono do banco.
      assert.match(sql, /before\s+update\s+or\s+delete/i, `${nome} precisa do gatilho de imutabilidade`);
      assert.match(sql, /fato consumado/, `${nome} recusa a reescrita com "fato consumado"`);
      // Os dois concedem SÓ select, insert — nada de update/delete.
      assert.match(sql, /grant\s+select,\s*insert\s+on/i, `${nome} só concede select, insert`);
    }
  });

  test('⭐ o sentido é INVERTIDO: o recv é a CHEGADA (received), o disp é a SAÍDA (dispatched)', () => {
    const desp = readFileSync(MIGRATION, 'utf8');
    const receb = readFileSync(MIGRATION_RECV, 'utf8');
    // A chegada carimba received_at/received_by; a saída carimba dispatched_at/dispatched_by.
    assert.match(receb, /received_at\s+timestamptz/i);
    assert.match(desp, /dispatched_at\s+timestamptz/i);
    assert.doesNotMatch(desp, /received_at/i, 'o disp não fala em recebimento — é a saída');
    assert.doesNotMatch(receb, /dispatched_at/i, 'o recv não fala em despacho — é a chegada');
  });
});

describe('⭐ o vínculo com o centro é ID SOLTO — sem FK cruzada (Lei do Lego)', () => {
  test('a migration não cria FK ao módulo de centros de distribuição', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    // dc_center_id existe como uuid solto...
    assert.match(sql, /dc_center_id\s+uuid/i);
    // ...e a quantidade tem CHECK > 0.
    assert.match(sql, /quantity\s+numeric\(18,\s*4\)\s+not null\s+check\s*\(\s*quantity\s*>\s*0\s*\)/i);
    // 🔴 e o schema NÃO referencia o schema de centros de distribuição (guarda SCHEMA_DE do CI).
    assert.doesNotMatch(sql, /dc\./i, 'a migration não pode referenciar o schema de centros (id solto)');
  });
});

describe('a leitura do livro', () => {
  test('orderDispatches: do mais recente ao mais antigo', () => {
    const lista = [
      despacho({ id: 'a', dispatchedOn: '2026-07-10' }),
      despacho({ id: 'b', dispatchedOn: '2026-07-31' }),
      despacho({ id: 'c', dispatchedOn: '2026-07-20' }),
    ];
    assert.deepEqual(
      orderDispatches(lista).map((d) => d.id),
      ['b', 'c', 'a'],
    );
  });

  test('summarizeDispatches conta linhas e soma quantidades', () => {
    const lista = [
      despacho({ quantity: 3 }),
      despacho({ quantity: 2.5 }),
      despacho({ quantity: 10 }),
    ];
    assert.deepEqual(summarizeDispatches(lista), { total: 3, totalQuantity: 15.5 });
    assert.deepEqual(summarizeDispatches([]), { total: 0, totalQuantity: 0 });
  });
});
