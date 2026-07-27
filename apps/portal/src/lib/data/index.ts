import { createMockPort } from './mock';
import { createSupabasePort } from './supabase';
import type { DataPort } from './port';

export { DataPortError } from './port';
export type { DataPort } from './port';

/**
 * Escolhe o adapter — e é só isto que muda entre demonstração e produção.
 *
 * Sem as variáveis de ambiente, o painel roda com dado fabricado e diz isso na
 * própria tela. Com elas, fala com o Supabase sob RLS. **O mesmo componente
 * serve os dois**: nenhuma tela sabe de onde veio o dado.
 */
export function getDataPort(): DataPort {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const tenantId = process.env.NEXT_PUBLIC_TENANT_ID;

  if (url && key && tenantId) {
    return createSupabasePort(tenantId);
  }
  return createMockPort();
}
