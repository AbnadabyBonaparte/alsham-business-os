import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewAudit, validateNewFinding, validateCancel } from './audits.ts';

describe('validateNewAudit — uma auditoria nova', () => {
  test('uma auditoria boa passa, nasce planned, com id vazio e razão/nota vazias', () => {
    const r = validateNewAudit({
      auditType: '  Certificação ISO 9001  ',
      scope: '  Toda a fábrica  ',
      scheduledFor: '2027-03-15',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.auditType, 'Certificação ISO 9001');
      assert.equal(r.value.scope, 'Toda a fábrica');
      assert.equal(r.value.scheduledFor, '2027-03-15');
      assert.equal(r.value.status, 'planned');
      assert.equal(r.value.cancelReason, '');
      assert.equal(r.value.outcomeNote, '');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ a data agendada é OPCIONAL — ausente ou fora do formato ISO vira null', () => {
    for (const scheduledFor of [undefined, null, '', '   ', 'amanhã', '15/03/2027', 42]) {
      const r = validateNewAudit({ auditType: 'Interna', scope: 'Compras', scheduledFor });
      assert.equal(r.ok, true);
      if (r.ok) assert.equal(r.value.scheduledFor, null);
    }
  });

  test('sem tipo: recusado, com o campo apontado', () => {
    for (const auditType of [undefined, null, '', '   ', 42]) {
      const r = validateNewAudit({ auditType, scope: 'Compras' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'auditType'));
    }
  });

  test('sem escopo: recusado, com o campo apontado', () => {
    for (const scope of [undefined, null, '', '   ', 42]) {
      const r = validateNewAudit({ auditType: 'Interna', scope });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'scope'));
    }
  });
});

describe('validateNewFinding — um achado novo', () => {
  test('um achado bom passa, com id vazio e o nc por id solto', () => {
    const r = validateNewFinding({
      auditId: '  au-1  ',
      description: '  Falta registro de calibração  ',
      ncEntryId: '  nc-7  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.auditId, 'au-1');
      assert.equal(r.value.description, 'Falta registro de calibração');
      assert.equal(r.value.ncEntryId, 'nc-7');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ o vínculo ao nc é OPCIONAL (id solto) — ausente vira null', () => {
    const r = validateNewFinding({ auditId: 'au', description: 'Observação' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.ncEntryId, null);
  });

  test('sem auditoria: recusado', () => {
    const r = validateNewFinding({ description: 'Observação' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'auditId'));
  });

  test('sem descrição: recusado', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewFinding({ auditId: 'au', description });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });
});

describe('validateCancel — cancelar exige razão (a assimetria do proj)', () => {
  test('uma razão boa passa e volta limpa', () => {
    const r = validateCancel({ reason: '  auditor indisponível  ' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value, 'auditor indisponível');
  });

  test('⭐ sem razão: recusado, com o campo apontado', () => {
    for (const reason of [undefined, null, '', '   ', 42]) {
      const r = validateCancel({ reason });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'reason'));
    }
  });
});
