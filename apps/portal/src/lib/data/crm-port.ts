import type { Interaction, Party, PartyStatus } from '@alsham/crm';

/** Uma contraparte como a tela precisa dela: o domínio mais o que só o banco sabe. */
export interface PartyRow extends Party {
  readonly id: string;
  readonly createdAt: string;
}

/** Uma interação como a tela precisa dela. */
export interface InteractionRow extends Interaction {
  readonly id: string;
  readonly createdAt: string;
}

/**
 * A PORTA DE DADOS do Módulo 4.
 *
 * ⚠️ **Porta própria — Lei do Lego (CLAUDE.md §5.5.8), quarta aplicação.**
 *
 * A tentação aqui é diferente das anteriores e maior: o `ap` já guarda
 * `supplierName` e `counterpartyTaxId`, e seria "prático" a porta do CRM ler os
 * fornecedores de lá para sugerir contrapartes. Seria também um módulo lendo a
 * tabela de outro pela porta dos fundos — o que a Lei do Lego proíbe, e o que
 * faria desinstalar um deles quebrar o outro.
 *
 * Se um dia o fornecedor de um título virar contraparte, é por EVENTO, com
 * handler construído (Lei 7), e a projeção é local.
 *
 * ⭐ Repare no que esta interface **não** tem: nenhum `validar`, `buscar` ou
 * `podeArquivar`. Quem decide é `@alsham/crm`. A porta carrega e grava.
 *
 * ⛔ E não há **nenhum** método que edite ou apague interação. Não é
 * esquecimento: `crm.interactions` não tem policy de UPDATE, não tem GRANT de
 * UPDATE nem de DELETE, e tem um trigger que levanta erro. Fato consumado não
 * se edita — corrigir é registrar outra.
 */
export interface CrmPort {
  readonly kind: 'mock' | 'supabase';

  /** As permissões `crm.*` do usuário no tenant atual. */
  listPermissions(): Promise<ReadonlySet<string>>;

  /**
   * A carteira inteira, ativas e arquivadas.
   *
   * ⚠️ **Sem filtro de busca aqui, e é decisão.** Quem filtra é
   * `matchesQuery()`, no pacote — se a porta filtrasse, a mesma pergunta teria
   * duas respostas no dia em que a busca também acontecesse no servidor.
   */
  loadParties(): Promise<PartyRow[]>;

  /** O histórico de contato de UMA contraparte, do mais recente ao mais antigo. */
  loadInteractions(partyId: string): Promise<InteractionRow[]>;

  /**
   * ⭐ **O histórico de VÁRIAS contrapartes numa consulta só.**
   *
   * Nasceu para pagar a dívida que a Etapa 11 registrou no código da tela: a
   * página carregava o histórico com um `loadInteractions()` por contraparte,
   * e a própria nota dizia que o conserto seria "uma consulta só — agrupada —
   * na porta, e não um `fetch` no cliente". É esta.
   *
   * Devolve um mapa `partyId → histórico`. Contraparte sem contato nenhum
   * aparece com lista vazia, e não some do mapa: a tela precisa distinguir
   * "não tem contato" de "não perguntei".
   */
  loadInteractionsFor(partyIds: readonly string[]): Promise<Record<string, InteractionRow[]>>;

  /** Cadastra uma contraparte **já validada** por `validateNewParty()`. */
  createParty(party: Party): Promise<{ partyId: string }>;

  /**
   * Edita os campos de cadastro. **Não muda estado** — para isso existe
   * `updateStatus`, e a separação é a mesma do banco: editar exige
   * `crm.party.manage`, mudar de estado exige `crm.party.archive`.
   */
  updateParty(input: { partyId: string; party: Party }): Promise<void>;

  /**
   * Aplica uma passagem de estado **já permitida** por `canTransition()`.
   *
   * O banco confere de novo — `crm.guard_status_transition()` — e é assim que
   * se quer: a tela é conveniência, o schema é lei.
   */
  updateStatus(input: { partyId: string; status: PartyStatus }): Promise<void>;

  /** Registra um contato **já validado** por `validateNewInteraction()`. */
  recordInteraction(interaction: Interaction): Promise<{ interactionId: string }>;
}
