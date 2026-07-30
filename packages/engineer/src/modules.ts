import type { ModuleRead } from './types.ts';

/**
 * **O MAPA DE LEITURA — moduleId → onde ler, sob RLS.**
 *
 * ⭐ Cada entrada aponta a tabela primária de um módulo, no schema dele (que é
 * sempre o próprio `moduleId`). O executor da rota lê
 * `db.schema(schema).from(table).select('*').eq('tenant_id', <tenant da
 * sessão>)` — EXATAMENTE o caminho que as telas usam. Nada aqui inventa acesso:
 * a RLS decide o que volta, e a coluna `tenant_id` do tenant ativo casa o
 * escopo da tela.
 *
 * ⚠️ **Curadoria consciente, não a lista inteira.** São os módulos de leitura
 * de UMA tabela clara — o que dá ao agente valor imediato sem prometer o que
 * não foi construído (Lei 7). Módulos multi-tabela (recon) ou sem tabela (a
 * Forja, que é HTTP) ficam fora de propósito. Cada `schema`/`table` foi
 * conferido contra o `-supabase.ts` do módulo.
 *
 * ⛔ **Só leitura.** O Engenheiro consulta; ele não decide baixa, não instala,
 * não apaga. Escrever é ato de gente, na tela, com a confirmação de dois passos
 * (padrão CRIVO). A V1 do agente é uma lente, não uma alavanca.
 */
export const MODULE_READS: Readonly<Record<string, ModuleRead>> = {
  crm: { schema: 'crm', table: 'parties', label: 'Relacionamentos', summary: 'as contrapartes que a empresa se relaciona (pessoas e organizações)' },
  cash: { schema: 'cash', table: 'entries', label: 'Fluxo de Caixa', summary: 'os lançamentos de caixa realizados' },
  ap: { schema: 'ap', table: 'payables', label: 'Contas a Pagar', summary: 'os títulos que a empresa deve, com vencimento' },
  ar: { schema: 'ar', table: 'receivables', label: 'Contas a Receber', summary: 'os títulos que a empresa tem a receber, com vencimento' },
  inv: { schema: 'inv', table: 'items', label: 'Estoque', summary: 'os itens do catálogo de estoque' },
  deal: { schema: 'deal', table: 'funnels', label: 'Funil Comercial', summary: 'os funis do pipeline comercial' },
  care: { schema: 'care', table: 'tickets', label: 'Atendimento', summary: 'os casos de atendimento ao cliente' },
  goal: { schema: 'goal', table: 'goals', label: 'Metas', summary: 'as metas declaradas do negócio' },
  pat: { schema: 'pat', table: 'assets', label: 'Patrimônio', summary: 'os bens do patrimônio' },
  dun: { schema: 'dun', table: 'rulers', label: 'Cobrança', summary: 'as réguas de cobrança do tenant' },
  lead: { schema: 'lead', table: 'leads', label: 'Leads', summary: 'as manifestações de interesse (leads)' },
  bud: { schema: 'bud', table: 'budgets', label: 'Orçamentos', summary: 'os orçamentos por categoria e período' },
  bank: { schema: 'bank', table: 'accounts', label: 'Contas Bancárias', summary: 'as contas bancárias cadastradas' },
  occ: { schema: 'occ', table: 'occurrences', label: 'Ocorrências', summary: 'as ocorrências registradas' },
  mnt: { schema: 'mnt', table: 'orders', label: 'Manutenção', summary: 'as ordens de manutenção' },
  quote: { schema: 'quote', table: 'proposals', label: 'Propostas', summary: 'as propostas comerciais' },
  nps: { schema: 'nps', table: 'surveys', label: 'Pesquisas', summary: 'as pesquisas de satisfação (NPS/CSAT)' },
};

/**
 * Os módulos que carregam PRAZO — a matéria-prima de um resumo de pendências.
 *
 * ⚠️ A ordem é a da leitura executiva: dinheiro a pagar e a receber primeiro,
 * depois a operação. `resumir_pendencias` lê só os que o usuário PODE ver.
 */
export const PENDENCIA_MODULES: readonly string[] = ['ap', 'ar', 'dun', 'mnt'];

/** Os moduleIds que o mapa de leitura conhece. */
export function knownReadModules(): readonly string[] {
  return Object.keys(MODULE_READS).sort();
}
