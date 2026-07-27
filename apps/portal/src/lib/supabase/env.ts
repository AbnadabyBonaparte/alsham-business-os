/**
 * As variáveis de ambiente do Supabase — em um lugar só.
 *
 * ⛔ **A `service_role key` não é lida aqui, e não pode ser lida em lugar
 * nenhum deste app.** Ela ignora toda a RLS: quem a tem enxerga todos os
 * tenants. Este painel fala com o banco **como o usuário autenticado**, e é
 * isso que faz o isolamento provado em CI valer também na tela.
 *
 * Só existem duas variáveis, as duas com prefixo `NEXT_PUBLIC_` porque a
 * chave publicável (`anon`) é feita para ir ao navegador. No Business OS ela
 * não dá acesso a nada sem sessão: `anon` não tem GRANT nenhum em
 * `core`/`recon` (conferido no runbook e no CI).
 */

export interface SupabaseEnv {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Devolve a configuração, ou `null` quando não há.
 *
 * `null` não é erro: é o **modo de demonstração**. O app roda inteiro com o
 * adapter mockado e avisa isso na tela. Um painel que só abre com banco
 * configurado não pode ser mostrado a ninguém antes de existir infraestrutura.
 */
export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** `true` quando o app está ligado a um banco de verdade. */
export function hasSupabase(): boolean {
  return readSupabaseEnv() !== null;
}
