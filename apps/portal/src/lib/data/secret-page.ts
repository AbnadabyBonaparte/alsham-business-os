import { createSupabaseServerClient } from '../supabase/server';
import { resolveSession } from '../session';

/**
 * ⭐ **A PORTA DA PÁGINA RESERVADA — Core, leitura única sob RLS.**
 *
 * O conteúdo vive no banco (`core.secret_pages`, 0120), nunca em código (§3): o
 * dono o insere direto no banco. Esta porta só o LÊ, sob a sessão do usuário —
 * a função `core.read_secret_page` valida o vínculo e resolve a página dentro
 * do próprio tenant, então saber o slug de outro tenant não abre nada.
 *
 * ⛔ Sem sessão autenticada num tenant, não há página. Devolve `null`, e a rota
 * responde 404 — nunca se revela a existência de um endereço a quem não pode vê-lo.
 */
export interface SecretPage {
  readonly title: string;
  readonly body: string;
  readonly updatedAt: string;
}

export async function loadSecretPage(slug: string): Promise<SecretPage | null> {
  const session = await resolveSession();
  // Demo, anônimo ou sem vínculo: nada a mostrar. O conteúdo é real ou não é —
  // nunca fabricado (Lei 7), e nunca visível sem login no tenant.
  if (session.mode !== 'authenticated') return null;

  const db = await createSupabaseServerClient();
  if (!db) return null;

  const { data, error } = await db
    .schema('core')
    .rpc('read_secret_page', { p_tenant_id: session.activeTenant.id, p_slug: slug });
  if (error) return null;

  const row = (data as unknown[] | null)?.[0] as
    | { title: string; body: string; updated_at: string }
    | undefined;
  if (row === undefined) return null;

  return { title: row.title, body: row.body, updatedAt: row.updated_at };
}
