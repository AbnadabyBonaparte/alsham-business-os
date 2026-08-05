import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PAGE_BANNERS, findHype, bannerKeys } from './banners.ts';

// ---------------------------------------------------------------------------
// A LEI DE VOZ VIRADA TESTE — nenhuma frase de marketing escorrega para o hype.
//
// ⚠️ O portal não roda no `pnpm test` do CI (que cobre só packages/*). Esta
// banca prova a guarda LOCALMENTE — rode com:
//   node --experimental-strip-types --test apps/portal/src/lib/marketing/*.test.ts
// ---------------------------------------------------------------------------

test('nenhuma frase visível contém superlativo, drama ou fornecedor de IA', () => {
  for (const [key, facts] of Object.entries(PAGE_BANNERS)) {
    for (const f of facts) {
      const hits = findHype(f.text);
      assert.deepEqual(hits, [], `${key}: "${f.text}" tem termo proibido: ${hits.join(', ')}`);
    }
  }
});

test('toda variação tem texto e âncora — nenhuma frase sem fato que a prove', () => {
  for (const [key, facts] of Object.entries(PAGE_BANNERS)) {
    assert.ok(facts.length >= 2, `${key}: precisa de ao menos 2 variações para a rotação`);
    assert.ok(facts.length <= 3, `${key}: no máximo 3 variações (rotação silenciosa)`);
    for (const f of facts) {
      assert.ok(f.text.trim().length > 0, `${key}: variação sem texto`);
      assert.ok(f.grounds.trim().length > 0, `${key}: variação sem âncora (grounds)`);
    }
  }
});

test('a guarda pega o que precisa pegar (auto-verificação do próprio filtro)', () => {
  assert.deepEqual(findHype('Nossa IA revolucionária, o melhor do mercado'), [
    'revolucion',
    'o melhor do mercado',
  ]);
  assert.deepEqual(findHype('Movido por Claude e GPT'), ['claude', 'gpt']);
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
