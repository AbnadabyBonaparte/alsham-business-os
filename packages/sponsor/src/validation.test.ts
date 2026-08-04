import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, validateNewDeliverable, validateNewSponsorship } from './sponsor.ts';
import type { Sponsorship } from './types.ts';

function patrocinio(over: Partial<Sponsorship> = {}): Sponsorship {
  return {
    id: 's1',
    eventId: 'evt-1',
    eventRef: 'Congresso 2026',
    sponsorName: 'Marca Alfa',
    partyId: null,
    tier: 'ouro',
    amountCents: null,
    currency: null,
    contractId: null,
    contractRef: '',
    status: 'active',
    ...over,
  };
}

describe('validateNewSponsorship', () => {
  test('o mínimo honesto: evento (id solto) e patrocinador', () => {
    const r = validateNewSponsorship({ eventId: 'evt-1', sponsorName: 'Marca Alfa' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.eventId, 'evt-1');
      assert.equal(r.value.sponsorName, 'Marca Alfa');
      assert.equal(r.value.tier, '');
      assert.equal(r.value.amountCents, null);
      assert.equal(r.value.partyId, null);
      assert.equal(r.value.contractId, null);
    }
  });

  test('⛔ sem eventId ou sem sponsorName não registra', () => {
    assert.equal(validateNewSponsorship({ sponsorName: 'Marca Alfa' }).ok, false);
    assert.equal(validateNewSponsorship({ eventId: 'evt-1' }).ok, false);
    assert.equal(validateNewSponsorship({}).ok, false);
  });

  test('tier é TEXTO LIVRE opcional — o sistema não conhece "ouro/prata"', () => {
    const r = validateNewSponsorship({ eventId: 'evt-1', sponsorName: 'Marca Alfa', tier: 'naming rights' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.tier, 'naming rights');
  });

  test('a cota pode ser permuta: amountCents opcional; se vier, inteiro ≥ 0', () => {
    const permuta = validateNewSponsorship({ eventId: 'evt-1', sponsorName: 'M' });
    assert.equal(permuta.ok, true);
    if (permuta.ok) assert.equal(permuta.value.amountCents, null);

    const comValor = validateNewSponsorship({ eventId: 'evt-1', sponsorName: 'M', amountCents: 5000000, currency: 'BRL' });
    assert.equal(comValor.ok, true);
    if (comValor.ok) {
      assert.equal(comValor.value.amountCents, 5000000);
      assert.equal(comValor.value.currency, 'BRL');
    }

    assert.equal(validateNewSponsorship({ eventId: 'evt-1', sponsorName: 'M', amountCents: -1 }).ok, false);
    assert.equal(validateNewSponsorship({ eventId: 'evt-1', sponsorName: 'M', amountCents: 1.5 }).ok, false);
  });

  test('moeda, quando informada, precisa ter três letras maiúsculas', () => {
    assert.equal(
      validateNewSponsorship({ eventId: 'evt-1', sponsorName: 'M', amountCents: 100, currency: 'brl' }).ok,
      false,
    );
  });

  test('contractId/partyId carimbam vínculos SOLTOS opcionais', () => {
    const r = validateNewSponsorship({
      eventId: 'evt-1',
      sponsorName: 'Marca Alfa',
      partyId: 'party-9',
      contractId: 'ctr-42',
      contractRef: 'Contrato de patrocínio 042',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.partyId, 'party-9');
      assert.equal(r.value.contractId, 'ctr-42');
      assert.equal(r.value.contractRef, 'Contrato de patrocínio 042');
    }
  });
});

describe('validateNewDeliverable', () => {
  test('o mínimo honesto: patrocínio e descrição', () => {
    const r = validateNewDeliverable({ sponsorshipId: 's1', description: 'logo no palco' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.description, 'logo no palco');
      assert.equal(r.value.delivered, false);
      assert.equal(r.value.deliveredAt, null);
    }
  });

  test('⛔ sem patrocínio ou sem descrição não registra', () => {
    assert.equal(validateNewDeliverable({ description: 'logo' }).ok, false);
    assert.equal(validateNewDeliverable({ sponsorshipId: 's1' }).ok, false);
  });

  test('pode nascer já entregue', () => {
    const r = validateNewDeliverable({ sponsorshipId: 's1', description: 'brinde entregue', delivered: true });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.delivered, true);
  });
});

describe('summarize', () => {
  test('conta o mapa por estado sem inventar número', () => {
    const r = summarize([
      patrocinio({ status: 'active' }),
      patrocinio({ id: 's2', status: 'active' }),
      patrocinio({ id: 's3', status: 'archived' }),
    ]);
    assert.deepEqual(r, { total: 3, active: 2, archived: 1 });
  });
});
