import { PRODUCT } from '@alsham/config';

import { hasSupabase } from '@/lib/supabase/env';
import { LoginForm } from '@/components/login-form';

export const dynamic = 'force-dynamic';

/**
 * A porta de entrada.
 *
 * Direção de arte: Obsidian de fundo, o **Sol Único** dourado no topo — um só
 * por peça (IDENTIDADE-VISUAL §5.1) — e a textura *blueprint* atrás, que é a
 * "planta antes da obra" do §5.2. Nenhum estado usa o ouro.
 */
export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-14">
      {/* O sol desta cena é o arco de horizonte da atmosfera (atmosphere.tsx)
          — um só por peça (IDENTIDADE-VISUAL §5.1); a marca do header não conta
          dois: é a marca. */}
      <p className="bos-eyebrow bos-eyebrow-center mt-16 mb-3">A porta de entrada</p>
      <h1 className="font-display text-3xl tracking-tight text-bos-text">
        {PRODUCT.displayName}
      </h1>
      <p className="mt-3 mb-9 max-w-xs text-center font-display text-base italic text-bos-muted">
        A empresa não compra um sistema — ela monta o dela.
      </p>

      <LoginForm demo={!hasSupabase()} />
    </div>
  );
}
