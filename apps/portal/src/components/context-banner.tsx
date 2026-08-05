'use client';

import { useEffect, useState } from 'react';

import { PAGE_BANNERS, type BannerKey } from '@/lib/marketing/banners';

/**
 * ⭐ **O BANNER CONTEXTUAL — a voz de marca sem interromper.**
 *
 * Uma faixa discreta que roda, em silêncio, entre 2 e 3 frases VERDADEIRAS da
 * tela onde está (o dado vem de `@/lib/marketing/banners` — cada linha ancorada
 * num fato real do produto). Nada de popup, nada de modal, nada de "assine já":
 * é a mesma superfície e os mesmos tokens do resto do portal, só com a frase
 * institucional trocando devagar.
 *
 * ♿ **Respeita `prefers-reduced-motion`:** quem pede menos movimento vê UMA
 * frase, fixa — a rotação nem começa. A troca é por opacidade (sem layout
 * shift), e a região é `aria-live="off"` para não tagarelar no leitor de tela.
 *
 * ⛔ Client component mínimo: só um timer e um índice. A decisão de O QUE dizer
 * é pura e vive no pacote de dados; aqui é só a PELE que gira.
 */
export function ContextBanner({
  banner,
  intervalMs = 7000,
}: {
  /** A chave do conjunto de frases desta tela (ex.: 'confianca', 'painel'). */
  banner: BannerKey;
  /** Quanto tempo cada frase fica no ar antes de trocar. Padrão 7 s. */
  intervalMs?: number;
}) {
  const facts = PAGE_BANNERS[banner];
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Uma só frase, ou sem frase: nada a girar.
    if (!facts || facts.length < 2) return;
    // Quem pede menos movimento não recebe rotação — fica na primeira, fixa.
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const fadeOut = setInterval(() => {
      setVisible(false);
      // Troca a frase no vale do fade, depois reacende.
      const swap = setTimeout(() => {
        setI((prev) => (prev + 1) % facts.length);
        setVisible(true);
      }, 400);
      return () => clearTimeout(swap);
    }, intervalMs);

    return () => clearInterval(fadeOut);
  }, [facts, intervalMs]);

  if (!facts || facts.length === 0) return null;

  const atual = facts[Math.min(i, facts.length - 1)]!;
  // `atual` já é a frase (string) — o mapa carrega só o texto visível.

  return (
    <aside
      aria-live="off"
      className="bos-sheen mb-6 flex items-start gap-3 rounded-lg border border-bos-border bg-bos-surface px-4 py-3"
    >
      {/* A fagulha do Sol, discreta — acento, nunca bloco (IDENTIDADE-VISUAL §5.1). */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="mt-0.5 size-4 shrink-0 text-bos-accent/60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
      </svg>
      <p
        className={`text-sm text-bos-muted transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {atual}
      </p>
    </aside>
  );
}
