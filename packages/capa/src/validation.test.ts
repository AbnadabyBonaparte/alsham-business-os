import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewAction, validateVerification } from './capa.ts';

describe('validateNewAction — uma ação nova', () => {
  test('uma ação boa passa, nasce open, sem nota, com id vazio', () => {
    const r = validateNewAction({
      actionType: 'corrective',
      description: '  Trocar o selo da bomba  ',
      responsible: '  Manutenção  ',
      dueDate: '2027-06-30',
      ncEntryId: '  nc-42  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.actionType, 'corrective');
      assert.equal(r.value.description, 'Trocar o selo da bomba');
      assert.equal(r.value.responsible, 'Manutenção');
      assert.equal(r.value.dueDate, '2027-06-30');
      assert.equal(r.value.ncEntryId, 'nc-42');
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.verificationNote, '');
      assert.equal(r.value.id, '');
    }
  });

  test('preventive também passa', () => {
    const r = validateNewAction({ actionType: 'preventive', description: 'Rever procedimento', responsible: 'Qualidade' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.actionType, 'preventive');
  });

  test('⭐ o tipo é CHECK (física do método): qualquer valor fora dos dois é recusado', () => {
    for (const actionType of ['other', 'corretiva', '', undefined, null, 3]) {
      const r = validateNewAction({ actionType, description: 'x', responsible: 'y' });
      assert.equal(r.ok, false, `tipo ${String(actionType)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'actionType'));
    }
  });

  test('sem descrição: recusado', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewAction({ actionType: 'corrective', description, responsible: 'y' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });

  test('sem responsável: recusado', () => {
    for (const responsible of [undefined, null, '', '   ', 42]) {
      const r = validateNewAction({ actionType: 'corrective', description: 'x', responsible });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'responsible'));
    }
  });

  test('⭐ prazo é OPCIONAL — ausente ou malformado vira null', () => {
    const semPrazo = validateNewAction({ actionType: 'preventive', description: 'x', responsible: 'y' });
    assert.equal(semPrazo.ok, true);
    if (semPrazo.ok) assert.equal(semPrazo.value.dueDate, null);

    const prazoRuim = validateNewAction({ actionType: 'preventive', description: 'x', responsible: 'y', dueDate: '30/06/2027' });
    assert.equal(prazoRuim.ok, true);
    if (prazoRuim.ok) assert.equal(prazoRuim.value.dueDate, null);
  });

  test('⭐ o vínculo ao nc é OPCIONAL (id solto) — ausente vira null', () => {
    const r = validateNewAction({ actionType: 'preventive', description: 'x', responsible: 'y' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.ncEntryId, null);
  });
});

describe('validateVerification — a nota que faz a CAPA não ser um marco', () => {
  test('uma nota boa passa, aparada', () => {
    const r = validateVerification({ verificationNote: '  Reinspecionado em 07/2027, sem recorrência.  ' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.verificationNote, 'Reinspecionado em 07/2027, sem recorrência.');
  });

  test('⭐ a nota é OBRIGATÓRIA: sem quem confirmou que funcionou, não há verificação', () => {
    for (const verificationNote of [undefined, null, '', '   ', 42]) {
      const r = validateVerification({ verificationNote });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'verificationNote'));
    }
  });
});
