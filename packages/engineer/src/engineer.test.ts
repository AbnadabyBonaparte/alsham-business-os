import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildSystemPrompt,
  buildDocumentPrompt,
  buildTools,
  resolveConsulta,
  sanitizeLimite,
  pendenciaPlan,
  MODULE_READS,
  knownReadModules,
} from './index.ts';

// ---------------------------------------------------------------------------
// O MAPA DE LEITURA — invariante que mantém a consulta honesta.
// ---------------------------------------------------------------------------

test('todo alvo de leitura tem schema igual ao moduleId (schema = módulo)', () => {
  for (const [moduleId, read] of Object.entries(MODULE_READS)) {
    assert.equal(read.schema, moduleId, `${moduleId}: schema deve ser o próprio id`);
    assert.ok(read.table.length > 0, `${moduleId}: precisa de tabela`);
    assert.ok(read.label.length > 0, `${moduleId}: precisa de rótulo`);
  }
});

// ---------------------------------------------------------------------------
// buildTools — a ferramenta reflete o ACESSO do usuário, nada além.
// ---------------------------------------------------------------------------

test('consultar_modulo só oferece os módulos que o usuário acessa', () => {
  const tools = buildTools(['ap', 'crm', 'naoexiste']);
  const consultar = tools.find((t) => t.name === 'consultar_modulo');
  assert.ok(consultar, 'deveria existir consultar_modulo');
  const enumv = consultar!.input_schema.properties.moduleId as { enum: string[] };
  // 'naoexiste' não está no mapa de leitura → não entra no enum.
  assert.deepEqual(enumv.enum.sort(), ['ap', 'crm']);
});

test('sem módulo legível, consultar_modulo nem aparece', () => {
  const tools = buildTools(['naoexiste']);
  assert.equal(
    tools.find((t) => t.name === 'consultar_modulo'),
    undefined,
  );
});

test('gerar_documento existe sempre; resumir_pendencias só com módulo de prazo', () => {
  const semPrazo = buildTools(['crm']);
  assert.ok(semPrazo.find((t) => t.name === 'gerar_documento'));
  assert.equal(semPrazo.find((t) => t.name === 'resumir_pendencias'), undefined);

  const comPrazo = buildTools(['crm', 'ap']);
  assert.ok(comPrazo.find((t) => t.name === 'resumir_pendencias'));
});

// ---------------------------------------------------------------------------
// resolveConsulta — a DEFESA EM PROFUNDIDADE (a RLS é a cerca real).
// ---------------------------------------------------------------------------

test('resolveConsulta recusa módulo fora do acesso do usuário', () => {
  const r = resolveConsulta('cash', ['crm', 'ap']); // usuário NÃO acessa cash
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.motivo, /não tem acesso/i);
});

test('resolveConsulta recusa módulo desconhecido do mapa', () => {
  const r = resolveConsulta('recon', ['recon']); // recon não está no mapa de leitura
  assert.equal(r.ok, false);
});

test('resolveConsulta aceita módulo conhecido E acessível', () => {
  const r = resolveConsulta('ap', ['ap', 'crm']);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.read.schema, 'ap');
    assert.equal(r.read.table, 'payables');
  }
});

test('resolveConsulta recusa entrada não-string', () => {
  assert.equal(resolveConsulta(undefined, ['ap']).ok, false);
  assert.equal(resolveConsulta(42, ['ap']).ok, false);
});

// ---------------------------------------------------------------------------
// sanitizeLimite / pendenciaPlan
// ---------------------------------------------------------------------------

test('sanitizeLimite trava em [1,50] com padrão 10', () => {
  assert.equal(sanitizeLimite(undefined), 10);
  assert.equal(sanitizeLimite(0), 1);
  assert.equal(sanitizeLimite(999), 50);
  assert.equal(sanitizeLimite(7), 7);
  assert.equal(sanitizeLimite(3.9), 3);
});

test('pendenciaPlan cobre só os módulos de prazo acessíveis', () => {
  assert.deepEqual(pendenciaPlan(['ap', 'crm', 'mnt']), ['ap', 'mnt']);
  assert.deepEqual(pendenciaPlan(['crm']), []);
});

// ---------------------------------------------------------------------------
// A VOZ — Lei do Motor e Anti-Brand (IDENTIDADE-VISUAL §6).
// ---------------------------------------------------------------------------

const PROIBIDO = /claude|anthropic|gpt|openai|gemini|llama|mistral|deepseek/i;
// Faixa de emoji comum — o produto não usa emoji (IDENTIDADE-VISUAL §6).
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

test('o system prompt nunca cita fornecedor de IA de terceiros', () => {
  const p = buildSystemPrompt({
    tenantName: 'Tenant Piloto',
    userEmail: 'dono@example.com',
    accessibleModules: ['ap', 'crm'],
    currentPath: '/contas-a-pagar',
  });
  assert.doesNotMatch(p, PROIBIDO);
  assert.match(p, /motor é ALSHAM|inteligência ALSHAM/i);
  assert.match(p, /Tenant Piloto/);
  assert.match(p, /contas-a-pagar/);
});

test('o system prompt não usa emoji e proíbe efusividade', () => {
  const p = buildSystemPrompt({
    tenantName: 'X',
    userEmail: 'a@b.c',
    accessibleModules: [],
  });
  assert.doesNotMatch(p, EMOJI);
});

test('o prompt de documento também é livre de fornecedor e emoji', () => {
  const p = buildDocumentPrompt({
    instrucoes: 'Redija um comunicado sobre o feriado.',
    tenantName: 'X',
    tipo: 'comunicado',
  });
  assert.doesNotMatch(p, PROIBIDO);
  assert.doesNotMatch(p, EMOJI);
});

test('knownReadModules devolve as chaves ordenadas', () => {
  const ks = knownReadModules();
  assert.deepEqual([...ks], [...ks].sort());
  assert.ok(ks.includes('ap'));
});
