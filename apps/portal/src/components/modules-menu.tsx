'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { MenuDomainGroup } from '@/lib/menu-groups';

/**
 * O gatilho "Módulos" do topo — abre um mega-menu categorizado por domínio.
 *
 * ⭐ Substitui a fileira flat de dezenas de itens que aparecia em toda página.
 * Os itens de Core (Painel, Store, Ajustes) continuam links diretos no header;
 * tudo o que é módulo mora aqui dentro, agrupado por domínio na ordem da
 * Taxonomia (a mesma fonte da Store — ver `menu-groups.ts`).
 *
 * ⚠️ **Só apresentação.** Quem decide o que aparece é `visibleMenu()` no
 * pacote (permissão), e a RLS no banco. Este componente recebe os grupos
 * prontos e desenha. Domínio sem item visível nem chega aqui.
 *
 * Fecha ao: clicar fora, apertar Escape, ou navegar (o `pathname` muda).
 *
 * Pele: Midnight Ink, borda alpha dourada, ouro só como acento
 * (IDENTIDADE-VISUAL §7). Nenhum HEX cru.
 */
export function ModulesMenu({ groups }: { groups: readonly MenuDomainGroup[] }) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Está numa tela de módulo agora? Então o gatilho fica marcado.
  const ativoAlgum = groups.some((g) =>
    g.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );

  // Navegou → fecha. Cobre o clique num link e a navegação por outro caminho.
  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  // Clicar fora e Escape fecham.
  useEffect(() => {
    if (!aberto) return;

    function onClickFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }

    document.addEventListener('mousedown', onClickFora);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickFora);
      document.removeEventListener('keydown', onEscape);
    };
  }, [aberto]);

  if (groups.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls="mega-menu-modulos"
        className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors duration-200 ${
          aberto || ativoAlgum
            ? 'text-bos-text'
            : 'text-bos-muted hover:bg-bos-surface hover:text-bos-text'
        }`}
      >
        Módulos
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={`size-3.5 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberto ? (
        <div
          id="mega-menu-modulos"
          role="menu"
          aria-label="Módulos por domínio"
          className="bos-sheen absolute left-0 z-50 mt-2 max-h-[70vh] w-screen max-w-[calc(100vw-1.5rem)] overflow-auto rounded-lg border border-bos-border bg-bos-surface p-5 sm:w-[42rem] sm:max-w-[80vw]"
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <section key={g.key} role="none">
                <p className="bos-eyebrow mb-2">{g.name}</p>
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((item) => {
                    const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href} role="none">
                        <Link
                          href={item.href}
                          role="menuitem"
                          aria-current={ativo ? 'page' : undefined}
                          onClick={() => setAberto(false)}
                          className={`block rounded-md px-2.5 py-1.5 text-sm transition-colors duration-200 ${
                            ativo
                              ? 'bg-bos-elevated/50 text-bos-text'
                              : 'text-bos-muted hover:bg-bos-elevated/40 hover:text-bos-text'
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
