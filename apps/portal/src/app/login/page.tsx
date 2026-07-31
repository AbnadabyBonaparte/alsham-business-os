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
 * e sem texto de fornecedor (Lei do Motor).
 *
 * ⭐ **ESCALA (correção do dono):** o hero é a OBRA — cobre a TELA INTEIRA
 * (full-bleed, `fixed inset-0`, `cover`/`center`), e o cartão de login FLUTUA
 * por cima como um vidro fosco Obsidian. Antes era uma faixa de 176px espremida
 * DENTRO do cartão; uma faixa fina não entrega a experiência de obra de arte. O
 * scrim é uma VINHETA (escurece as bordas e adensa atrás do cartão para a
 * legibilidade do formulário), nunca um gradiente que apaga a imagem inteira.
 */
export default function LoginPage() {
  return (
    <>
      {/* ⭐ O HERO — FUNDO DA TELA INTEIRA, atrás do cartão. Fixo, cobre 100vh.
          Decorativo (aria-hidden): a porta é o formulário. */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/hero-login.webp)' }}
      />
      {/* A VINHETA de legibilidade: o centro respira a obra; as bordas e o miolo
          atrás do cartão adensam no Obsidian para o texto ter contraste. Sem
          gradiente de cima a baixo que apagaria a imagem. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(130% 100% at 50% 42%, transparent 26%, color-mix(in srgb, var(--bos-obsidian) 52%, transparent) 66%, color-mix(in srgb, var(--bos-obsidian) 86%, transparent) 100%)',
        }}
      />

      {/* O cartão flutua, centralizado, com espaço de respiro para a obra
          aparecer nas bordas — em desktop e em tela vertical estreita. */}
      <div className="relative z-10 flex min-h-[calc(100vh-8rem)] items-center justify-center px-2 py-10">
        <div
          className="bos-sheen w-full max-w-md rounded-2xl border border-bos-border px-8 py-11 shadow-2xl backdrop-blur-xl"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bos-surface) 68%, transparent)',
          }}
        >
          <div className="flex flex-col items-center">
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
    </>
  );
}
