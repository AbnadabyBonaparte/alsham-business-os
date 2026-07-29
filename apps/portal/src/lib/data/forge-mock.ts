import type { EngineState, GenerationKind } from '@alsham/ai';

import type { ForgePort } from './forge-port';

/**
 * Adapter MOCKADO da forja — para o portal rodar sem `apps/api` no ar.
 *
 * ⭐ **Ele devolve o estado `demo`, e a tela é obrigada a rotulá-lo.** Não há
 * caminho em que este arquivo se passe por geração real: o estado que ele
 * devolve tem nome próprio, e `canGenerate()` só o aceita porque a tela mostra
 * o selo de demonstração ao lado.
 */
export function createForgeMockPort(): ForgePort {
  let seq = 0;
  return {
    kind: 'mock',

    async readEngineState(): Promise<EngineState> {
      return { status: 'demo' };
    },

    async generate(pedido: { kind: GenerationKind; instruction: string }) {
      seq += 1;
      const rotulo = pedido.kind === 'text' ? 'texto' : 'arte';
      return {
        generationId: `demo-${seq}`,
        output:
          pedido.kind === 'text'
            ? `[DEMONSTRAÇÃO — ${rotulo} de exemplo, não gerado pelo motor]\n\n` +
              `Rascunho para: ${pedido.instruction.slice(0, 160)}`
            : 'https://exemplo.invalido/demonstracao/arte-de-exemplo.png',
        draftInstruction: `Rascunho gerado pelo motor ALSHAM — ${pedido.instruction}`,
        violations: [],
        demo: true,
      };
    },
  };
}
