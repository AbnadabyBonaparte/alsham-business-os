import { createMockPort } from './mock';
import { createSupabasePort } from './supabase';
import { createMarketingMockPort } from './marketing-mock';
import { createStoreMockPort } from './store-mock';
import { createStoreSupabasePort } from './store-supabase';
import { createMarketingSupabasePort } from './marketing-supabase';
import { createApMockPort } from './ap-mock';
import { createApSupabasePort } from './ap-supabase';
import { createCrmMockPort } from './crm-mock';
import { createCrmSupabasePort } from './crm-supabase';
import { createArMockPort } from './ar-mock';
import { createOpsMockPort } from './ops-mock';
import { createForgeMockPort } from './forge-mock';
import { createBrandMockPort } from './brand-mock';
import { createPanelMockPort } from './panel-mock';
import { createPanelSupabasePort } from './panel-supabase';
import { createBrandSupabasePort } from './brand-supabase';
import { createForgeHttpPort } from './forge-http';
import { createOpsSupabasePort } from './ops-supabase';
import { createArSupabasePort } from './ar-supabase';
import { createPoMockPort } from './po-mock';
import { createPoSupabasePort } from './po-supabase';
import { createInvMockPort } from './inv-mock';
import { createInvSupabasePort } from './inv-supabase';
import { createQuoteMockPort } from './quote-mock';
import { createQuoteSupabasePort } from './quote-supabase';
import { createDealMockPort } from './deal-mock';
import { createDealSupabasePort } from './deal-supabase';
import { createSupabaseServerClient } from '../supabase/server';
import { resolveSession } from '../session';
import type { DataPort } from './port';
import type { MarketingPort } from './marketing-port';
import type { StorePort } from './store-port';
import type { ApPort } from './ap-port';
import type { CrmPort } from './crm-port';
import type { ArPort } from './ar-port';
import type { PoPort } from './po-port';
import type { InvPort } from './inv-port';
import type { QuotePort } from './quote-port';
import type { DealPort } from './deal-port';
import type { OpsPort } from './ops-port';
import type { ForgePort } from './forge-port';
import type { BrandPort } from './brand-port';
import type { PanelPort } from './panel-port';

export { DataPortError } from './port';
export { loadAllPermissions } from './menu-port';
export type { DataPort } from './port';
export type { MarketingPort } from './marketing-port';
export type { StorePort } from './store-port';
export type { ApPort, PayableRow } from './ap-port';
export type { CrmPort, PartyRow, InteractionRow } from './crm-port';
export type { ArPort, ReceivableRow } from './ar-port';
export type { PoPort, OrderRow } from './po-port';
export type { InvPort, ItemRow, MovementRow } from './inv-port';
export type { QuotePort, ProposalRow } from './quote-port';
export type { DealPort, FunnelWithStages, OpportunityRow } from './deal-port';
export type { OpsPort, PipelineWithStages } from './ops-port';
export type { ForgePort, GenerationResponse } from './forge-port';
export type { BrandPort } from './brand-port';
export type { PanelPort, CourierSummary, PlanUsageRow, AuditRow } from './panel-port';

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

/**
 * A porta do Módulo 4 — **quarta porta, mesmo encanamento**.
 *
 * A repetição destas oito linhas continua deliberada e continua registrada: um
 * `getPort(factory)` genérico economizaria linhas e custaria a fronteira — a
 * assinatura genérica convidaria a primeira porta que serve dois módulos. Ver
 * a nota em `getMarketingPort()` sobre a dívida do `@alsham/sdk`, que segue
 * pendente e segue sendo decisão do dono.
 */
export async function getCrmPort(): Promise<CrmPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createCrmMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createCrmMockPort();

  return createCrmSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta do Módulo 5 — **quinta porta, mesmo encanamento**.
 *
 * ⚠️ E aqui a repetição incomoda mais do que nunca, porque esta porta é quase
 * idêntica à do Módulo 3. Continua deliberada: uma `TitulosPort` genérica que
 * servisse `ap` e `ar` acabaria com a fronteira — desinstalar um deixaria o
 * outro com métodos que não respondem, e a divergência de regra entre os dois
 * (receber a maior é permitido, pagar a maior não) não caberia numa assinatura
 * só. Ver a nota em `getMarketingPort()` sobre a dívida do `@alsham/sdk`.
 */
