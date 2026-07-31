import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewIncident, validateNewAction } from './secincident.ts';

const NOW = '2027-01-15T12:00:00Z';

describe('validateNewIncident — um incidente novo', () => {
  test('um incidente bom passa, nasce detected, com id e closeNote vazios', () => {
    const r = validateNewIncident(
      {
        title: '  Ransomware no servidor de arquivos  ',
        description: '  arquivos criptografados na madrugada  ',
        attackVector: '  phishing com anexo malicioso  ',
        affectedData: '  compartilhamento financeiro  ',
        severity: 5,
        detectedAt: '2027-01-14T03:00:00Z',
      },
      NOW,
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.title, 'Ransomware no servidor de arquivos');
      assert.equal(r.value.description, 'arquivos criptografados na madrugada');
      assert.equal(r.value.attackVector, 'phishing com anexo malicioso');
      assert.equal(r.value.affectedData, 'compartilhamento financeiro');
      assert.equal(r.value.severity, 5);
      assert.equal(r.value.detectedAt, '2027-01-14T03:00:00Z');
      assert.equal(r.value.status, 'detected');
      assert.equal(r.value.id, '');
      assert.equal(r.value.closeNote, '');
    }
  });

  test('⭐ vetor e dados são OPCIONAIS — ausentes viram vazio; detectedAt ausente vira nowIso', () => {
    const r = validateNewIncident({ title: 't', description: 'd', severity: 3 }, NOW);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.attackVector, '');
      assert.equal(r.value.affectedData, '');
      assert.equal(r.value.detectedAt, NOW);
    }
  });

  test('sem título: recusado, com o campo apontado', () => {
    for (const title of [undefined, null, '', '   ', 42]) {
      const r = validateNewIncident({ title, description: 'd', severity: 3 }, NOW);
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
    }
  });

  test('sem descrição: recusado (incidente sem descrição não é incidente)', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewIncident({ title: 't', description, severity: 3 }, NOW);
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });

  test('⭐ a régua 1–5: rejeita 0 e 6, aceita as pontas 1 e 5', () => {
    const baixo = validateNewIncident({ title: 't', description: 'd', severity: 0 }, NOW);
    assert.equal(baixo.ok, false);
    if (!baixo.ok) assert.ok(baixo.problems.some((p) => p.field === 'severity'));

    const alto = validateNewIncident({ title: 't', description: 'd', severity: 6 }, NOW);
    assert.equal(alto.ok, false);
    if (!alto.ok) assert.ok(alto.problems.some((p) => p.field === 'severity'));

    assert.equal(validateNewIncident({ title: 't', description: 'd', severity: 1 }, NOW).ok, true);
    assert.equal(validateNewIncident({ title: 't', description: 'd', severity: 5 }, NOW).ok, true);
  });

  test('⭐ a régua 1–5 rejeita não-inteiro (2.5) e string ("3")', () => {
    const frac = validateNewIncident({ title: 't', description: 'd', severity: 2.5 }, NOW);
    assert.equal(frac.ok, false);
    if (!frac.ok) assert.ok(frac.problems.some((p) => p.field === 'severity'));

    const str = validateNewIncident({ title: 't', description: 'd', severity: '3' }, NOW);
    assert.equal(str.ok, false);
    if (!str.ok) assert.ok(str.problems.some((p) => p.field === 'severity'));
  });

  test('⭐ detectedAt no FUTURO é recusado — comparado contra o nowIso POR PARÂMETRO', () => {
    const r = validateNewIncident(
      { title: 't', description: 'd', severity: 3, detectedAt: '2027-06-01T00:00:00Z' },
      NOW,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'detectedAt'));
  });

  test('⭐ detectedAt no PASSADO é permitido (o registro chega depois da detecção)', () => {
    const r = validateNewIncident(
      { title: 't', description: 'd', severity: 3, detectedAt: '2026-12-01T00:00:00Z' },
      NOW,
    );
    assert.equal(r.ok, true);
  });

  test('detectedAt inválido: recusado', () => {
    const r = validateNewIncident({ title: 't', description: 'd', severity: 3, detectedAt: 'ontem' }, NOW);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'detectedAt'));
  });
});

describe('validateNewAction — um passo da timeline', () => {
  test('uma ação com texto passa e vem aparada', () => {
    const r = validateNewAction({ actionTaken: '  isolou o servidor da rede  ' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.actionTaken, 'isolou o servidor da rede');
  });

  test('sem o que foi feito: recusado (passo sem ato não é passo)', () => {
    for (const actionTaken of [undefined, null, '', '   ', 42]) {
      const r = validateNewAction({ actionTaken });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'actionTaken'));
    }
  });
});
