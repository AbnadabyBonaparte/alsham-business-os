import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewCommission } from './commission.ts';

const PRO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('validateNewCommission — o registro de uma comissão', () => {
  test('uma comissão boa passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewCommission({
      professionalId: `  ${PRO}  `,
      professionalName: '  Ana Cabeleireira  ',
      service: '  coloração  ',
      baseAmountCents: 12000,
      commissionAmountCents: 3600,
      occurredOn: '2026-07-31',
      note: '  cliente fiel  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.professionalId, PRO); // trim
      assert.equal(r.value.professionalName, 'Ana Cabeleireira');
      assert.equal(r.value.service, 'coloração');
      assert.equal(r.value.baseAmountCents, 12000);
      assert.equal(r.value.commissionAmountCents, 3600);
      assert.equal(r.value.occurredOn, '2026-07-31');
      assert.equal(r.value.note, 'cliente fiel');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ o valor-base e a nota são OPCIONAIS — a comissão é registrada com ou sem eles', () => {
    const r = validateNewCommission({
      professionalId: PRO,
      professionalName: 'Bruno',
      service: 'corte',
      commissionAmountCents: 2000,
      occurredOn: '2026-07-31',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.baseAmountCents, null);
      assert.equal(r.value.note, '');
      assert.equal(r.value.commissionAmountCents, 2000);
    }
  });

  test('⭐ o profissional (id solto) é OBRIGATÓRIO', () => {
    for (const professionalId of [undefined, null, '', '   ', 42]) {
      const r = validateNewCommission({
        professionalId, professionalName: 'Ana', service: 'corte', commissionAmountCents: 2000, occurredOn: '2026-07-31',
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'professionalId'));
    }
  });

  test('⭐ o nome do profissional é OBRIGATÓRIO', () => {
    for (const professionalName of [undefined, null, '', '   ', 42]) {
      const r = validateNewCommission({
        professionalId: PRO, professionalName, service: 'corte', commissionAmountCents: 2000, occurredOn: '2026-07-31',
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'professionalName'));
    }
  });

  test('⭐ o serviço (texto livre) é OBRIGATÓRIO', () => {
    for (const service of [undefined, null, '', '   ', 42]) {
      const r = validateNewCommission({
        professionalId: PRO, professionalName: 'Ana', service, commissionAmountCents: 2000, occurredOn: '2026-07-31',
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'service'));
    }
  });

  test('serviço é TEXTO LIVRE — o sistema não conhece "corte/coloração"', () => {
    const r = validateNewCommission({
      professionalId: PRO, professionalName: 'Ana', service: 'design de sobrancelha com henna', commissionAmountCents: 1000, occurredOn: '2026-07-31',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.service, 'design de sobrancelha com henna');
  });

  test('⭐⭐ o valor da comissão é OBRIGATÓRIO e >= 0 — zero (cortesia) passa; negativo não', () => {
    // Ausente é recusado.
    const ausente = validateNewCommission({ professionalId: PRO, professionalName: 'Ana', service: 'corte', occurredOn: '2026-07-31' });
    assert.equal(ausente.ok, false);
    if (!ausente.ok) assert.ok(ausente.problems.some((p) => p.field === 'commissionAmountCents'));

    // Zero passa (serviço de cortesia sem comissão).
    const zero = validateNewCommission({
      professionalId: PRO, professionalName: 'Ana', service: 'corte', commissionAmountCents: 0, occurredOn: '2026-07-31',
    });
    assert.equal(zero.ok, true);
    if (zero.ok) assert.equal(zero.value.commissionAmountCents, 0);

    // Negativo e fracionário são recusados.
    for (const commissionAmountCents of [-1, -100, 1.5, 'muito', Number.NaN]) {
      const r = validateNewCommission({
        professionalId: PRO, professionalName: 'Ana', service: 'corte', commissionAmountCents, occurredOn: '2026-07-31',
      });
      assert.equal(r.ok, false, `comissão=${String(commissionAmountCents)} deveria ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'commissionAmountCents'));
    }
  });

  test('⚠️ o valor-base, quando informado, é inteiro >= 0 (informativo, não calcula nada)', () => {
    const bom = validateNewCommission({
      professionalId: PRO, professionalName: 'Ana', service: 'corte', baseAmountCents: 8000, commissionAmountCents: 2400, occurredOn: '2026-07-31',
    });
    assert.equal(bom.ok, true);
    if (bom.ok) assert.equal(bom.value.baseAmountCents, 8000);

    for (const baseAmountCents of [-1, 1.5]) {
      const r = validateNewCommission({
        professionalId: PRO, professionalName: 'Ana', service: 'corte', baseAmountCents, commissionAmountCents: 2400, occurredOn: '2026-07-31',
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'baseAmountCents'));
    }
  });

  test('o dia é OBRIGATÓRIO', () => {
    for (const occurredOn of [undefined, null, '']) {
      const r = validateNewCommission({
        professionalId: PRO, professionalName: 'Ana', service: 'corte', commissionAmountCents: 2000, occurredOn,
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'occurredOn'));
    }
  });

  test('data inválida (formato ou calendário) é recusada', () => {
    for (const occurredOn of ['31/07/2026', '2026-7-1', 'ontem', '2026-02-30']) {
      const r = validateNewCommission({
        professionalId: PRO, professionalName: 'Ana', service: 'corte', commissionAmountCents: 2000, occurredOn,
      });
      assert.equal(r.ok, false, `data=${occurredOn} deveria ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'occurredOn'));
    }
  });

  test('nome / serviço / nota longos demais são recusados no campo certo', () => {
    const longoNome = validateNewCommission({
      professionalId: PRO, professionalName: 'x'.repeat(201), service: 'corte', commissionAmountCents: 2000, occurredOn: '2026-07-31',
    });
    assert.equal(longoNome.ok, false);
    if (!longoNome.ok) assert.ok(longoNome.problems.some((p) => p.field === 'professionalName'));

    const longoServico = validateNewCommission({
      professionalId: PRO, professionalName: 'Ana', service: 'y'.repeat(201), commissionAmountCents: 2000, occurredOn: '2026-07-31',
    });
    assert.equal(longoServico.ok, false);
    if (!longoServico.ok) assert.ok(longoServico.problems.some((p) => p.field === 'service'));

    const longaNota = validateNewCommission({
      professionalId: PRO, professionalName: 'Ana', service: 'corte', commissionAmountCents: 2000, occurredOn: '2026-07-31', note: 'z'.repeat(1001),
    });
    assert.equal(longaNota.ok, false);
    if (!longaNota.ok) assert.ok(longaNota.problems.some((p) => p.field === 'note'));
  });
});