export async function getArPort(): Promise<ArPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createArMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createArMockPort();

  return createArSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta do Módulo 6 — **sexta porta, mesmo encanamento**.
 *
 * Porta própria: desinstalar Compras não pode deixar método órfão em outra porta.
 */
export async function getPoPort(): Promise<PoPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createPoMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createPoMockPort();

  return createPoSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta do Módulo 7 — **sétima porta, mesmo encanamento**.
 *
 * A repetição destas oito linhas continua deliberada e continua registrada,
 * pelo mesmo motivo de sempre: um `getPort(factory)` genérico economizaria
 * linhas e custaria a fronteira. Ver a nota em `getMarketingPort()` sobre a
 * dívida do `@alsham/sdk`, que segue pendente e segue sendo decisão do dono.
 */
export async function getOpsPort(): Promise<OpsPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createOpsMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createOpsMockPort();

  return createOpsSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta do Módulo 8 — **oitava porta, mesmo encanamento**.
 *
 * As mesmas oito linhas, deliberadamente: porta que serve dois módulos vira
 * porta que serve cinco, e desinstalar um deixa métodos que não respondem.
 */
export async function getInvPort(): Promise<InvPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createInvMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createInvMockPort();

  return createInvSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta do Módulo 9 — **nona porta, mesmo encanamento**.
 */
export async function getQuotePort(): Promise<QuotePort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createQuoteMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createQuoteMockPort();

  return createQuoteSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta do Módulo 10 — **décima porta, mesmo encanamento**.
 */
export async function getDealPort(): Promise<DealPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createDealMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createDealMockPort();

  return createDealSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta da FORJA — **a única que não fala com o banco.**
 *
 * ⛔ Ela fala com `apps/api` por HTTP, porque é lá que a chave do motor vive. O
 * portal pede; o servidor executa. Nenhuma chave de motor atravessa esta
 * fronteira, em nenhum sentido.
 *
 * ⚠️ **Sem `ALSHAM_API_URL` ou sem `FORGE_SECRET`, cai no mock ROTULADO** — e
 * o mock devolve o estado `demo`, que a tela é obrigada a mostrar. Nunca um
 * mock silencioso: a tela diria "gerado" sobre um texto de exemplo.
 */
export async function getForgePort(): Promise<ForgePort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createForgeMockPort();

  const baseUrl = process.env.ALSHAM_API_URL;
  const secret = process.env.FORGE_SECRET;
  if (!baseUrl || !secret) return createForgeMockPort();

  return createForgeHttpPort({
    baseUrl,
    secret,
    tenantId: session.activeTenant.id,
    userId: session.userId ?? null,
  });
}

/**
 * A porta do CÉREBRO DA MARCA — Core, não módulo.
 *
 * `core.ai_brand_context` serve a qualquer módulo que peça geração, e por isso
 * não é porta de módulo: não some quando um módulo é desinstalado.
 */
export async function getBrandPort(): Promise<BrandPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createBrandMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createBrandMockPort();

  return createBrandSupabasePort(db, session.activeTenant.id);
}

/**
 * A porta do PAINEL EXECUTIVO — **Core, não módulo.**
 *
 * O Painel é a home da plataforma: ele não some quando um módulo é
 * desinstalado, e por isso não segue a regra de "porta própria por módulo".
 */
export async function getPanelPort(): Promise<PanelPort> {
  const session = await resolveSession();
  if (session.mode !== 'authenticated') return createPanelMockPort();

  const db = await createSupabaseServerClient();
  if (!db) return createPanelMockPort();

  // ⚠️ O plano NÃO vem da sessão de propósito: `TenantRef` é o que o
  // seletor de tenant precisa, e acrescentar campo ali faria toda tela pagar
  // por um dado que só o Painel usa. Quem lê o plano é a função do banco
  // (`core.tenant_plan_usage`), que já cruza `core.tenants` com
  // `core.plan_limits` — e assim há uma fonte só.
  return createPanelSupabasePort(db, session.activeTenant.id, '');
}
