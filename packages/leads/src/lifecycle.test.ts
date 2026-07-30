import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canDiscard,
  canEditLead,
  canQualify,
  canReturnToQueue,
  canTake,
  canTransition,
  countBySource,
  orderQueue,
  whyCannotDiscard,
  whyCannotQualify,
} from './leads.ts';
import type { Lead, LeadStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0037_lead.sql');
const MIGRATION_DEAL = resolve(HERE, '../../../supabase/migrations/0025_deal.sql');

const TODOS: readonly LeadStatus[] = ['new', 'in_contact', 'qualified', 'discarded'];

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    name: 'Interessado do stand',
    contact: '',
    source: 'stand da feira',
    interest: 'orçamento de reforma',
    assigneeUserId: null,
    status: 'new',
    decidedAt: null,
    discardReason: '',
    partyId: null,
    partyName: '',
    opportunityId: null,
    opportunityTitle: '',
    createdAt: '2026-07-30T09:00:00Z',
    ...over,
  };
}

describe('⭐ o ciclo — curto, com a volta à fila; desfechos terminais', () => {
  test('a fila anda: new → in_contact e a volta existe', () => {
    assert.equal(canTake('new'), true);
    assert.equal(canReturnToQueue('in_contact'), true);
  });

  test('o desfecho sai dos dois estados vivos', () => {
    assert.equal(canQualify('new'), true);
    assert.equal(canQualify('in_contact'), true);
    assert.equal(canDiscard('new'), true);
    assert.equal(canDiscard('in_contact'), true);
  });

  test('⭐ qualified e discarded são TERMINAIS: quem volta é lead novo', () => {
    for (const fim of ['qualified', 'discarded'] as const) {
      for (const destino of TODOS.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não existe`);
      }
    }
    assert.equal(canEditLead('qualified'), false);
    assert.equal(canEditLead('discarded'), false);
  });

  test('descartar exige a razão — a recusa tem nome', () => {
    assert.match(whyCannotDiscard(lead(), '')!, /razão/);
    assert.equal(whyCannotDiscard(lead(), 'procurava outro serviço'), null);
    assert.match(whyCannotDiscard(lead({ status: 'discarded', decidedAt: 'x', discardReason: 'y' }), 'z')!, /lead novo/);
    assert.equal(whyCannotQualify(lead()), null);
  });

  test('a fila na ordem de espera: quem chegou primeiro, primeiro', () => {
    const ordenada = orderQueue([
      lead({ id: 'hist', status: 'qualified', decidedAt: '2026-07-29T10:00:00Z' }),
      lead({ id: 'atendendo', status: 'in_contact', createdAt: '2026-07-30T08:00:00Z' }),
      lead({ id: 'novo-tarde', createdAt: '2026-07-30T11:00:00Z' }),
      lead({ id: 'novo-cedo', createdAt: '2026-07-30T07:00:00Z' }),
    ]);
    assert.deepEqual(ordenada.map((l) => l.id), ['novo-cedo', 'novo-tarde', 'atendendo', 'hist']);
  });

  test('as origens contadas — a leitura de funil que a fila existe para dar', () => {
    const mapa = countBySource([
      lead(),
      lead({ id: 'l2', source: 'instagram' }),
      lead({ id: 'l3', source: 'instagram' }),
      lead({ id: 'l4', source: '' }),
    ]);
    assert.equal(mapa.get('stand da feira'), 1);
    assert.equal(mapa.get('instagram'), 2);
    assert.equal(mapa.get('(sem origem)'), 1);
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

  test('lead.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'lead.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 6, 'o SQL declara seis pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O MANTIDO também se assina: a razão obrigatória do descarte vem do
   * deal.lost DE PROPÓSITO — perder sem porquê esconde o funil, na fila e
   * no mapa. Se o deal mudar, o lead re-pergunta em vez de herdar em
   * silêncio.
   */
  test('⭐ o contraste deal×lead: os dois exigem o porquê da perda', () => {
    const deal = readFileSync(MIGRATION_DEAL, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(
      deal,
      /new\.status = 'lost' and length\(btrim\(new\.outcome_reason\)\) = 0/,
      'o deal deixou de exigir a razão da perda — re-pergunte',
    );
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /length\(btrim\(new\.discard_reason\)\) = 0/, 'o lead deixou de exigir a razão do descarte');
  });

  /**
   * ⭐ O VÍNCULO É SOLTO: nenhuma FK para crm nem deal — id + nome
   * carimbado, pela tela. A guarda da matriz reprovaria a FK; este teste
   * morde antes.
   */
  test('⭐ o vínculo do qualificado é ID SOLTO — nunca FK cruzada', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(sql, /references\s+crm\./i);
    assert.doesNotMatch(sql, /references\s+deal\./i);
    assert.match(sql, /party_id\s+uuid,/);
    assert.match(sql, /party_name\s+text/);
    assert.doesNotMatch(sql, /create\s+type\s+lead\./i);
  });

  /** ⭐ O contato não passeia pelo correio — a prudência do vis, na fila. */
  test('⭐ o envelope leva nome, origem e interesse; o contato fica', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const payload = sql.split('create or replace function lead.lead_payload')[1]?.split('$$;')[0] ?? '';
    assert.ok(payload.includes("'source'"), 'a origem vai no envelope');
    assert.ok(!payload.includes('p.contact'), 'o contato NÃO vai no envelope');
  });
});
