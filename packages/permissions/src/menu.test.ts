import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { ALL_MENU_ITEMS, accessibleModules, hasModuleAccess, visibleMenu } from './menu.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = resolve(HERE, '../../../apps/portal/src/app');
const SEED = resolve(HERE, '../../../supabase/seed/0001_platform.sql');

describe('o menu mostra só o que o usuário pode abrir', () => {
  test('sem permissão nenhuma, restam as rotas do Core', () => {
    const itens = visibleMenu(new Set());
    assert.deepEqual(itens.map((i) => i.href), ['/', '/store']);
  });

  test('⭐ o Painel e a Store nunca somem — são a plataforma, não catálogo', () => {
    // Um usuário recém-convidado, sem módulo nenhum instalado, precisa chegar à
    // Store: é lá que ele instala o primeiro. Um menu que some inteiro deixa a
    // pessoa numa tela sem saída.
    for (const conjunto of [new Set<string>(), new Set(['ops.order.manage'])]) {
      const hrefs = visibleMenu(conjunto).map((i) => i.href);
      assert.ok(hrefs.includes('/'));
      assert.ok(hrefs.includes('/store'));
    }
  });

  test('uma permissão de um módulo abre TODAS as telas daquele módulo', () => {
    const itens = visibleMenu(new Set(['recon.statement.import']));
    const hrefs = itens.map((i) => i.href);
    assert.ok(hrefs.includes('/importar'));
    assert.ok(hrefs.includes('/conciliacao'));
    assert.ok(hrefs.includes('/aprovacoes'));
    assert.ok(hrefs.includes('/fechamento'));
    assert.ok(!hrefs.includes('/campanhas'));
  });

  /**
   * ⛔ A pergunta é por PREFIXO, e não por uma chave específica. Perguntar por
   * `ops.order.manage` esconderia a esteira de quem só tem
   * `ops.order.decide` — justamente o aprovador, que é quem mais precisa
   * entrar.
   */
  test('⛔ quem só DECIDE também vê o módulo', () => {
    const hrefs = visibleMenu(new Set(['ops.order.decide'])).map((i) => i.href);
    assert.ok(hrefs.includes('/esteira'));
    assert.ok(hrefs.includes('/esteiras'));
  });

  test('permissão de um módulo não abre a tela de outro', () => {
    const hrefs = visibleMenu(new Set(['ap.payable.manage'])).map((i) => i.href);
    assert.ok(hrefs.includes('/contas-a-pagar'));
    assert.ok(!hrefs.includes('/contas-a-receber'));
    assert.ok(!hrefs.includes('/relacionamentos'));
  });

  /**
   * ⛔ `ap` é prefixo de nada mais, mas a armadilha existe: um módulo chamado
   * `app` faria `p.startsWith('ap')` casar. O ponto no prefixo é o que impede.
   */
  test('⛔ o prefixo inclui o PONTO — `ap` não casa com `apx.algo`', () => {
    assert.equal(hasModuleAccess(new Set(['apx.coisa.fazer']), 'ap'), false);
    assert.equal(hasModuleAccess(new Set(['ap.payable.manage']), 'ap'), true);
  });

  test('core.* não conta como módulo', () => {
    assert.deepEqual(accessibleModules(new Set(['core.module.install'])), []);
    assert.deepEqual(
      accessibleModules(new Set(['core.module.install', 'crm.party.manage', 'ops.order.decide'])),
      ['crm', 'ops'],
    );
  });
});

describe('o menu não mente sobre o que existe', () => {
  /**
   * ⭐ **Toda rota do menu tem uma página de verdade.**
   *
   * Um item que aponta para uma rota inexistente é um 404 que só aparece
   * quando alguém clica — e num menu filtrado por permissão, só aparece para
   * quem tem a permissão certa, que pode ser ninguém durante meses.
   */
  test('toda rota do menu existe em apps/portal/src/app', () => {
    const rotas = readdirSync(PAGES, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `/${d.name}`);

    for (const item of ALL_MENU_ITEMS) {
      if (item.href === '/') continue; // a raiz é `app/page.tsx`, não pasta
      assert.ok(
        rotas.includes(item.href),
        `o menu aponta para ${item.href}, que não existe em apps/portal/src/app`,
      );
    }
  });

  /**
   * ⭐ **Todo módulo do menu está no catálogo da plataforma.**
   *
   * Se alguém acrescentar um item para um módulo que o seed não registra, o
   * item nunca apareceria para ninguém — porque ninguém teria permissão dele —
   * e o defeito seria invisível. Este teste o torna visível na hora.
   */
  test('todo moduleId do menu é um módulo registrado no seed', () => {
    const seed = readFileSync(SEED, 'utf8');
    const registrados = new Set(
      [...seed.matchAll(/^\s*'([a-z-]+)',\s*$/gm)].map((m) => m[1] as string),
    );

    for (const item of ALL_MENU_ITEMS) {
      if (item.moduleId === null) continue;
      assert.ok(
        registrados.has(item.moduleId),
        `o menu tem item do módulo "${item.moduleId}", que o seed não registra`,
      );
    }
  });

  test('⛔ e o inverso: todo módulo do catálogo tem tela no menu', () => {
    // Um módulo publicado na Store que o cliente instala e não encontra é o
    // pior estado possível: ele pagou, o botão sumiu, e nada dá erro.
    const seed = readFileSync(SEED, 'utf8');
    const publicados = [...seed.matchAll(/insert into core\.module_registry[\s\S]*?values \(\s*'([a-z-]+)'/g)]
      .map((m) => m[1] as string);

    assert.ok(publicados.length >= 6, 'a varredura do seed ficou cega');

    const noMenu = new Set(ALL_MENU_ITEMS.map((i) => i.moduleId).filter((m) => m !== null));
    for (const modulo of publicados) {
      assert.ok(noMenu.has(modulo), `o módulo "${modulo}" está publicado e não tem tela no menu`);
    }
  });
});
