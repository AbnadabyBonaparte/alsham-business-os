/**
 * `@alsham/engineer` — a lógica pura do Engenheiro do Business OS.
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): o CORAÇÃO do agente vive aqui — o prompt, o
 * mapa de ferramentas, o mapa de leitura por módulo, a resolução de acesso. A
 * PELE (a rota que fala com o motor e com o banco, a Presença que desenha) vive
 * em `apps/portal`. Apague `apps/` e nenhuma regra do agente se perde.
 *
 * ⛔ Zero I/O, zero credencial, zero fetch. Este pacote decide; não executa.
 */
export { buildSystemPrompt, buildDocumentPrompt } from './prompt.ts';
export { buildTools, resolveConsulta, sanitizeLimite, pendenciaPlan } from './tools.ts';
export { MODULE_READS, PENDENCIA_MODULES, knownReadModules } from './modules.ts';

// ⭐ A CAMADA DE CONSCIÊNCIA (Onda do Engenheiro MVP) — importada do PERITUS.
export {
  ENGINE_PAGES,
  pageOf,
  redactFields,
  localizationBlock,
  formSnapshotBlock,
} from './pages.ts';
export type { EnginePage, FormField } from './pages.ts';

// ⭐ Os motores locais determinísticos (Painel + Agenda) — a fonte grounded.
export { painelResumo, painelPrioridades } from './local/painel.ts';
export type { PainelSnapshot, PainelLinha } from './local/painel.ts';
export { agendaResumo } from './local/agenda.ts';
export type { AgendaSnapshot, AgendaLinha } from './local/agenda.ts';

// ⭐ A ponte para a FORJA — reaproveitamento de composePrompt/findViolations.
export { composeGroundedPrompt, checkBrandSafety } from './grounded.ts';
export type { BrandContext } from './grounded.ts';

export type {
  EngineerContext,
  EngineerRole,
  EngineerTurn,
  EngineerTool,
  ModuleRead,
  ConsultaAlvo,
  ToolCallLog,
} from './types.ts';
