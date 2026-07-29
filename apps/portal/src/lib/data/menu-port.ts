import { createSupabaseServerClient } from '../supabase/server';
import { resolveSession } from '../session';
import { DataPortError } from './port';

/**
 * A LEITURA DE PERMISSÕES DO MENU — Core, não módulo.
 *
 * ⭐ **Uma consulta, para o menu inteiro.** É o pagamento da dívida que a Etapa
 * 10 registrou no `layout.tsx`: cada módulo novo acrescentava uma ida ao banco
 * só para decidir se o item aparecia. Com seis módulos seriam seis consultas em
 * toda navegação; aqui é uma, e a próxima etapa não a torna sete.
 *
 * ⚠️ **Isto não é porta de módulo, e por isso não fere a Lei do Lego §5.5.8.**
 * `core.role_permissions` é tabela do Core: a mesma linha que o instalador
 * escreve ao instalar QUALQUER módulo. Ler o conjunto inteiro não é ler o
 * schema de ninguém — é perguntar ao Core o que este usuário pode, que é
 * exatamente o que o Core existe para responder.
 *
 * ⚠️ E continua sendo cortesia: quem impede é a RLS de cada módulo.
 */
export async function loadAllPermissions(): Promise<ReadonlySet<string>> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return new Set();

  const db = await createSupabaseServerClient();
  if (db === null) return new Set();

  const { data, error } = await db
    .schema('core')
    .from('role_permissions')
    .select('permission_key');

  // ⚠️ Menu não derruba página. Sem resposta, sobra o que é do Core — e as
  // telas de módulo continuam alcançáveis por URL para quem tiver acesso.
  if (error) return new Set();

  return new Set((data ?? []).map((r) => r.permission_key as string));
}

export { DataPortError };
