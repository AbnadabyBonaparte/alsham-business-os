/**
 * `@alsham/marketing` — **Módulo 2: Campanhas de Marketing**.
 *
 * ⭐ O módulo que prova a tese do Lego: ele **reage ao fato de outro módulo
 * sem conhecê-lo**. Não importa `@alsham/finance-reconciliation`, não lê
 * nenhuma tabela do `recon`, e não sabe que o correio existe.
 *
 * ⚠️ Zero I/O e zero UI. Gravação entra por porta, relógio entra por
 * parâmetro. Quem tem `service_role` é a composição, nunca esta lógica.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  canTransition,
  planTransition,
  isTerminal,
  budgetStatusFor,
  summarizeCampaigns,
} from './campaign.ts';
export type { TransitionVerdict, TransitionRefusal } from './campaign.ts';

export {
  CONSUMED_EVENT_TYPE,
  CONSUMER_ID,
  toSpendDecision,
  handleSpendDecision,
} from './spend-approval.ts';
export type {
  SpendDecision,
  SpendProjectionPort,
  HandledOutcome,
  Translation,
} from './spend-approval.ts';

export { DEFAULT_SETTINGS } from './types.ts';
export type {
  BudgetStatus,
  Campaign,
  CampaignAsset,
  CampaignResult,
  CampaignStatus,
  MarketingSettings,
  SpendApproval,
} from './types.ts';
