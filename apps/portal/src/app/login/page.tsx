import { PRODUCT } from '@alsham/config';

import { hasSupabase } from '@/lib/supabase/env';
import { LoginForm } from '@/components/login-form';

export const dynamic = 'force-dynamic';

/**
 * A porta de entrada — a primeira coisa que qualquer visitante vê.
 *
 * Direção de arte: Obsidian de fundo, o **Sol Único** dourado subindo no hero —
 * um só por peça (IDENTIDADE-VISUAL §5.1) — e a "planta antes da obra" do §5.2.
 * Nenhum estado usa o ouro.
 *
 * ⭐ O hero é um asset ESTÁTICO em `public/hero-login.webp`, gerado UMA vez pelo
 * motor de arte ALSHAM e commitado (sem gerar em runtime, sem URL de provedor
 * que expira — o Storage do Core ainda não existe). Conferido: sem marca d'água
 * e sem texto de fornecedor (Lei do Motor). O `hero-painel.svg` cobre o Painel;
 * aqui, a imagem dá a profundidade orgânica que o traço vetorial não alcança.
 */
export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col py-14">
      <div className="bos-sheen overflow-hidden rounded-xl border border-bos-border bg-bos-surface">
        {/* O HERO — o Sol Único subindo. Decorativo (aria-hidden): a porta é o
            formulário. Um scrim funde a base na superfície do cartão. */}
        <div className="relative">
          <div
            aria-hidden
            className="h-44 w-full bg-cover bg-center"
            style={{ backgroundImage: 'url(/hero-login.webp)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, transparent 42%, color-mix(in srgb, var(--bos-surface) 80%, transparent) 80%, var(--bos-surface) 100%)',
            }}
          />
        </div>

        <div className="flex flex-col items-center px-6 pb-9">
          <p className="bos-eyebrow bos-eyebrow-center mb-3">A porta de entrada</p>
          <h1 className="font-display text-3xl tracking-tight text-bos-text">
            {PRODUCT.displayName}
          </h1>
          <p className="mt-3 mb-9 max-w-xs text-center font-display text-base italic text-bos-muted">
            A empresa não compra um sistema — ela monta o dela.
          </p>

          <LoginForm demo={!hasSupabase()} />
        </div>
      </div>
    </div>
  );
}
