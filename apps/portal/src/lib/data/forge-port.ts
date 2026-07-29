import type { EngineState, GenerationKind } from '@alsham/ai';

/** O que a forja devolve ao portal. Traduzido — sem fornecedor, sem chave. */
export interface GenerationResponse {
  readonly generationId: string;
  readonly output: string;
  readonly draftInstruction: string;
  readonly violations: readonly string[];
  readonly demo: boolean;
}

/**
 * A PORTA DA FORJA — e ela é **HTTP**, não banco.
 *
 * ⛔ **É a diferença que sustenta a fronteira da chave.** Todas as outras
 * portas deste diretório falam com o Supabase sob RLS; esta fala com
 * `apps/api`, porque é lá que a chave do motor vive. O portal **pede**; o
 * servidor **executa**.
 *
 * ⚖️ E o que volta já vem traduzido: o nome do fornecedor não atravessa esta
 * fronteira, por decisão de `apps/api` e por ausência de campo no tipo.
 */
export interface ForgePort {
  readonly kind: 'mock' | 'http';

  /** O estado honesto da modalidade neste ambiente. */
  readEngineState(kind: GenerationKind): Promise<EngineState>;

  generate(input: {
    readonly kind: GenerationKind;
    readonly instruction: string;
    readonly workContext: string;
    readonly sourceRef: string;
  }): Promise<GenerationResponse>;
}
