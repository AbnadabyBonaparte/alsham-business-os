import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { PRODUCT, COMPANY } from '@alsham/config';

import { PERMISSIONS as AP_PERMISSIONS } from '@alsham/accounts-payable';

import { resolveSession } from '@/lib/session';
import { getApPort } from '@/lib/data';
import { TenantSwitcher } from '@/components/tenant-switcher';

import './globals.css';

export const metadata: Metadata = {
  title: `Conciliação & Aprovações · ${PRODUCT.displayName}`,
  description: 'Painel do tenant — Módulo 1: Conciliação & Aprovações.',
};

type Rota =
  | '/conciliacao'
  | '/aprovacoes'
  | '/importar'
  | '/fechamento'
  | '/campanhas'
  | '/contas-a-pagar'
  | '/store';

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
   * ⭐ **O item de menu só existe para quem tem acesso ao módulo.**
   *
   * A pergunta é feita ao banco, sob RLS: `ap.*` em `core.role_permissions` só
   * aparece para quem instalou o módulo e recebeu a permissão pelo instalador.
   * Módulo não instalado ⇒ conjunto vazio ⇒ nenhum item, e a tela não vira uma
   * promessa de algo que não foi contratado.
   *
   * ⚠️ Esconder o item é **cortesia**, não segurança. Quem impede de verdade é
   * a RLS: sem `ap.payable.manage` nem `ap.payable.cancel`, `ap.can_access()`
   * devolve falso e a tela não carrega linha nenhuma, mesmo com a URL digitada
   * à mão.
   *
   * ⚠️ Os outros itens ainda NÃO são filtrados assim — nasceram antes do
   * instalador existir. Uniformizá-los é mudança própria, com uma leitura de
   * permissões só para o menu inteiro em vez de uma por módulo; fazer isso de
   * carona nesta etapa acrescentaria uma consulta por item sem ninguém ter
   * pedido.
   */
  const temContasAPagar = logado
    ? await (async () => {
        try {
          const port = await getApPort();
          const permissoes = await port.listPermissions();
          return (
            permissoes.has(AP_PERMISSIONS.payableManage) ||
            permissoes.has(AP_PERMISSIONS.payableCancel)
          );
        } catch {
          // Menu não derruba página. Sem resposta, o item some — e a tela do
          // módulo continua alcançável por URL para quem tiver acesso.
          return false;
        }
      })()
    : false;

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
                  <NavLink href="/importar">Importar</NavLink>
                  <NavLink href="/conciliacao">Conciliação</NavLink>
                  <NavLink href="/aprovacoes">Aprovações</NavLink>
                  <NavLink href="/fechamento">Fechamento</NavLink>
                  <NavLink href="/campanhas">Campanhas</NavLink>
                  {temContasAPagar ? (
                    <NavLink href="/contas-a-pagar">Contas a pagar</NavLink>
                  ) : null}
                  <NavLink href="/store">Store</NavLink>
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

function NavLink({ href, children }: { href: Rota; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-bos-muted transition-colors duration-200 hover:bg-bos-surface hover:text-bos-text"
    >
      {children}
    </Link>
  );
}
