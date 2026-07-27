import type { Campaign, CampaignStatus, MarketingSettings, SpendApproval } from '@alsham/marketing';

/**
 * A PORTA DE DADOS do Módulo 2.
 *
 * ⚠️ **Porta própria, e é a Lei do Lego (CLAUDE.md §5.5) aplicada ao painel.**
 *
 * Seria mais curto acrescentar quatro métodos ao `DataPort` do `recon`. Seria
 * também o começo do fim: uma porta que serve dois módulos vira uma porta que
 * serve cinco, e no dia em que o cliente desinstalar um deles a interface
 * inteira passa a ter métodos que não respondem. Módulo tem schema próprio,
 * permissão própria e porta própria.
 *
 * ⭐ Repare no que esta interface **não** tem: nenhum `podePublicar`,
 * `validar` ou `decidir`. Quem decide é `planTransition()`, em
 * `@alsham/marketing`. A porta carrega e grava; a tela pergunta e mostra.
 *
 * ⛔ E não há **nenhum** método que escreva `spend_approvals`. Não é
 * esquecimento: aquela tabela é escrita pelo correio, com `service_role`, do
 * servidor. Um método aqui seria a porta pela qual o cliente aprovaria a
 * própria verba.
 */
export interface MarketingPort {
  readonly kind: 'mock' | 'supabase';

  /** As permissões `marketing.*` do usuário no tenant atual. */
  listPermissions(): Promise<ReadonlySet<string>>;

  /**
   * A política **do tenant**, de `core.tenant_modules.settings`.
   *
   * ⚠️ Vem do banco de propósito: exigir verba aprovada antes de publicar é o
   * processo de algumas empresas, não de todas (Lei anti-viés). Se virasse
   * constante no app, o produto teria adotado a burocracia de um cliente.
   */
  loadSettings(): Promise<MarketingSettings>;

  loadCampaigns(): Promise<Campaign[]>;

  /**
   * As decisões de verba que **outro módulo** tomou e que o correio projetou
   * aqui.
   *
   * Serve para o caso em que a decisão chegou antes de a campanha existir —
   * `budgetStatusFor()` a encontra depois.
   */
  loadSpendApprovals(): Promise<SpendApproval[]>;

  createDraft(input: {
    name: string;
    description: string;
    audienceNote: string;
    scheduledFor: string | null;
    budgetPlannedCents: number | null;
    currency: string | null;
    budgetRef: string | null;
  }): Promise<{ campaignId: string }>;

  /**
   * Aplica uma passagem de estado **já decidida** por `planTransition()`.
   *
   * Recebe os carimbos prontos. A porta não sabe que publicar preenche
   * `published_at` — se soubesse, a regra estaria em dois lugares, e dois
   * lugares divergem.
   *
   * É isto que dispara o trigger `campaigns_emit_status` e põe
   * `marketing.campaign.published` na caixa de saída do Core, na mesma
   * transação.
   */
  applyTransition(input: {
    campaignId: string;
    status: CampaignStatus;
    publishedAt?: string;
    completedAt?: string;
  }): Promise<void>;
}
