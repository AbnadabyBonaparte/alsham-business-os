import { createMockPort } from './mock';
import { createSupabasePort } from './supabase';
import { createSupabaseServerClient } from '../supabase/server';
import { resolveSession } from '../session';
import type { DataPort } from './port';

export { DataPortError } from './port';
export type { DataPort } from './port';

/**
 * Escolhe o adapter — e é só isto que muda entre demonstração e produção.
 *
 * Sem banco configurado ou sem sessão, o painel roda com dado fabricado e diz
 * isso na própria tela. Com sessão, fala com o Supabase **sob RLS**, em nome
 * do tenant resolvido a partir dos vínculos do usuário.
 *
 * ⚠️ O `tenantId` vem de `resolveSession()`, nunca de parâmetro, URL ou
 * formulário. Nenhuma chamada a esta função aceita tenant de fora.
 *
 * **O mesmo componente serve os dois modos.** Nenhuma tela sabe de onde veio
 * o dado — só pergunta `port.kind` para avisar o operador.
 */
export async function getDataPort(): Promise<DataPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createMockPort();

  return createSupabasePort(db, session.activeTenant.id);
}
