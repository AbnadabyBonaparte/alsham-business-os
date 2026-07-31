import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewCertificate } from './fiscalcert.ts';

describe('validateNewCertificate — o registro de metadados de um certificado', () => {
  test('um certificado bom passa, nasce ATIVO, com id vazio', () => {
    const r = validateNewCertificate({
      certType: '  e-CNPJ  ',
      holder: '  ALSHAM Global Commerce Ltda  ',
      validFrom: '2026-01-01',
      validUntil: '2027-01-01',
      note: '  A1  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.certType, 'e-CNPJ');
      assert.equal(r.value.holder, 'ALSHAM Global Commerce Ltda');
      assert.equal(r.value.validFrom, '2026-01-01');
      assert.equal(r.value.validUntil, '2027-01-01');
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.note, 'A1');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ o início e a nota são OPCIONAIS; o vencimento não', () => {
    const r = validateNewCertificate({ certType: 'e-CPF', holder: 'Fulano', validUntil: '2027-06-30' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.validFrom, null);
      assert.equal(r.value.note, '');
    }
  });

  test('⭐ o tipo é OBRIGATÓRIO', () => {
    for (const certType of [undefined, null, '', '   ', 42]) {
      const r = validateNewCertificate({ certType, holder: 'X', validUntil: '2027-01-01' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'certType'));
    }
  });

  test('⭐ o titular é OBRIGATÓRIO', () => {
    for (const holder of [undefined, null, '', '   ', 42]) {
      const r = validateNewCertificate({ certType: 'e-CNPJ', holder, validUntil: '2027-01-01' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'holder'));
    }
  });

  test('⭐⭐ o VENCIMENTO é OBRIGATÓRIO (é o dado que justifica o módulo)', () => {
    for (const validUntil of [undefined, null, '']) {
      const r = validateNewCertificate({ certType: 'e-CNPJ', holder: 'X', validUntil });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'validUntil'));
    }
  });

  test('data de vencimento / início inválida (formato ou calendário) é recusada', () => {
    for (const validUntil of ['01/01/2027', '2027-1-1', 'nunca', '2027-02-30']) {
      const r = validateNewCertificate({ certType: 'e-CNPJ', holder: 'X', validUntil });
      assert.equal(r.ok, false, `validUntil=${validUntil} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'validUntil'));
    }
    const badFrom = validateNewCertificate({ certType: 'e-CNPJ', holder: 'X', validUntil: '2027-01-01', validFrom: 'ontem' });
    assert.equal(badFrom.ok, false);
    if (!badFrom.ok) assert.ok(badFrom.problems.some((p) => p.field === 'validFrom'));
  });

  test('⭐ o vencimento não pode ser ANTES do início', () => {
    const r = validateNewCertificate({ certType: 'e-CNPJ', holder: 'X', validFrom: '2027-01-01', validUntil: '2026-01-01' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'validUntil'));
  });

  test('tipo / titular / nota longos demais são recusados no campo certo', () => {
    const longoT = validateNewCertificate({ certType: 'x'.repeat(121), holder: 'X', validUntil: '2027-01-01' });
    assert.equal(longoT.ok, false);
    if (!longoT.ok) assert.ok(longoT.problems.some((p) => p.field === 'certType'));

    const longoH = validateNewCertificate({ certType: 'e-CNPJ', holder: 'y'.repeat(201), validUntil: '2027-01-01' });
    assert.equal(longoH.ok, false);
    if (!longoH.ok) assert.ok(longoH.problems.some((p) => p.field === 'holder'));

    const longaN = validateNewCertificate({ certType: 'e-CNPJ', holder: 'X', validUntil: '2027-01-01', note: 'z'.repeat(1001) });
    assert.equal(longaN.ok, false);
    if (!longaN.ok) assert.ok(longaN.problems.some((p) => p.field === 'note'));
  });
});
