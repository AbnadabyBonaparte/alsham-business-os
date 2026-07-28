import type { EventEnvelope } from '@alsham/core';

/**
 * ⭐ **O LADO QUE FECHA O TRIÂNGULO.**
 *
 * Na Etapa 7 o Módulo 2 provou que um módulo REAGE ao fato de outro sem
 * conhecê-lo. Este arquivo prova a terceira ponta, e é a mais difícil de
 * fingir: **o Módulo 1 — o mais antigo, o que ninguém escreveu pensando em
 * escutar — vira consumidor.**
 *
 * A prova não está no que este arquivo faz. Está no que ele **não precisou
 * mudar**:
 *
 *   · `recon.payables` nasceu na Etapa 2 com `source in ('imported','event')`,
 *     `source_module_id` e `unique (tenant_id, external_ref)`. Nenhuma coluna
 *     nova, nenhuma constraint relaxada — a `0008_recon_ap_projection.sql` só
 *     abre a porta de escrita que faltava;
 *   · nenhum tipo deste pacote mudou;
 *   · `package.json` continua sem conhecer módulo nenhum.
 *
 * A tabela foi desenhada esperando um módulo que ainda não existia, e quando
 * ele chegou, coube. É isso que o Lego promete, e é isso que aqui se confere.
 *
 * O que este arquivo **não** faz, e é onde mora a arquitetura:
 *
 *   · **não importa `@alsham/accounts-payable`.** Não há um `import` dele
 *     neste pacote inteiro, e há guarda no CI para que continue assim;
 *   · **não lê `ap.payables`.** Tudo que ele sabe veio no `payload` do
 *     envelope, que o produtor montou autossuficiente exatamente por isso;
 *   · **não sabe quem produziu o evento.** Ver `PRODUTOR` abaixo — é a decisão
 *     mais importante deste arquivo;
 *   · **não conhece o correio.** Expõe uma função; quem a inscreve é a
 *     composição;
 *   · **não implementa idempotência.** Duas garantias, duas camadas: o correio
 *     não entrega duas vezes ao mesmo consumidor, e a projeção é idempotente
 *     por `(tenant_id, external_ref)` no banco. Reimplementar aqui seria uma
 *     terceira que pode discordar das outras duas.
 */

/**
 * Os tipos de evento que este módulo escuta.
 *
 * ⚠️ São **strings de contrato**, não imports. Que citem `ap` não cria
 * dependência nenhuma: este pacote continua compilando, testando e funcionando
 * com o módulo de Contas a Pagar desinstalado do banco, ausente do
 * `package.json` e apagado do disco. Se ninguém emitir esses tipos, este
 * consumidor não é acordado, e nada quebra.
 *
 * A escolha de negócio: *alguém registrou, mudou ou cancelou um título que a
 * empresa deve*. A mesa de conciliação precisa desse título para ter contra o
 * que casar a linha do extrato — e agora ele chega sozinho, sem ninguém
 * redigitar.
 */
export const CONSUMED_EVENT_TYPES = [
  'ap.payable.registered',
  'ap.payable.updated',
  'ap.payable.cancelled',
] as const;

/**
 * O padrão que a composição inscreve no correio.
 *
 * Um só, com curinga, em vez de três inscrições: o correio garante uma entrega
 * por `(evento, consumidor)`, e três inscrições do mesmo consumidor para o
 * mesmo evento seriam três chances de a mesma projeção rodar em ordens
 * diferentes.
 */
export const CONSUMED_EVENT_PATTERN = 'ap.*';

/** A identidade deste consumidor. Metade da chave de idempotência do correio. */
export const CONSUMER_ID = 'recon-external-payable-projection';

/**
 * O recorte do payload que interessa a este módulo.
 *
 * ⚠️ Deliberadamente **menor** que o payload que o produtor emite — nem
 * `paymentMethod` nem nada que a conciliação não use entra aqui. Consumidor que
 * exige o payload inteiro quebra quando o produtor acrescenta campo; um que
 * pega só o que usa sobrevive à evolução do outro lado. Evento publicado é
 * contrato: campo não some, mas campo novo aparece.
 */
