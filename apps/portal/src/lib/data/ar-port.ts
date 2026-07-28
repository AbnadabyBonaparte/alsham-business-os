import type { Receivable, ReceivableStatus } from '@alsham/accounts-receivable';

/** Um título como a tela precisa dele: o domínio mais o que só o banco sabe. */
export interface ReceivableRow extends Receivable {
  readonly id: string;
  readonly createdAt: string;
}

/**
 * A PORTA DE DADOS do Módulo 5.
 *
 * ⚠️ **Porta própria — Lei do Lego (CLAUDE.md §5.5.8), quinta aplicação.**
 *
 * Aqui a tentação é a maior de todas, e vale nomeá-la: esta porta é quase
 * idêntica à `ApPort`, e seria "óbvio" fazer uma `TitulosPort` genérica que
 * serve os dois. Seria o fim da fronteira — desinstalar Contas a Pagar deixaria
 * a tela de Contas a Receber com métodos que não respondem, e a divergência de
 * regra entre os dois (receber a maior é permitido, pagar a maior não) não
 * caberia numa assinatura só.
 *
 * ⭐ Repare no que esta interface **não** tem: nenhum `validar`, `podeCancelar`
 * ou `saldo`. Quem decide é `@alsham/accounts-receivable`.
 *
 * ⛔ E não há **nenhum** método que apague um título: `ar.receivables` não tem
 * policy nem GRANT de DELETE. Cancelar é `updateStatus(..., 'cancelled')`.
 */
export interface ArPort {
  readonly kind: 'mock' | 'supabase';

  /** As permissões `ar.*` do usuário no tenant atual. */
  listPermissions(): Promise<ReadonlySet<string>>;

  loadReceivables(): Promise<ReceivableRow[]>;

  /**
   * Registra um título **já validado** por `validateNewReceivable()`.
   *
   * É isto que dispara o trigger `receivables_emit_registered` e põe
   * `ar.receivable.registered` na caixa de saída do Core, **na mesma
   * transação**.
   */
  createReceivable(receivable: Receivable): Promise<{ receivableId: string }>;

  /**
   * Aplica uma passagem de estado **já permitida** por `canTransition()`.
   *
   * O banco confere de novo — `ar.guard_status_transition()` — e é assim que se
   * quer: a tela é conveniência, o schema é lei.
   */
  updateStatus(input: { receivableId: string; status: ReceivableStatus }): Promise<void>;
}
