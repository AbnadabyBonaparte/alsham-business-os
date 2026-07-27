'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { signOutAction, switchTenantAction } from '@/app/auth-actions';
import type { TenantRef } from '@/lib/session';

/**
 * Quem está logado, em qual empresa, e como sair.
 *
 * ⚠️ Trocar de empresa aqui é uma **preferência**. Quem confere se a pessoa
 * pode é o servidor (`switchTenantAction` cruza com os vínculos) e, no fim, a
 * RLS. Este seletor só mostra o que a sessão já trouxe.
 */
export function TenantSwitcher({
  tenants,
  active,
  email,
}: {
  tenants: readonly TenantRef[];
  active: TenantRef;
  email: string | null;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function trocar(id: string) {
    if (id === active.id) return;
    setErro(null);
    startTransition(async () => {
      const r = await switchTenantAction(id);
      if (r.ok) router.refresh();
      else setErro(r.message);
    });
  }

  return (
    <div className="ml-auto flex flex-wrap items-center gap-3">
      {tenants.length > 1 ? (
        <label className="flex items-center gap-2">
          <span className="sr-only">Empresa</span>
          <select
            value={active.id}
            disabled={pending}
            onChange={(e) => trocar(e.target.value)}
            className="rounded-md border border-bos-border bg-bos-surface px-3 py-1.5 text-xs text-bos-text focus:border-bos-accent focus:outline-none disabled:opacity-50"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="text-xs text-bos-muted">{active.name}</span>
      )}

      {email ? <span className="hidden text-xs text-bos-muted sm:inline">{email}</span> : null}

      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-md px-2 py-1 text-xs text-bos-muted transition-colors duration-200 hover:text-bos-text"
        >
          Sair
        </button>
      </form>

      {erro ? <span className="text-xs text-bos-danger">{erro}</span> : null}
    </div>
  );
}
