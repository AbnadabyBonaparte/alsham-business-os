import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ENGINE_PAGES,
  pageOf,
  redactFields,
  localizationBlock,
  formSnapshotBlock,
  painelResumo,
  painelPrioridades,
  agendaResumo,
  composeGroundedPrompt,
  checkBrandSafety,
  buildSystemPrompt,
  type FormField,
  type BrandContext,
} from './index.ts';

// ---------------------------------------------------------------------------
// CATÁLOGO DE PÁGINAS — derivado do menu (Sol Único), Painel presente.
// ---------------------------------------------------------------------------

test('o catálogo inclui o Painel (/) e deriva as rotas do menu', () => {
  const painel = ENGINE_PAGES.find((p) => p.rota === '/');
  assert.ok(painel, 'o Painel Executivo (/) precisa estar no catálogo');
  assert.equal(painel!.moduleId, null, 'o Painel é do Core');
  // Rotas de módulo que o menu declara.
  assert.ok(ENGINE_PAGES.some((p) => p.rota === '/contas-a-pagar' && p.moduleId === 'ap'));
  assert.ok(ENGINE_PAGES.some((p) => p.rota === '/agenda' && p.moduleId === 'appointment'));
});

test('só record/exam/prescription são sigilosas — patient e appointment não', () => {
  const sig = ENGINE_PAGES.filter((p) => p.sigilosa).map((p) => p.moduleId).sort();
  assert.deepEqual(sig, ['exam', 'prescription', 'record']);
  assert.equal(ENGINE_PAGES.find((p) => p.moduleId === 'appointment')!.sigilosa, undefined);
  assert.equal(ENGINE_PAGES.find((p) => p.moduleId === 'patient')!.sigilosa, undefined);
});

test('pageOf resolve rota exata, sub-rota de detalhe e raiz só exata', () => {
  assert.equal(pageOf('/contratos')?.moduleId, 'ctr');
  assert.equal(pageOf('/contratos/abc-123')?.rota, '/contratos', 'detalhe cai na base');
  assert.equal(pageOf('/')?.rota, '/');
  assert.equal(pageOf('/rota-que-nao-existe'), undefined);
  // a raiz não engole uma sub-rota desconhecida
  assert.equal(pageOf('/qualquer/coisa'), undefined);
});

// ---------------------------------------------------------------------------
// FRONTEIRA DE SIGILO — a supressão do servidor (2ª camada).
// ---------------------------------------------------------------------------

const CAMPOS: FormField[] = [
  { rotulo: 'Diagnóstico', preenchido: true, valor: 'CID X', obrigatorio: true, emFoco: false },
  { rotulo: 'Observação', preenchido: false, obrigatorio: false, emFoco: true },
];

test('redactFields tira o valor em tela sigilosa e preserva o resto', () => {
  const out = redactFields(CAMPOS, true)!;
  assert.equal(out[0]!.valor, undefined, 'o valor clínico foi suprimido');
  assert.equal(out[0]!.rotulo, 'Diagnóstico', 'o rótulo permanece');
  assert.equal(out[0]!.preenchido, true, 'saber que está preenchido permanece');
  assert.equal(out[0]!.obrigatorio, true);
});

test('redactFields NÃO mexe fora de tela sigilosa', () => {
  const out = redactFields(CAMPOS, false)!;
  assert.equal(out[0]!.valor, 'CID X', 'fora do sigilo, o valor passa');
});

test('o bloco de formulário sigiloso avisa que os valores estão ocultos', () => {
  const bloco = formSnapshotBlock(redactFields(CAMPOS, true), true);
  assert.match(bloco, /OCULTOS/);
  assert.doesNotMatch(bloco, /CID X/, 'o valor clínico nunca aparece no prompt');
  assert.match(bloco, /Diagnóstico/, 'o rótulo, sim');
});

test('o bloco de localização traz nome, rota e a curadoria quando existe', () => {
  const bloco = localizationBlock(pageOf('/agenda'));
  assert.match(bloco, /Agenda médica/);
  assert.match(bloco, /\/agenda/);
  assert.match(bloco, /Como usar:/);
});

// ---------------------------------------------------------------------------
// MOTOR LOCAL — determinístico, nunca inventa número.
// ---------------------------------------------------------------------------

