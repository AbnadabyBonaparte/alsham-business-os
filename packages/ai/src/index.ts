/**
 * `@alsham/ai` — **IA Base**, capacidade do **Core** (Taxonomia §3).
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem chave. O que este pacote
 * sabe é **se pode gerar**, **o que perguntar** e **como ler a resposta**. Quem
 * chama o motor é `apps/api`, que tem a chave; quem desenha é o portal, que
 * nunca a vê.
 *
 * ⭐ **Não é módulo, e por isso não aparece na Store.** É encanamento: qualquer
 * módulo pede geração ao Core. Fazer dela um módulo obrigaria o Módulo 6 a
 * conhecer o módulo de IA — que é o que a Lei do Lego proíbe.
 *
 * ⚖️ **A LEI DO MOTOR governa este pacote inteiro:** o nome do fornecedor de IA
 * nunca aparece em texto visível ao cliente. O tipo que a tela recebe
 * (`EngineLabel`) **não tem campo** para ele — não é regra a lembrar, é campo
 * que não existe.
 */

export {
  AI_METRIC,
  engineLabel,
  engineState,
  canGenerate,
  whyCannotGenerate,
  composePrompt,
  normalizeForbidden,
  findViolations,
  validateRequest,
  generationEventPayload,
  machineDraftInstruction,
} from './forge.ts';

export type {
  BrandContext,
  EngineLabel,
  EngineState,
  GenerationKind,
  GenerationRequest,
  GenerationResult,
  GenerationStatus,
} from './types.ts';
