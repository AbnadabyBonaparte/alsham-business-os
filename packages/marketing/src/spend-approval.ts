import type { EventEnvelope } from '@alsham/core';

/**
 * ⭐ **O CONSUMO — a prova de fogo desta etapa.**
 *
 * Este arquivo é um módulo REAGINDO ao fato de outro módulo. Vale a pena
 * enunciar o que ele **não** faz, porque é aí que está a arquitetura:
 *
 *   · **não importa `@alsham/finance-reconciliation`.** Não há um `import`
 *     dele neste pacote inteiro, e há guarda no CI para que continue assim;
 *   · **não lê nenhuma tabela do `recon`.** Tudo que ele sabe veio no
 *     `payload` do envelope — que é contrato público, não código alheio;
 *   · **não conhece o correio.** Não importa `@alsham/workflow` no código
 *     publicado. Ele expõe uma função; quem a inscreve como `Subscription` é
 *     a composição. Se o correio for trocado amanhã, este arquivo não muda;
 *   · **não implementa idempotência.** Quem garante uma entrega por consumidor
 *     é o correio, com `processed_events`. Reimplementar aqui seria duplicar
 *     a garantia em dois lugares que podem discordar.
 *
 * O acoplamento que existe é **com a string do tipo de evento** — e é
 * deliberado. É o único acoplamento que o CORE-SPEC permite entre módulos, e
 * é o mesmo que existe entre um navegador e um cabeçalho HTTP: contrato, não
 * dependência. Se ninguém emitir esse tipo, este módulo não é acordado, e
 * nada quebra.
 */

/**
 * O tipo de evento que este módulo escuta.
 *
 * ⚠️ É uma **string de contrato**, não um import. Repare que ela cita `recon`
 * e que isso não cria dependência nenhuma: o pacote continua compilando,
 * testando e funcionando com o `recon` desinstalado do banco, ausente do
 * `package.json` e apagado do disco.
 *
 * A escolha de negócio: *uma decisão financeira foi tomada e visada por um
 * humano*. Quando a referência dessa decisão bate com a `budgetRef` de uma
 * campanha, a campanha fica sabendo — sem que ninguém precise avisar.
 */
export const CONSUMED_EVENT_TYPE = 'recon.approval.decided';

/** A identidade deste consumidor. Metade da chave de idempotência do correio. */
export const CONSUMER_ID = 'marketing-spend-projection';

/**
 * O recorte do payload que interessa a este módulo.
 *
 * ⚠️ Deliberadamente **menor** que o payload que o `recon` emite. Um
 * consumidor que exige o payload inteiro quebra quando o produtor acrescenta
 * campo; um que pega só o que usa sobrevive à evolução do outro lado. Evento
 * publicado é contrato: campo não some, mas campo novo aparece.
 */
interface DecisionPayload {
  readonly approvalId?: unknown;
  readonly decision?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly decidedAt?: unknown;
}

/** O que este módulo grava — já traduzido para a sua própria língua. */
export interface SpendDecision {
  readonly tenantId: string;
  readonly sourceModuleId: string;
  readonly externalRef: string;
  readonly decision: 'approved' | 'rejected';
  readonly amountCents: number | null;
  readonly currency: string | null;
  readonly decidedAt: string | null;
}

export type Translation =
  | { readonly kind: 'apply'; readonly decision: SpendDecision }
  /**
   * O evento chegou, foi entendido e **não interessa** — ou não dá para
   * entender. Não é erro: é o Lego sem o outro lado.
   *
   * Devolver "ignorar" em vez de lançar é decisão pensada. Lançar faria o
   * correio reagendar, insistir e terminar em `dead` um evento que nunca vai
   * melhorar — enchendo a fila de mortos que não são falha de ninguém.
   */
  | { readonly kind: 'ignore'; readonly reason: string };

