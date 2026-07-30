import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeLeads, validateNewLead } from './leads.ts';
import type { Lead } from './types.ts';

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    name: 'Interessado',
    contact: '',
    source: '',
    interest: '',
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

describe('validateNewLead', () => {
  test('o mínimo honesto: o nome — a fila não faz interrogatório', () => {
    const r = validateNewLead({ name: 'Interessado do stand' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'new');
      assert.equal(r.value.partyId, null);
    }
  });

  test('⛔ sem nome não há interesse manifestado', () => {
    const r = validateNewLead({ source: 'instagram' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('origem, interesse e contato são texto livre — e opcionais', () => {
    const r = validateNewLead({
      name: 'X',
      source: 'indicação da dona Maria',
      interest: 'reforma do telhado',
      contact: '(62) 9 9999-0000',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.source, 'indicação da dona Maria');
  });
});

describe('summarizeLeads', () => {
  test('conta a fila sem inventar número', () => {
    const r = summarizeLeads([
      lead(),
      lead({ id: 'l2', status: 'in_contact' }),
      lead({ id: 'l3', status: 'qualified', decidedAt: 'x' }),
      lead({ id: 'l4', status: 'discarded', decidedAt: 'x', discardReason: 'y' }),
    ]);
    assert.deepEqual(r, { total: 4, waiting: 1, inContact: 1, qualified: 1, discarded: 1 });
  });
});
