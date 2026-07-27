import { PRODUCT, COMPANY } from '@alsham/config';

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
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-12">
      {/* O Sol Único. */}
      <span aria-hidden className="mb-6 block size-10 rounded-full border border-bos-accent" />

      <h1 className="font-display text-2xl tracking-tight text-bos-text">
        {PRODUCT.displayName}
      </h1>
      <p className="mt-2 mb-8 text-center text-sm text-bos-muted">
        Entre para acessar o painel da sua empresa.
      </p>

      <LoginForm demo={!hasSupabase()} />

      <p className="mt-10 text-center text-xs text-bos-muted">
        {COMPANY.legalName} · Powered by ALSHAM
      </p>
    </div>
  );
}
