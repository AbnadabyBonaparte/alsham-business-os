import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

import { readSupabaseEnv } from './env';

/**
 * O cliente Supabase do **servidor**, amarrado aos cookies da requisição.
 *
 * É por aqui que a sessão do usuário chega ao banco: cada consulta roda com o
 * JWT dele, e portanto sob a RLS dele. Nenhuma consulta deste app roda com
 * privilégio de plataforma.
 *
 * Retorna `null` quando não há ambiente configurado — o app cai no modo de
 * demonstração em vez de quebrar.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = readSupabaseEnv();
  if (!env) return null;

  const store = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, options);
          }
        } catch {
          // Server Component não pode escrever cookie. Quem renova a sessão é
          // o `proxy.ts`, a cada requisição — então engolir aqui é correto, e
          // não perde renovação nenhuma.
        }
      },
    },
  });
}
