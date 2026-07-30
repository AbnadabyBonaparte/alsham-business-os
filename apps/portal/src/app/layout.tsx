import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { PRODUCT, COMPANY } from '@alsham/config';

import { visibleMenu, ALL_MENU_ITEMS, type MenuItem } from '@alsham/permissions';

import { resolveSession } from '@/lib/session';
import { loadAllPermissions, getStorePort } from '@/lib/data';
import { groupModuleMenu } from '@/lib/menu-groups';
import { TenantSwitcher } from '@/components/tenant-switcher';
import { Atmosphere, Grain } from '@/components/atmosphere';
import { NavLink } from '@/components/nav-link';
import { ModulesMenu } from '@/components/modules-menu';
import { EngineerPresence } from '@/components/engineer-presence';

import './globals.css';

export const metadata: Metadata = {
  title: `Conciliação & Aprovações · ${PRODUCT.displayName}`,
  description: 'Painel do tenant — Módulo 1: Conciliação & Aprovações.',
};

/**
 * O layout raiz.
 *
 * Direção de arte: `docs/canon/IDENTIDADE-VISUAL.md`. Fundo Obsidian, superfície
 * Midnight Ink, bordas sempre alpha, e **o ouro só como acento** — nunca como
 * cor de estado.
 *
 * As fontes vêm por `@font-face` do sistema, não por `next/font/google`: uma
 * fonte baixada em tempo de build é uma dependência de rede no build, e o
 * fallback declarado em `--bos-font-*` já é a família certa quando ela existe
 * na máquina.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await resolveSession();
  const logado = session.mode === 'authenticated';

  /**
   * ⭐ **O MENU É DECIDIDO NO PACOTE, com UMA leitura de permissões.**
   *
   * A Etapa 10 deixou a dívida escrita aqui mesmo: os itens nasceram antes do
   * instalador, e uniformizá-los exigiria *"uma leitura de permissões só para o
   * menu inteiro em vez de uma por módulo"*. É isto. Antes eram três idas ao
   * banco (uma por módulo filtrado) e cinco itens sem filtro nenhum; agora é
   * uma consulta, e `visibleMenu()` — em `@alsham/permissions` — responde por
   * todos.
   *
   * ⚠️ Esconder o item é **cortesia**, não segurança. Quem impede de verdade é
   * a RLS: sem permissão do módulo, `<modulo>.can_access()` devolve falso e a
   * tela não carrega linha nenhuma, mesmo com a URL digitada à mão.
   *
   * ⚠️ Qual rota exige o quê **não se decide aqui** (Regra de Ouro §5.3): a
   * tabela mora em `packages/permissions/src/menu.ts`, com teste que confere
   * que toda rota existe e que todo módulo publicado tem tela.
   */
  const permissoes = logado ? await loadAllPermissions() : new Set<string>();

  // ⚠️ A leitura por módulo que existia aqui para Compras foi ABSORVIDA pelo
  // menu de leitura única. Ela sobreviveria ao merge sem quebrar nada — e por
  // isso mesmo tinha de sair: duas fontes decidindo o mesmo item de menu é
  // exatamente a dívida que esta etapa pagou.
  //
  // ⭐ **Demonstração mostra o produto inteiro.** Sem banco (`mode: 'demo'`)
  // não há permissões a ler, e filtrar por elas deixaria o topo com só os três
  // itens de Core. O demo então usa o menu COMPLETO — a mesma escolha honesta
  // da Store, que sem banco exibe o catálogo inteiro. Fora do demo, quem decide
  // continua sendo `visibleMenu()` no pacote, intocado.
  const menu = session.mode === 'demo' ? ALL_MENU_ITEMS : visibleMenu(permissoes);

  // ⭐ **O topo, agrupado por domínio.** O `domain_key` de cada módulo vem do
  // CATÁLOGO — a mesma fonte que a Store lê (`getStorePort().loadCatalog()`),
  // nunca uma segunda tabela de rótulos (Sol Único). Os nomes e a ordem dos
  // domínios são os de `store-taxonomy.ts` (PR #27).
  //
  // ⚠️ **O topo nunca cai.** Se o catálogo não vier, o mapa fica vazio e o menu
  // volta a ser a fileira flat de antes — degradação, nunca tela quebrada.
  const navVisivel = session.mode !== 'anonymous' && session.mode !== 'no-access';
  let moduleDomain = new Map<string, string>();
  if (navVisivel) {
    try {
      const catalogo = await (await getStorePort()).loadCatalog();
      moduleDomain = new Map(
        catalogo
          .filter((e) => e.domainKey)
          .map((e) => [e.moduleId, e.domainKey as string]),
      );
    } catch {
      // Menu não derruba página: sem catálogo, cai no fallback flat abaixo.
    }
  }
  const podeAgrupar = moduleDomain.size > 0;
  const { core, groups } = groupModuleMenu(menu, moduleDomain);
  const home = core.find((i: MenuItem) => i.href === '/');
  const coreRestante = core.filter((i: MenuItem) => i.href !== '/');

  return (
    <html lang="pt-BR">
      <body className="min-h-screen text-bos-text">
        {/* A atmosfera da sala atual (z: -1) e a película de grão (z: 50) —
            camadas de apresentação puras; nenhuma intercepta clique ou dado. */}
        <Atmosphere />
        <Grain />

        <div className="flex min-h-screen flex-col">
          <header className="border-b border-bos-border">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
              <Link href="/" className="flex items-center gap-3">
                {/* O Sol Único — um só por peça (IDENTIDADE-VISUAL §5.1):
                    o arco e o núcleo, desenhados, nunca dois sóis. */}
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-5 text-bos-accent"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="12" r="9" strokeWidth="1" strokeOpacity="0.55" strokeDasharray="40 8" />
                  <circle cx="12" cy="12" r="3.5" strokeWidth="1" />
                </svg>
                <span className="font-display text-lg tracking-tight text-bos-text">
                  {PRODUCT.displayName}
                </span>
              </Link>

              {navVisivel ? (
                <nav className="flex flex-wrap items-center gap-1 text-sm">
                  {podeAgrupar ? (
                    <>
                      {/* Core: links diretos, sempre visíveis, sem categoria. */}
                      {home ? <NavLink href={home.href}>{home.label}</NavLink> : null}
                      {/* Todo o resto: um gatilho só, mega-menu por domínio. */}
                      <ModulesMenu groups={groups} />
                      {coreRestante.map((item) => (
                        <NavLink key={item.href} href={item.href}>
                          {item.label}
                        </NavLink>
                      ))}
                    </>
                  ) : (
                    // Fallback: catálogo indisponível — a fileira flat de antes,
                    // para o topo nunca ficar sem navegação.
                    menu.map((item) => (
                      <NavLink key={item.href} href={item.href}>
                        {item.label}
                      </NavLink>
                    ))
                  )}
                </nav>
              ) : null}

              {logado ? (
                <TenantSwitcher
                  tenants={session.tenants}
                  active={session.activeTenant}
                  email={session.email}
                />
              ) : null}
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">{children}</main>

          {/* O rodapé de pertencimento — todo mundo declara no rodapé a que
              universo pertence (canon da Casa). Sóbrio: um fio, uma linha. */}
          <footer className="mt-16">
            <div className="bos-hairline" aria-hidden />
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-6 py-7 text-xs text-bos-muted">
              <p>
                {COMPANY.legalName} · Powered by <span className="text-bos-text">ALSHAM</span>
              </p>
              <p className="uppercase tracking-[0.22em] text-bos-muted/80">
                Universo Bonaparte · construído para durar
              </p>
            </div>
          </footer>
        </div>

        {/* ⭐ O ENGENHEIRO — presente em toda página do shell autenticado (e no
            demo). Client component, fixo num canto; abre o painel imersivo e
            fala com `/api/engineer` sob a sessão do usuário. Fora do shell
            (login, sem acesso) ele não aparece — não há tenant para servir. */}
        {navVisivel ? <EngineerPresence /> : null}
      </body>
    </html>
  );
}
