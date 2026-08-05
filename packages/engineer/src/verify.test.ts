import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildVerifierPrompt,
  parseVerdict,
  decideGate,
  gatedReply,
  VERIFIER_RUBRIC,
  VERIFY_BLOCKED_MESSAGE,
  type VerifierInput,
} from './index.ts';

const ENTRADA: VerifierInput = {
  question: 'Quantos títulos estão vencidos?',
  answer: 'Você tem 3 títulos vencidos somando BRL 1500.00.',
  groundedFacts: '3 títulos vencidos; total em aberto BRL 1500.00; o mais antigo há 12 dias.',
  tenantName: 'Tenant Piloto',
};

// ---------------------------------------------------------------------------
// buildVerifierPrompt — leva os FATOS, a pergunta, a resposta e a rubrica;
// NUNCA o raciocínio (a regra output-only).
// ---------------------------------------------------------------------------

test('o prompt do juiz carrega os FATOS, a pergunta, a resposta e o tenant', () => {
  const p = buildVerifierPrompt(ENTRADA);
  assert.ok(p.includes(ENTRADA.groundedFacts.trim()), 'precisa dos FATOS');
  assert.ok(p.includes(ENTRADA.question.trim()), 'precisa da pergunta');
  assert.ok(p.includes(ENTRADA.answer.trim()), 'precisa da resposta');
  assert.ok(p.includes(ENTRADA.tenantName), 'precisa do tenant');
});

test('o prompt embute a rubrica inteira', () => {
  const p = buildVerifierPrompt(ENTRADA);
  for (const criterio of VERIFIER_RUBRIC) {
    assert.ok(p.includes(criterio), `rubrica faltando: ${criterio}`);
  }
});

test('o prompt manda o juiz devolver SÓ JSON e reprovar na dúvida (fail-closed)', () => {
  const p = buildVerifierPrompt(ENTRADA);
  assert.ok(p.includes('"verdict"'), 'precisa pedir o formato do veredito');
  assert.ok(/fail/i.test(p) && /d[úu]vida/i.test(p), 'precisa instruir fail na dúvida');
});

// ---------------------------------------------------------------------------
// parseVerdict — só um `pass` LITERAL e bem-formado publica. Todo o resto falha.
// ---------------------------------------------------------------------------

test('pass explícito e bem-formado passa', () => {
  const v = parseVerdict('{"verdict":"pass","reasons":[]}');
  assert.equal(v.verdict, 'pass');
});

test('pass envolto em prosa e cerca de markdown ainda é lido', () => {
  const bruto = 'Claro! Aqui está:\n```json\n{"verdict":"pass","reasons":["tudo confere"]}\n```\n';
  const v = parseVerdict(bruto);
  assert.equal(v.verdict, 'pass');
  assert.deepEqual(v.reasons, ['tudo confere']);
});

test('fail explícito reprova e preserva os motivos', () => {
  const v = parseVerdict('{"verdict":"fail","reasons":["o número 4200 não está nos fatos"]}');
  assert.equal(v.verdict, 'fail');
  assert.deepEqual(v.reasons, ['o número 4200 não está nos fatos']);
});

test('FAIL-CLOSED: JSON malformado bloqueia', () => {
  assert.equal(parseVerdict('{"verdict":"pass"').verdict, 'fail');
});

test('FAIL-CLOSED: sem JSON nenhum bloqueia', () => {
  assert.equal(parseVerdict('parece tudo certo pra mim').verdict, 'fail');
});

test('FAIL-CLOSED: verdict ausente bloqueia', () => {
  assert.equal(parseVerdict('{"reasons":["ok"]}').verdict, 'fail');
});

test('FAIL-CLOSED: verdict desconhecido bloqueia', () => {
  assert.equal(parseVerdict('{"verdict":"talvez"}').verdict, 'fail');
});

test('FAIL-CLOSED: string vazia bloqueia', () => {
  assert.equal(parseVerdict('').verdict, 'fail');
});

test('fail sem motivo ainda recebe um motivo (nunca reprova mudo)', () => {
  const v = parseVerdict('{"verdict":"fail","reasons":[]}');
  assert.equal(v.verdict, 'fail');
  assert.ok(v.reasons.length > 0, 'um fail precisa dizer por quê');
});

// ---------------------------------------------------------------------------
// decideGate — publish é true SÓ no pass. É onde a rota troca a resposta por
// "não pude confirmar" quando o juiz reprova.
// ---------------------------------------------------------------------------

test('o portão só publica no pass', () => {
  assert.equal(decideGate({ verdict: 'pass', reasons: [] }).publish, true);
  assert.equal(decideGate({ verdict: 'fail', reasons: ['x'] }).publish, false);
});

test('ponta a ponta: juiz ilegível → resposta NÃO publica', () => {
  // A prova da lei: um juiz que devolve lixo não pode liberar a resposta.
  const veredito = parseVerdict('o modelo caiu no meio da resposta {');
  assert.equal(decideGate(veredito).publish, false);
});

// ---------------------------------------------------------------------------
// gatedReply — a decisão da rota viva: resposta liberada OU a frase honesta.
// É o coração do fail-closed do lado da tela.
// ---------------------------------------------------------------------------

test('gatedReply: publish=true devolve a resposta original', () => {
  assert.equal(gatedReply('3 títulos vencidos.', { publish: true }), '3 títulos vencidos.');
});

test('gatedReply: publish=false devolve a frase honesta, nunca a resposta', () => {
  assert.equal(gatedReply('7 títulos / BRL 4200.', { publish: false }), VERIFY_BLOCKED_MESSAGE);
});

test('⛔ gatedReply FAIL-CLOSED: verificador ausente (null) NÃO publica', () => {
  // O caso do bastão: o juiz caiu / rede fora / não configurado → não solta o
  // não verificado, devolve a frase honesta.
  assert.equal(gatedReply('qualquer resposta', null), VERIFY_BLOCKED_MESSAGE);
});

test('a frase honesta não é erro técnico cru nem a resposta', () => {
  assert.ok(!/erro|error|500|502|exception/i.test(VERIFY_BLOCKED_MESSAGE));
  assert.ok(/reformular/i.test(VERIFY_BLOCKED_MESSAGE));
});
