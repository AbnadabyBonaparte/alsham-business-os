import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { PRODUCT, COMPANY } from '@alsham/config';

import { visibleMenu } from '@alsham/permissions';

import { resolveSession } from '@/lib/session';
import { loadAllPermissions } from '@/lib/data';
import { TenantSwitcher } from '@/components/tenant-switcher';

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
  const menu = visibleMenu(permissoes);

  // ⚠️ A leitura por módulo que existia aqui para Compras foi ABSORVIDA pelo
  // menu de leitura única. Ela sobreviveria ao merge sem quebrar nada — e por
  // isso mesmo tinha de sair: duas fontes decidindo o mesmo item de menu é
  // exatamente a dívida que esta etapa pagou.

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-bos-bg text-bos-text">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-bos-border">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
              <Link href="/" className="flex items-center gap-3">
                {/* O Sol Único — um só por peça (IDENTIDADE-VISUAL §5.1). */}
                <span
                  aria-hidden
                  className="block size-3 rounded-full border border-bos-accent"
                />
                <span className="font-display text-lg tracking-tight text-bos-text">
                  {PRODUCT.displayName}
                </span>
              </Link>

              {session.mode !== 'anonymous' && session.mode !== 'no-access' ? (
                <nav className="flex flex-wrap items-center gap-1 text-sm">
                  {menu.map((item) => (
                    <NavLink key={item.href} href={item.href}>
                      {item.label}
                    </NavLink>
                  ))}
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

          <footer className="border-t border-bos-border">
            <div className="mx-auto w-full max-w-7xl px-6 py-6 text-xs text-bos-muted">
              {COMPANY.legalName} · Powered by ALSHAM
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-bos-muted transition-colors duration-200 hover:bg-bos-surface hover:text-bos-text"
    >
      {children}
    </Link>
  );
}