interface PayablePayload {
  readonly externalRef?: unknown;
  readonly dueDate?: unknown;
  readonly amountCents?: unknown;
  readonly settledAmountCents?: unknown;
  readonly currency?: unknown;
  readonly supplierName?: unknown;
  readonly counterpartyTaxId?: unknown;
  readonly description?: unknown;
  readonly status?: unknown;
}

/** O título já traduzido para a língua deste módulo. */
export interface ExternalPayable {
  readonly tenantId: string;
  /**
   * ⭐ **DE QUEM É A VERDADE — e por que isto nunca é constante.**
   *
   * Vem de `envelope.producedBy`, sempre. Não há a string `'ap'` nem
   * `'accounts-payable'` em nenhum lugar deste arquivo que decida procedência,
   * e não vai haver.
   *
   * A Etapa 7 provou o porquê com um módulo fictício: quando um segundo
   * produtor — outro módulo, uma integração de ERP, um importador — passar a
   * emitir o mesmo formato, este consumidor o atende sem uma linha a mais, e a
   * projeção grava a origem CERTA. Com a origem chumbada, o segundo produtor
   * apareceria no `recon` disfarçado do primeiro, e a trilha mentiria sem
   * nunca dar erro.
   */
  readonly sourceModuleId: string;
  readonly externalRef: string;
  readonly dueDate: string;
  readonly amountCents: number;
  readonly settledAmountCents: number;
  readonly currency: string;
  readonly supplierName: string | null;
  readonly supplierTaxId: string | null;
  readonly description: string;
  readonly status: 'open' | 'partially_settled' | 'settled' | 'cancelled';
}

export type Translation =
  | { readonly kind: 'apply'; readonly payable: ExternalPayable }
  /**
   * O evento chegou, foi entendido e **não dá para projetar**. Não é erro: é o
   * Lego com um payload que não serve.
   *
   * Devolver "ignorar" em vez de lançar é a mesma decisão do Módulo 2. Lançar
   * faria o correio reagendar, insistir e terminar em `dead` um evento que
   * nunca vai melhorar — enchendo a fila de mortos que não são falha de
   * ninguém.
   */
  | { readonly kind: 'ignore'; readonly reason: string };

const ESTADOS = ['open', 'partially_settled', 'settled', 'cancelled'] as const;

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Traduz o envelope para a língua deste módulo. **Pura** — dá para conferir a
 * tradução inteira sem banco, sem correio e sem o outro módulo existir.
 */
export function toExternalPayable(envelope: EventEnvelope): Translation {
  if (!envelope.eventType.startsWith('ap.payable.')) {
    return { kind: 'ignore', reason: `tipo ${envelope.eventType} não é escutado por este módulo` };
  }

  const payload = (envelope.payload ?? {}) as PayablePayload;

  const externalRef = textoOuNulo(payload.externalRef);
  if (externalRef === null) {
    // Sem referência não há chave de idempotência, e sem chave de idempotência
    // a reentrega duplicaria o título. Melhor não projetar.
    return { kind: 'ignore', reason: 'evento sem referência do documento — nada a que se referir' };
  }

  const dueDate = textoOuNulo(payload.dueDate);
  if (dueDate === null || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { kind: 'ignore', reason: `vencimento "${String(payload.dueDate)}" não é uma data ISO` };
  }

  const amountCents = payload.amountCents;
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return { kind: 'ignore', reason: `valor "${String(amountCents)}" não é um valor devido` };
  }

  const currency = textoOuNulo(payload.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    return { kind: 'ignore', reason: `moeda "${String(payload.currency)}" não é um código ISO` };
  }

  const status = payload.status;
  if (typeof status !== 'string' || !(ESTADOS as readonly string[]).includes(status)) {
    return { kind: 'ignore', reason: `estado "${String(status)}" não existe neste módulo` };
  }

  const liquidado = payload.settledAmountCents;
  const settledAmountCents =
    typeof liquidado === 'number' && Number.isInteger(liquidado) && liquidado >= 0 ? liquidado : 0;

  if (settledAmountCents > amountCents) {
    return { kind: 'ignore', reason: 'o valor liquidado é maior que o devido — payload incoerente' };
  }

  const produtor = textoOuNulo(envelope.producedBy);
  if (produtor === null) {
    // Sem procedência, a linha violaria `payables_source_coherent` no banco.
    // Recusar aqui dá mensagem; deixar passar daria número de constraint.
    return { kind: 'ignore', reason: 'envelope sem produtor — origem do título desconhecida' };
  }

  return {
    kind: 'apply',
    payable: {
      tenantId: envelope.tenantId,
      sourceModuleId: produtor,
      externalRef,
      dueDate,
      amountCents,
      settledAmountCents,
      currency,
      supplierName: textoOuNulo(payload.supplierName),
      /**
       * ⚠️ O produtor chama de `counterpartyTaxId`; este módulo chama de
       * `supplierTaxId`, porque foi assim que a coluna nasceu na Etapa 2. A
       * tradução acontece AQUI, na fronteira, e é o lugar certo: cada módulo
       * fala a sua língua por dentro, e o envelope é o dicionário. Renomear a
       * coluna aplicada em produção para "combinar" seria mudar história por
       * estética.
       */
      supplierTaxId: textoOuNulo(payload.counterpartyTaxId),
      description: textoOuNulo(payload.description) ?? '',
      status: status as ExternalPayable['status'],
    },
  };
}

