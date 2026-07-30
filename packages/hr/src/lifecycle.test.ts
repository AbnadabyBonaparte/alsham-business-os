import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canEditEmployee,
  canTerminate,
  canTransition,
  isTerminal,
  orderRoster,
  whyCannotTerminate,
} from './hr.ts';
import type { Employee } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0048_hr.sql');
const MIGRATION_CRM = resolve(HERE, '../../../supabase/migrations/0009_crm.sql');

function colaborador(over: Partial<Employee> = {}): Employee {
  return {
    id: 'e1',
    fullName: 'Ana Vendedora',
    roleTitle: 'Vendedora',
    department: 'Comercial',
    hiredOn: '2026-01-06',
    status: 'active',
    terminationReason: '',
    previousEmployeeId: null,
    ...over,
  };
}

describe('⭐ o ciclo — o afastamento volta, o desligamento não', () => {
  test('⭐ on_leave ↔ active; terminated é terminal', () => {
    assert.equal(canTransition('active', 'on_leave'), true);
    assert.equal(canTransition('on_leave', 'active'), true);
    assert.equal(canTransition('active', 'terminated'), true);
    assert.equal(canTransition('on_leave', 'terminated'), true);
    assert.equal(canTransition('terminated', 'active'), false);
    assert.equal(isTerminal('terminated'), true);
    assert.equal(isTerminal('on_leave'), false);
    assert.equal(canTerminate('terminated'), false);
    assert.equal(canEditEmployee('terminated'), false);
    assert.equal(canEditEmployee('on_leave'), true);
  });

  test('desligar exige a razão escrita', () => {
    assert.match(whyCannotTerminate(colaborador(), '')!, /razão/);
    assert.equal(whyCannotTerminate(colaborador(), 'pediu demissão'), null);
    assert.match(whyCannotTerminate(colaborador({ status: 'terminated' }), 'x')!, /admissão nova/);
  });

  test('o roster lê ativos/afastados primeiro; desligados por último', () => {
    const ordenado = orderRoster([
      colaborador({ id: 'c', status: 'terminated', terminationReason: 'saiu', fullName: ' Average' }),
      colaborador({ id: 'b', status: 'on_leave', fullName: 'Bruno' }),
      colaborador({ id: 'a', status: 'active', fullName: 'Ana' }),
    ]);
    assert.deepEqual(ordenado.map((e) => e.id), ['a', 'b', 'c']);
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

  test('hr.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'hr.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, ALLOWED_TRANSITIONS.length, 'o SQL e o TS têm o mesmo número de pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE consciente do crm: lá `archived → active` EXISTE (a
   * contraparte que volta é a MESMA pessoa); aqui `terminated` é TERMINAL (o
   * ex-colaborador que retorna assina contrato novo — admissão nova). Se um
   * dos lados mudar, este teste obriga a re-perguntar.
   */
  test('⭐ o contraste crm×hr: no crm o arquivado volta; no hr o desligado não', () => {
    const crm = readFileSync(MIGRATION_CRM, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(crm, /'archived'\s*,\s*'active'/, 'o crm deixou de reativar o arquivado — re-pergunte o contraste');
    const hr = readFileSync(MIGRATION, 'utf8');
    const corpo = hr.split('hr.allowed_transition')[1]?.split('$$;')[0]?.replace(/--[^\n]*/g, '') ?? '';
    assert.doesNotMatch(corpo, /\(\s*'terminated'\s*,/, 'apareceu volta do terminated — o desligado que retorna é admissão nova');
  });
});