/**
 * Traduz o envelope para a língua deste módulo. **Pura** — dá para conferir a
 * tradução inteira sem banco, sem correio e sem o `recon` existir.
 */
export function toSpendDecision(envelope: EventEnvelope): Translation {
  if (envelope.eventType !== CONSUMED_EVENT_TYPE) {
    return { kind: 'ignore', reason: `tipo ${envelope.eventType} não é escutado por este módulo` };
  }

  const payload = (envelope.payload ?? {}) as DecisionPayload;

  const decisao = payload.decision;
  if (decisao !== 'approved' && decisao !== 'rejected') {
    // Uma decisão que não é sim nem não não move verba nenhuma.
    return { kind: 'ignore', reason: `decisão "${String(decisao)}" não move verba` };
  }

  const ref = payload.approvalId;
  if (typeof ref !== 'string' || ref.length === 0) {
    return { kind: 'ignore', reason: 'evento sem identificador da decisão — nada a que se referir' };
  }

  return {
    kind: 'apply',
    decision: {
      tenantId: envelope.tenantId,
      // De quem é a verdade. Vem do envelope, não de constante: no dia em que
      // um módulo de Contas a Pagar emitir o mesmo formato, isto continua
      // valendo sem uma linha de código a mais.
      sourceModuleId: envelope.producedBy,
      externalRef: ref,
      decision: decisao,
      amountCents: typeof payload.amountCents === 'number' ? payload.amountCents : null,
      currency: typeof payload.currency === 'string' ? payload.currency : null,
      decidedAt: typeof payload.decidedAt === 'string' ? payload.decidedAt : null,
    },
  };
}

/**
 * A porta de gravação da projeção.
 *
 * ⚠️ Quem implementa isto roda com `service_role`: `marketing.spend_approvals`
 * não tem policy de INSERT para `authenticated`, de propósito. **Esta
 * interface nunca deve ser instanciada num app cliente** — deixar o cliente
 * lançar a própria aprovação de verba seria deixá-lo aprovar a própria verba.
 */
export interface SpendProjectionPort {
  /**
   * Grava o fato e carimba as campanhas que apontam para ele.
   *
   * Devolve **quantas campanhas foram afetadas**, e `0` quando o fato já era
   * conhecido. É o retorno de `marketing.record_spend_decision()`, e é o que
   * torna "o efeito acontece uma vez só" conferível em vez de prometido.
   */
  recordSpendDecision(decision: SpendDecision): Promise<number>;
}

export type HandledOutcome =
  | { readonly kind: 'applied'; readonly campaignsTouched: number }
  | { readonly kind: 'already-known' }
  | { readonly kind: 'ignored'; readonly reason: string };

/**
 * O handler. Recebe a porta, devolve a função que o correio chamará.
 *
 * Repare na assinatura: `(envelope) => Promise<HandledOutcome>`. Ela é
 * compatível com o `EventHandler` do correio a menos do retorno — e a
 * composição faz essa ponte de uma linha. É de propósito: o módulo devolve
 * **o que aconteceu**, porque teste e log precisam saber; o correio só
 * precisa saber se lançou ou não.
 */
export function handleSpendDecision(port: SpendProjectionPort) {
  return async (envelope: EventEnvelope): Promise<HandledOutcome> => {
    const traduzido = toSpendDecision(envelope);
    if (traduzido.kind === 'ignore') {
      return { kind: 'ignored', reason: traduzido.reason };
    }

    const afetadas = await port.recordSpendDecision(traduzido.decision);
    // 0 pode significar duas coisas — fato já conhecido, ou nenhuma campanha
    // apontando para ele — e as duas são "nada mudou". O módulo não precisa
    // distinguir; a projeção guardou o fato de qualquer jeito, e
    // `budgetStatusFor()` o encontra quando uma campanha aparecer depois.
    return afetadas === 0 ? { kind: 'already-known' } : { kind: 'applied', campaignsTouched: afetadas };
  };
}
