import { cookies } from 'next/headers';

import { createSupabaseServerClient } from './supabase/server';
import { hasSupabase } from './supabase/env';

/**
 * Quem está usando o painel, e em nome de qual tenant.
 *
 * ⭐ **A REGRA DE SEGURANÇA DESTA ETAPA:**
 *
 * O `tenant_id` **nunca** vem da URL, do corpo do formulário ou de qualquer
 * coisa que o cliente controle. Ele vem sempre da sessão cruzada com
 * `core.memberships`, resolvida no servidor.
 *
 * Existe um cookie de tenant ativo, mas ele é **preferência, não autoridade**:
 * o valor é conferido contra a lista de vínculos antes de ser aceito. Um
 * cookie forjado com o tenant de outra empresa não abre nada — cai no
 * primeiro vínculo legítimo do usuário.
 *
 * E mesmo que tudo isso falhasse, a RLS ainda barraria: `core.tenants` só
 * devolve a linha para quem é membro ativo. São duas camadas, de propósito.
 */

export const TENANT_COOKIE = 'bos_tenant';

export interface TenantRef {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export type Session =
  /** Sem banco configurado: o painel roda com dado fabricado. */
  | { readonly mode: 'demo' }
  /** Banco configurado, ninguém autenticado. */
  | { readonly mode: 'anonymous' }
  /** Autenticado, mas sem nenhum vínculo — não é erro, é falta de convite. */
  | { readonly mode: 'no-access'; readonly userId: string; readonly email: string | null }
  | {
      readonly mode: 'authenticated';
      readonly userId: string;
      readonly email: string | null;
      readonly tenants: readonly TenantRef[];
      readonly activeTenant: TenantRef;
    };

/**
 * Resolve a sessão a partir dos cookies da requisição.
 *
 * Roda no servidor, sempre. Não existe versão de cliente disto.
 */
export async function resolveSession(): Promise<Session> {
  if (!hasSupabase()) return { mode: 'demo' };

  const db = await createSupabaseServerClient();
  if (!db) return { mode: 'demo' };

  // `getUser()` valida o token contra o servidor de auth. `getSession()` leria
  // o cookie e acreditaria nele — que é o modo de confiar num token forjado.
  const { data, error } = await db.auth.getUser();
  const user = data?.user;
  if (error || !user) return { mode: 'anonymous' };

  const email = user.email ?? null;

  // Os tenants em que o usuário é membro ATIVO. A RLS de `core.tenants` já
  // limita o que ele enxerga; o join é para trazer nome e slug.
  const { data: rows, error: memErr } = await db
    .schema('core')
    .from('memberships')
    .select('tenant_id, status, tenants:tenant_id (id, slug, name)')
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (memErr) {
    // Falha ao ler vínculo não vira "acesso liberado". Vira sem acesso.
    return { mode: 'no-access', userId: user.id, email };
  }

  const tenants: TenantRef[] = (rows ?? [])
    .map((r) => {
      const t = r.tenants as unknown as TenantRef | TenantRef[] | null;
      const one = Array.isArray(t) ? t[0] : t;
      return one && one.id ? { id: one.id, slug: one.slug, name: one.name } : null;
    })
    .filter((t): t is TenantRef => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (tenants.length === 0) return { mode: 'no-access', userId: user.id, email };

  const store = await cookies();
  const preferido = store.get(TENANT_COOKIE)?.value;

  // ⚠️ O cookie só vale se apontar para um vínculo real. Não é confiança: é
  // conferência.
  const activeTenant =
    tenants.find((t) => t.id === preferido) ?? (tenants[0] as TenantRef);

  return { mode: 'authenticated', userId: user.id, email, tenants, activeTenant };
}
