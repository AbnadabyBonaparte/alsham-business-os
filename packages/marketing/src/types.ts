import type { IsoDateTime, TenantId, Uuid } from '@alsham/core';

/**
 * Os tipos do **Módulo 2 — Campanhas de Marketing**.
 *
 * Espelham `supabase/migrations/0004_marketing.sql` e nada além dele. Se um
 * campo existe aqui e não lá, ou o contrário, um dos dois está mentindo.
 *
 * ⚠️ **Nenhum tipo deste arquivo conhece o `recon`.** O que atravessa a
 * fronteira entre módulos é o envelope de evento, e só ele.
 */

/**
 * O ciclo de vida da campanha.
 *
 * Quatro estados de trabalho mais o cancelamento. É universal: toda empresa
 * que faz campanha planeja, põe no ar e tira do ar. O que muda de empresa
 * para empresa é *quem* pode fazer cada passagem — e isso é permissão, não
 * estado.
 */
export type CampaignStatus =
  /** Em preparo. Só quem tem `marketing.campaign.manage` mexe. */
  | 'draft'
  /** Com data marcada, ainda não no ar. */
  | 'scheduled'
  /** No ar. */
  | 'published'
  /** Encerrada por ter cumprido seu ciclo. */
  | 'completed'
  /** Morta antes da hora. A ação destrutiva do módulo — some da operação,
   *  nunca da trilha. */
  | 'cancelled';

/**
 * O que a área financeira disse sobre a verba desta campanha.
 *
 * ⭐ **Este campo não é preenchido por este módulo.** Ele chega pelo evento de
 * outro módulo, projetado localmente (§5 do `0004_marketing.sql`). É a única
 * coisa aqui dentro cuja origem é externa — e é a prova da etapa.
 *
 * `none` ≠ `rejected`: ninguém ter se pronunciado é diferente de terem dito
 * não. Colapsar os dois faria uma campanha sem processo de verba parecer
 * reprovada.
 */
export type BudgetStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface Campaign {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string;
  readonly status: CampaignStatus;
  readonly scheduledFor: IsoDateTime | null;
  readonly publishedAt: IsoDateTime | null;
  readonly completedAt: IsoDateTime | null;
  /** O que se PRETENDE gastar, em centavos. `null` = sem verba declarada. */
  readonly budgetPlannedCents: number | null;
  /** ISO 4217. Sem default: moeda presumida é viés de país. */
  readonly currency: string | null;
  /**
   * Referência **opaca** ao item financeiro que banca a campanha.
   *
   * Mesmo padrão de `recon.payables.external_ref`: é uma string que o tenant
   * escolhe. Este módulo não sabe o que ela significa, e é justamente por não
   * saber que ele não depende de quem a emitiu.
   */
  readonly budgetRef: string | null;
  readonly budgetStatus: BudgetStatus;
  /**
   * O público, em texto livre.
   *
   * ⚠️ Segmentação estruturada **NÃO existe aqui**, e é decisão: é capacidade
   * própria (*CRM marketing*) e difere por canal. Uma nota que o humano lê é
   * honesta sobre o que o módulo faz; um schema de segmentação seria o funil
   * de uma empresa só.
   */
  readonly audienceNote: string;
}

/** Uma peça da campanha. `channel` é texto livre — enum de canal apodrece. */
export interface CampaignAsset {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly campaignId: Uuid;
  readonly channel: string;
  readonly title: string;
  /** Onde a peça mora. Opaco: o módulo não abre, não valida, não baixa. */
  readonly assetRef: string | null;
}

/**
 * Um resultado medido.
 *
 * `metric` é texto e `value` é número genérico com `unit` de propósito: uma
 * clínica mede consultas, uma fábrica mede cotações, um shopping mede fluxo.
 * Colunas fixas seriam o funil de um negócio — e migration a cada métrica nova.
 */
export interface CampaignResult {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly campaignId: Uuid;
  readonly metric: string;
  readonly value: number;
  readonly unit: string | null;
  readonly measuredAt: IsoDateTime;
  /** De onde veio o número. Procedência é o que separa dado de palpite. */
  readonly source: string;
}

/**
 * A projeção local de uma decisão de verba tomada **em outro módulo**.
 *
 * ⚠️ Cópia, não fonte da verdade. `sourceModuleId` diz de quem é a verdade.
 * Este módulo guarda o que veio no payload e nada mais — não há como ele
 * consultar a origem, e é isso que o mantém removível.
 */
export interface SpendApproval {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly sourceModuleId: string;
  /** O id da decisão no módulo de origem. Opaco. */
  readonly externalRef: string;
  readonly decision: 'approved' | 'rejected';
  readonly amountCents: number | null;
  readonly currency: string | null;
  readonly decidedAt: IsoDateTime | null;
  /** Quando ESTE módulo soube. A distância para `decidedAt` é a latência. */
  readonly receivedAt: IsoDateTime;
}

/**
 * A política do tenant, de `core.tenant_modules.settings`.
 *
 * ⭐ **É aqui que a Lei anti-viés se materializa neste módulo.**
 *
 * Exigir verba aprovada antes de publicar é regra de UMA empresa. Muitas
 * publicam primeiro e prestam contas depois; agências publicam pela verba do
 * cliente, que nem passa por aqui. Se isso fosse constante no código, o
 * produto seria o processo de um cliente — exatamente o que a Lei 2 proíbe.
 */
export interface MarketingSettings {
  /**
   * Publicar exige `budgetStatus === 'approved'`?
   *
   * Default `false`: o produto não presume burocracia que o cliente não pediu.
   */
  readonly requireBudgetClearance: boolean;
  /**
   * Agendar exige data no futuro?
   *
   * Default `true`, mas configurável porque importação de histórico é um caso
   * real: quem migra de outra ferramenta traz campanha com data passada.
   */
  readonly requireFutureSchedule: boolean;
}

export const DEFAULT_SETTINGS: MarketingSettings = {
  requireBudgetClearance: false,
  requireFutureSchedule: true,
};
