'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { MenuItem } from '@alsham/permissions';

/**
 * ⭐ A PALETA DE COMANDOS — ⌘K / Ctrl+K (Onda UX Viva 5/6).
 *
 * Um lançador de teclado para PULAR para qualquer tela — o mesmo gesto do
 * Spotlight, do VS Code, do Linear. Não é uma navegação nova: é um atalho para
 * a que já existe.
 *
 * ⚠️ **Sol Único no índice.** A paleta busca EXATAMENTE os itens que o menu do
 * topo mostra — `visibleMenu(permissoes)` (ou o catálogo inteiro no demo),
 * decididos no pacote `@alsham/permissions`. Não há uma segunda lista de rotas
 * a manter em dia. Uma tela que o perfil não vê no topo também não aparece
 * aqui; esconder é cortesia — quem impede de verdade é a RLS.
 *
 * ⚠️ **O casamento é o MESMO da Store:** um item casa por NOME (label) ou por
 * `moduleId`. Digitar "cash", "caixa" ou "fluxo" leva ao mesmo lugar. Sem lib
 * fuzzy — `includes()` basta para um índice deste tamanho, como na vitrine.
 *
 * ⛔ Zero dependência nova, zero emoji: o ícone é traço inline (geometria
 * Lucide, MIT), a cor sai dos tokens `--bos-*`, o ouro só no realce da linha
 * selecionada (é ação, não estado).
 */

interface PaletteItem {
  readonly href: string;
  readonly label: string;
  readonly moduleId: string | null;
}

export function CommandPalette({ items }: { items: readonly MenuItem[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const base: readonly PaletteItem[] = useMemo(
    () => items.map((i) => ({ href: i.href, label: i.label, moduleId: i.moduleId })),
    [items],
  );

  // O casador da Store, re-usado: NOME ou moduleId; busca vazia casa tudo.
  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q === '') return base;
    return base.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.moduleId !== null && i.moduleId.toLowerCase().includes(q)),
    );
  }, [base, busca]);

  // ⌘K / Ctrl+K abre e fecha; Esc fecha. Global, mas o toggle não dispara
  // quando o foco já está num campo de texto de outra tela (só o atalho, que é
  // com meta/ctrl, escapa disso de propósito).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAberto((o) => !o);
      } else if (e.key === 'Escape') {
        setAberto(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ao abrir: zera a busca, foca o campo. Ao fechar: nada a limpar além do foco.
  useEffect(() => {
    if (aberto) {
      setBusca('');
      setAtivo(0);
      // o foco no próximo frame — o input já montou.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [aberto]);

  // A seleção nunca aponta para fora da lista filtrada.
  useEffect(() => {
    setAtivo((a) => (a >= resultados.length ? 0 : a));
  }, [resultados.length]);

  const irPara = useCallback(
    (href: string) => {
      setAberto(false);
      router.push(href);
    },
    [router],
  );

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAtivo((a) => Math.min(a + 1, Math.max(resultados.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const alvo = resultados[ativo];
      if (alvo !== undefined) irPara(alvo.href);
    }
  }

  // Mantém a linha ativa visível ao navegar pelo teclado.
  useEffect(() => {
    const lista = listaRef.current;
    if (lista === null) return;
    const el = lista.children[ativo] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [ativo]);

  return (
    <>
      {/* O gatilho no topo — a descoberta do atalho mora aqui. */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="ml-auto inline-flex items-center gap-2 rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-muted transition-colors duration-200 hover:border-bos-accent/60 hover:text-bos-text"
        aria-label="Buscar telas (Ctrl+K)"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="hidden rounded border border-bos-border px-1.5 py-0.5 font-mono text-[10px] text-bos-muted sm:inline">
          Ctrl K
        </kbd>
      </button>

      {aberto ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Buscar telas"
          className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
        >
          {/* O véu — fecha ao clicar fora. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setAberto(false)}
            className="absolute inset-0 cursor-default bg-bos-bg/70 backdrop-blur-sm"
          />

          <div className="bos-sheen bos-pop relative w-full max-w-xl overflow-hidden rounded-lg border border-bos-border bg-bos-surface shadow-2xl">
            <div className="flex items-center gap-3 border-b border-bos-border px-4 py-3">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-4 shrink-0 text-bos-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Ir para uma tela — nome ou módulo…"
                className="w-full bg-transparent text-sm text-bos-text placeholder:text-bos-muted focus:outline-none"
                aria-label="Buscar telas por nome ou módulo"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="shrink-0 rounded border border-bos-border px-1.5 py-0.5 font-mono text-[10px] text-bos-muted">
                Esc
              </kbd>
            </div>

            {resultados.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-bos-muted">
                Nenhuma tela encontrada. Só aparecem as que o seu perfil já pode abrir.
              </p>
            ) : (
              <ul ref={listaRef} className="max-h-[52vh] overflow-y-auto py-1.5">
                {resultados.map((r, i) => {
                  const sel = i === ativo;
                  return (
                    <li key={r.href}>
                      <button
                        type="button"
                        onClick={() => irPara(r.href)}
                        onMouseMove={() => setAtivo(i)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150 ${
                          sel ? 'bg-bos-accent/10' : ''
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`h-4 w-px shrink-0 ${sel ? 'bg-bos-accent' : 'bg-transparent'}`}
                        />
                        <span className={`text-sm ${sel ? 'text-bos-text' : 'text-bos-muted'}`}>
                          {r.label}
                        </span>
                        <span className="ml-auto font-mono text-[11px] text-bos-muted">
                          {r.moduleId ?? 'core'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
