import type { Payable, PayableStatus } from '@alsham/accounts-payable';

/** Um título como a tela precisa dele: o domínio mais o que só o banco sabe. */
export interface PayableRow extends Payable {
  readonly id: string;
  readonly createdAt: string;
}

/**
 * A PORTA DE DADOS do Módulo 3.
 *
 * ⚠️ **Porta própria — Lei do Lego (CLAUDE.md §5.5.8), terceira aplicação.**
 *
 * Seria mais curto acrescentar três métodos ao `DataPort` do `recon`, ainda por
 * cima porque os dois falam de "títulos a pagar". Seria também o erro mais
 * caro possível de cometer aqui: são **duas tabelas diferentes, em dois
 * schemas diferentes, com donos diferentes**. `ap.payables` é o documento; a
 * `recon.payables` é a PROJEÇÃO dele, escrita pelo correio. Uma porta que
 * servisse as duas convidaria a tela a escrever na projeção — e a projeção é do
 * outro módulo.
 *
 * ⭐ Repare no que esta interface **não** tem: nenhum `validar`, `podeCancelar`
 * ou `proximosEstados`. Quem decide é `@alsham/accounts-payable`. A porta
 * carrega e grava; a tela pergunta ao domínio e mostra.
 *
 * ⛔ E não há **nenhum** método que apague um título. Não é esquecimento:
 * `ap.payables` não tem policy nem GRANT de DELETE, de propósito. Cancelar é
 * `updateStatus(..., 'cancelled')`.
 */
export interface ApPort {
  readonly kind: 'mock' | 'supabase';

  /** As permissões `ap.*` do usuário no tenant atual. */
  listPermissions(): Promise<ReadonlySet<string>>;

  loadPayables(): Promise<PayableRow[]>;

  /**
   * Registra um título **já validado** por `validateNewPayable()`.
   *
   * Recebe o valor pronto. A porta não sabe que título nasce `open` nem que
   * moeda é ISO — se soubesse, a regra estaria em dois lugares, e dois lugares
   * divergem.
   *
   * É isto que dispara o trigger `payables_emit_registered` e põe
   * `ap.payable.registered` na caixa de saída do Core, **na mesma transação**.
   */
  createPayable(payable: Payable): Promise<{ payableId: string }>;

  /**
   * Aplica uma passagem de estado **já permitida** por `canTransition()`.
   *
   * O banco confere de novo — `ap.guard_status_transition()` — e é assim que se
   * quer: a tela é conveniência, o schema é lei.
   */
  updateStatus(input: { payableId: string; status: PayableStatus }): Promise<void>;

  /**
   * ⭐ **Registra ou ESTORNA valor liquidado — e grava valor e estado JUNTOS.**
   *
   * Nasceu no acabamento de demonstração, e a razão de ser um método só (em
   * vez de "registrar" e "estornar") é a mesma que fez o `usage_ledger` não ter
   * `delete`: **estorno é lançamento**. O valor novo é o total acumulado, e
   * quem o calcula é o pacote — a porta só grava.
   *
   * ⚠️ Valor e estado vão no MESMO `update`. Separá-los abriria um instante em
   * que o título tem valor de liquidado e estado de aberto — e a
   * `payables_status_coherent` do banco recusaria, com um erro que ninguém
   * entende.
   */
  applySettlement(input: {
    payableId: string;
    settledAmountCents: number;
    status: PayableStatus;
    settlementMethod: string | null;
  }): Promise<void>;
}