test('painelResumo é grounded: só os números do snapshot, vazio avisa', () => {
  assert.match(painelResumo({ tenantName: 'T', linhas: [] }), /nenhum módulo/i);
  const r = painelResumo({
    tenantName: 'Acme',
    linhas: [{ label: 'Contas a pagar', total: 5, vencidos: 2 }],
  });
  assert.match(r, /Contas a pagar: 5/);
  assert.match(r, /2 em atraso/);
  assert.doesNotMatch(r, /\b(7|10|100)\b/, 'não inventa número que não veio');
});

test('painelPrioridades só lista o que tem atraso', () => {
  assert.match(
    painelPrioridades({ tenantName: 'Acme', linhas: [{ label: 'X', total: 3 }] }),
    /Nenhuma pendência/,
  );
  assert.match(
    painelPrioridades({ tenantName: 'Acme', linhas: [{ label: 'AR', total: 4, vencidos: 1 }] }),
    /AR: 1 em atraso/,
  );
});

test('agendaResumo conta por situação e lista os próximos, sem PHI', () => {
  assert.match(agendaResumo({ tenantName: 'Clínica', agendamentos: [] }), /nenhum agendamento/i);
  const r = agendaResumo({
    tenantName: 'Clínica',
    agendamentos: [
      { status: 'scheduled', quando: '14/08 09:30', servico: 'retorno' },
      { status: 'no_show', quando: '13/08 10:00', servico: 'consulta' },
    ],
  });
  assert.match(r, /1 agendado/);
  assert.match(r, /1 com falta/);
  assert.match(r, /14\/08 09:30 — retorno/);
});

// ---------------------------------------------------------------------------
// PONTE PARA A FORJA — reaproveitamento de composePrompt/findViolations.
// ---------------------------------------------------------------------------

const MARCA: BrandContext = {
  identity: 'Somos a Acme.',
  tone: 'Formal e direto.',
  forbidden: ['barato', 'milagre'],
};

test('composeGroundedPrompt reusa a Forja: marca + texto local + blocos', () => {
  const prompt = composeGroundedPrompt({
    brand: MARCA,
    localText: 'Panorama de Acme. Contas a pagar: 5.',
    contextBlocks: [localizationBlock(pageOf('/'))],
    instruction: 'Escreva um resumo executivo.',
  });
  assert.match(prompt, /Somos a Acme/, 'o Cérebro da Marca entra (via composePrompt)');
  assert.match(prompt, /Panorama de Acme\. Contas a pagar: 5\./, 'o texto grounded é a fonte');
  assert.match(prompt, /Painel Executivo/, 'o bloco de consciência entra');
  assert.match(prompt, /resumo executivo/, 'a instrução entra');
});

test('checkBrandSafety detecta o termo vetado (rede da Forja)', () => {
  assert.deepEqual(checkBrandSafety('uma solução barata', ['barato']), []);
  assert.deepEqual(checkBrandSafety('promessa de milagre', ['milagre']), ['milagre']);
});

// ---------------------------------------------------------------------------
// INTEGRAÇÃO — o prompt do sistema ganha os blocos, e o sigilo é respeitado.
// ---------------------------------------------------------------------------

test('buildSystemPrompt inclui localização e formulário quando há page/fields', () => {
  const prompt = buildSystemPrompt({
    tenantName: 'Acme',
    userEmail: 'a@b.c',
    accessibleModules: ['ap'],
    page: pageOf('/contas-a-pagar'),
    fields: [{ rotulo: 'Fornecedor', preenchido: false, obrigatorio: true, emFoco: true }],
  });
  assert.match(prompt, /LOCALIZAÇÃO/);
  assert.match(prompt, /FORMULÁRIO NA TELA/);
  assert.match(prompt, /Fornecedor/);
});

test('buildSystemPrompt em tela sigilosa não vaza valor clínico', () => {
  const page = pageOf('/prontuario');
  assert.equal(page?.sigilosa, true);
  const prompt = buildSystemPrompt({
    tenantName: 'Clínica',
    userEmail: 'a@b.c',
    accessibleModules: ['record'],
    page,
    fields: redactFields(CAMPOS, page?.sigilosa),
  });
  assert.doesNotMatch(prompt, /CID X/, 'o valor clínico não entra no prompt');
  assert.match(prompt, /OCULTOS/, 'o prompt sabe que os valores estão ocultos');
});