/**
 * A porta de gravação da projeção.
 *
 * ⚠️ Quem implementa isto roda com `service_role`:
 * `recon.record_external_payable()` não é concedida a `authenticated`, de
 * propósito. **Esta interface nunca deve ser instanciada num app cliente** —
 * dar essa caneta à tela seria deixar o cliente inventar um título "vindo de
 * outro módulo", com origem forjada e forjada por dentro da RLS.
 */
export interface ExternalPayablePort {
  /**
   * Projeta o título e devolve **o que aconteceu**, não um booleano.
   *
   * Quatro desfechos, e três deles são sucesso — ver o cabeçalho de
   * `0008_recon_ap_projection.sql`. `skipped-imported` é o que interessa
   * guardar: já havia um título com aquela referência, digitado por uma pessoa
   * deste tenant, e a projeção não o sobrescreve.
   */
  recordExternalPayable(
    payable: ExternalPayable,
  ): Promise<'created' | 'updated' | 'unchanged' | 'skipped-imported'>;
}

export type HandledOutcome =
  | { readonly kind: 'projected'; readonly effect: 'created' | 'updated' | 'unchanged' }
  /** ⚠️ Mão humana ganhou do evento. Ver `ExternalPayablePort`. */
  | { readonly kind: 'kept-local'; readonly externalRef: string }
  | { readonly kind: 'ignored'; readonly reason: string };

/**
 * O handler. Recebe a porta, devolve a função que o correio chamará.
 *
 * ⚠️ **Um handler para os três eventos, e é decisão.** `registered` cria,
 * `updated` atualiza e `cancelled` projeta o estado — mas a operação é a mesma
 * em todos: *"o título hoje é assim"*. Três handlers com três caminhos seria
 * três lugares para o mesmo `upsert`, e a reentrega fora de ordem — que o
 * correio permite, porque garante *ao menos uma vez*, não *na ordem* — faria
 * dois deles discordarem.
 *
 * Como consequência, projetar é sempre **estado atual**, nunca delta. Um
 * `cancelled` que chegue antes de um `updated` atrasado deixa o título
 * atualizado e não cancelado, e isso é honesto: o payload atrasado descreve um
 * estado que existiu. A correção vem no próximo evento, porque o produtor
 * sempre manda o estado inteiro.
 */
export function handleExternalPayable(port: ExternalPayablePort) {
  return async (envelope: EventEnvelope): Promise<HandledOutcome> => {
    const traduzido = toExternalPayable(envelope);
    if (traduzido.kind === 'ignore') {
      return { kind: 'ignored', reason: traduzido.reason };
    }

    const efeito = await port.recordExternalPayable(traduzido.payable);
    if (efeito === 'skipped-imported') {
      return { kind: 'kept-local', externalRef: traduzido.payable.externalRef };
    }
    return { kind: 'projected', effect: efeito };
  };
}
