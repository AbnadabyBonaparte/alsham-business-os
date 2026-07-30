import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeTickets, validateInteraction, validateNewTicket } from './care.ts';
import type { Ticket } from './types.ts';

function caso(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    subject: 'Dúvida sobre fatura',
    description: '',
    requesterName: 'Solicitante Demo',
    requesterContact: null,
    partyId: null,
    categoryId: null,
    priorityId: null,
    assigneeUserId: null,
    dueAt: null,
    status: 'open',
    resolvedAt: null,
    resolutionNote: '',
    ...over,
  };
}

describe('validateNewTicket', () => {
  test('o mínimo honesto: assunto e solicitante', () => {
    const r = validateNewTicket({ subject: 'Troca de produto', requesterName: 'Maria' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.dueAt, null);
    }
  });

  test('⛔ sem solicitante não há caso — um caso responde a alguém', () => {
    const r = validateNewTicket({ subject: 'X' });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.problems.some((p) => p.field === 'requesterName'));
    }
  });

  test('⛔ sem assunto não há caso', () => {
    const r = validateNewTicket({ requesterName: 'João' });
    assert.equal(r.ok, false);
  });

  test('prazo inválido é recusado; prazo vazio é honesto', () => {
    assert.equal(
      validateNewTicket({ subject: 'X', requesterName: 'A', dueAt: 'não é data' }).ok,
      false,
    );
    assert.equal(validateNewTicket({ subject: 'X', requesterName: 'A' }).ok, true);
  });

  test('contato é texto livre — qualquer instrumento passa', () => {
    for (const contato of ['(62) 99999-0000', 'maria@exemplo.com', 'balcão da loja 12']) {
      const r = validateNewTicket({ subject: 'X', requesterName: 'A', requesterContact: contato });
      assert.equal(r.ok, true);
      if (r.ok) assert.equal(r.value.requesterContact, contato);
    }
  });
});

describe('validateInteraction e o resumo', () => {
  test('interação vazia é recusada', () => {
    assert.equal(validateInteraction('   ').ok, false);
    assert.equal(validateInteraction('cliente confirmou o recebimento').ok, true);
  });

  test('o resumo conta vivos, atrasados e resolvidos', () => {
    const AGORA = '2026-07-30T12:00:00Z';
    const s = summarizeTickets(
      [
        caso(),
        caso({ id: 't2', status: 'in_progress', dueAt: '2026-07-01T00:00:00Z' }),
        caso({ id: 't3', status: 'resolved', resolvedAt: AGORA }),
        caso({ id: 't4', status: 'closed', resolvedAt: AGORA }),
      ],
      AGORA,
    );
    assert.deepEqual(s, { total: 4, openish: 2, overdue: 1, resolved: 1 });
  });
});
