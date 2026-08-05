import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PAGE_BANNERS, bannerKeys } from './banners.ts';

// ---------------------------------------------------------------------------
// A LEI DE VOZ VIRADA TESTE — nenhuma frase de marketing escorrega para o hype.
//
// ⚠️ A GUARDA MORA AQUI, e não em `banners.ts`, DE PROPÓSITO: a lista abaixo
// precisa citar por extenso os nomes de fornecedor de IA que reprova (Lei do
// Motor). Como `banners.ts` é importado por um client component, qualquer
// literal desses lá viraria a própria infração — no bundle de cliente e no
// scan de tela do CI. Arquivo `*.test.ts` é ignorado pelas duas verificações e
// nunca é empacotado. Rode local:
//   node --experimental-strip-types --test apps/portal/src/lib/marketing/*.test.ts
// ---------------------------------------------------------------------------

/**
 * ⛔ A lista de termos proibidos: superlativo de "agent-washing" (lei de voz
 * §5), drama de ficção científica (§3) e fornecedor de IA de terceiros (Lei do
 * Motor). Cru, minúsculo, por substring.
 */
const HYPE_TERMS: readonly string[] = [
  // Superlativo vazio / promessa inflada.
  'revolucion',
  'o futuro chegou',
  'superinteligência',
  'superinteligencia',
  'poderosa',
  'poderoso',
  'mágica',
  'magica',
  'incrível',
  'incrivel',
  'disruptiv',
  'de ponta',
  'inigualável',
  'inigualavel',
  'o melhor do mercado',
  'líder de mercado',
  'lider de mercado',
  'game changer',
  'game-changer',
  // Fornecedor de IA de terceiros (Lei do Motor).
  'claude',
  'anthropic',
  'gpt',
  'openai',
  'gemini',
  'llama',
  'mistral',
  'deepseek',
];

/** Faixa de emoji comum — o produto não usa emoji (IDENTIDADE-VISUAL §6). */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

/** Devolve os termos proibidos encontrados em `text` (vazio = limpo). */
function findHype(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = HYPE_TERMS.filter((t) => lower.includes(t));
  if (EMOJI.test(text)) hits.push('<emoji>');
  return hits;
}

test('nenhuma frase visível contém superlativo, drama ou fornecedor de IA', () => {
  for (const [key, frases] of Object.entries(PAGE_BANNERS)) {
    for (const frase of frases) {
      const hits = findHype(frase);
      assert.deepEqual(hits, [], `${key}: "${frase}" tem termo proibido: ${hits.join(', ')}`);
    }
  }
});

test('nenhuma frase carrega o literal service_role (o CI reprova no bundle)', () => {
  // banners.ts é importado por um client component; tudo que for valor vai ao
  // bundle do navegador. Nenhuma frase pode carregar o token da chave de serviço.
  for (const [key, frases] of Object.entries(PAGE_BANNERS)) {
    for (const frase of frases) {
      assert.doesNotMatch(frase, /service_role/, `${key}: "${frase}" carrega service_role`);
    }
  }
});

test('cada tela tem 2 a 3 frases — o suficiente para a rotação silenciosa', () => {
  for (const [key, frases] of Object.entries(PAGE_BANNERS)) {
    assert.ok(frases.length >= 2, `${key}: precisa de ao menos 2 variações para a rotação`);
    assert.ok(frases.length <= 3, `${key}: no máximo 3 variações (rotação silenciosa)`);
    for (const frase of frases) {
      assert.ok(frase.trim().length > 0, `${key}: frase vazia`);
    }
  }
});

test('a guarda pega o que precisa pegar (auto-verificação do próprio filtro)', () => {
  assert.deepEqual(findHype('Nossa IA revolucionária, o melhor do mercado'), [
    'revolucion',
    'o melhor do mercado',
  ]);
  assert.deepEqual(findHype('Movido pela Anthropic'), ['anthropic']);
  assert.deepEqual(findHype('Prova, não promessa.'), []);
  assert.deepEqual(findHype('Tudo pronto 🚀'), ['<emoji>']);
});

test('bannerKeys devolve as chaves ordenadas e inclui as transversais', () => {
  const ks = bannerKeys();
  assert.deepEqual([...ks], [...ks].sort());
  assert.ok(ks.includes('confianca'));
  assert.ok(ks.includes('eficiencia'));
  assert.ok(ks.includes('painel'));
});
