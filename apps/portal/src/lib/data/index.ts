import { createMockPort } from './mock';
import { createSupabasePort } from './supabase';
import { createMarketingMockPort } from './marketing-mock';
import { createStoreMockPort } from './store-mock';
import { createStoreSupabasePort } from './store-supabase';
import { createMarketingSupabasePort } from './marketing-supabase';
import { createApMockPort } from './ap-mock';
import { createApSupabasePort } from './ap-supabase';
import { createSupabaseServerClient } from '../supabase/server';
import { resolveSession } from '../session';
import type { DataPort } from './port';
import type { MarketingPort } from './marketing-port';
import type { StorePort } from './store-port';
import type { ApPort } from './ap-port';

export { DataPortError } from './port';
export type { DataPort } from './port';
export type { MarketingPort } from './marketing-port';
export type { StorePort } from './store-port';
export type { ApPort, PayableRow } from './ap-port';

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

/**
 * A porta do Módulo 2 — **outra porta, mesmo encanamento**.
 *
 * ⚠️ Sobre a dívida registrada em `MODULO-RECON-SPEC §7`: o adaptador de banco
 * mora em `apps/portal`, não em `packages/`. Esta etapa **não a duplicou** e
 * também não a promoveu a pacote, e as duas coisas são deliberadas.
 *
 * O que seria duplicação — criar o cliente Supabase e resolver o tenant a
 * partir da sessão — já estava fatorado em `lib/supabase/server.ts` e
 * `lib/session.ts`, e as duas portas usam exatamente o mesmo. O que é
 * específico de cada módulo são as consultas, e essas **devem** ser separadas:
 * módulo não lê tabela de módulo.
 *
 * Promover o encanamento a `@alsham/sdk` continua pendente e continua sendo
 * decisão do dono — com um dado novo a favor de não fazer às pressas:
 * `resolveSession()` importa `next/headers`. Movê-lo para `packages/` levaria
 * o framework para dentro do coração, que é o inverso exato da Regra de Ouro
 * (§5.3). Se aquele código virar pacote, tem de perder o Next antes.
 */
export async function getMarketingPort(): Promise<MarketingPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createMarketingMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createMarketingMockPort();

  return createMarketingSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta da Store — a vitrine do Core.
 *
 * Mesmo encanamento das outras duas: sessão resolvida no servidor, tenant
 * cruzado com `core.memberships`, chave publicável, sob RLS. A Store não é
 * módulo, mas ganha porta própria pelo mesmo motivo que eles ganham.
 */
export async function getStorePort(): Promise<StorePort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createStoreMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createStoreMockPort();

  return createStoreSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta do Módulo 3 — **terceira porta, mesmo encanamento**.
 *
 * A repetição destas oito linhas é deliberada e está registrada: fatorá-las num
 * `getPort(factory)` genérico economizaria umas poucas linhas e custaria a
 * fronteira — a assinatura genérica convidaria a primeira porta que serve dois
 * módulos. Ver a nota em `getMarketingPort()` sobre a dívida do `@alsham/sdk`,
 * que continua pendente e continua sendo decisão do dono.
 */
export async function getApPort(): Promise<ApPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createApMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createApMockPort();

  return createApSupabasePort(db, session.activeTenant.id);
}
