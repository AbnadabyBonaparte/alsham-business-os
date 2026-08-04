import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewBooking } from './booking.ts';

describe('validateNewBooking', () => {
  test('o mínimo honesto: cliente, serviço e horário', () => {
    const r = validateNewBooking({
      clientName: 'Cliente Alfa',
      service: 'corte',
      scheduledAt: '2026-08-10T14:00:00Z',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'scheduled');
      assert.equal(r.value.clientName, 'Cliente Alfa');
      assert.equal(r.value.service, 'corte');
      assert.equal(r.value.scheduledAt, '2026-08-10T14:00:00Z');
      assert.equal(r.value.clientId, null);
      assert.equal(r.value.professionalId, null);
      assert.equal(r.value.cancelReason, '');
    }
  });

  test('⛔ sem cliente, sem serviço ou sem horário não agenda', () => {
    assert.equal(validateNewBooking({ service: 'corte', scheduledAt: '2026-08-10T14:00:00Z' }).ok, false);
    assert.equal(validateNewBooking({ clientName: 'Alfa', scheduledAt: '2026-08-10T14:00:00Z' }).ok, false);
    assert.equal(validateNewBooking({ clientName: 'Alfa', service: 'corte' }).ok, false);
    assert.equal(validateNewBooking({}).ok, false);
  });

  test('o serviço é TEXTO LIVRE — o sistema não conhece "corte/coloração"', () => {
    const r = validateNewBooking({
      clientName: 'Alfa',
      service: 'coloração completa com hidratação',
      scheduledAt: '2026-08-10T14:00:00Z',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.service, 'coloração completa com hidratação');
  });

  test('clientId/professionalId carimbam vínculos SOLTOS opcionais', () => {
    const r = validateNewBooking({
      clientName: 'Alfa',
      service: 'corte',
      scheduledAt: '2026-08-10T14:00:00Z',
      clientId: 'crm-9',
      professionalId: 'prof-42',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.clientId, 'crm-9');
      assert.equal(r.value.professionalId, 'prof-42');
    }
  });

  test('o encaixe/walk-in agenda sem clientId — só o nome basta', () => {
    const r = validateNewBooking({
      clientName: 'Passante',
      service: 'escova',
      scheduledAt: '2026-08-10T14:00:00Z',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.clientId, null);
  });
});
