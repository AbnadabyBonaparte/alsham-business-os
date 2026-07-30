import type { AccountBalance, BankAccount, Movement } from '@alsham/bank-accounts';

export interface AccountRow extends BankAccount {
  readonly createdAt: string;
}

export interface MovementRow extends Movement {
  readonly createdAt: string;
}

export type BalanceRow = AccountBalance;

/**
 * Porta de dados do Módulo 30 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: apagar conta (arquiva-se), editar o livro (é
 * imutável), refazer a conciliação (é do recon). A transferência é rpc — a
 * função do banco grava as duas pernas na mesma transação.
 */
export interface BankPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadAccounts(): Promise<AccountRow[]>;
  loadBalances(): Promise<BalanceRow[]>;
  loadMovements(input: { accountId: string }): Promise<MovementRow[]>;
  createAccount(input: {
    name: string;
    bankName: string;
    branch: string;
    accountNumber: string;
    currency: string;
  }): Promise<{ accountId: string }>;
  setAccountStatus(input: { accountId: string; status: 'active' | 'archived' }): Promise<void>;
  registerMovement(input: {
    accountId: string;
    kind: 'in' | 'out' | 'adjustment';
    amountCents: number;
    currency: string;
    description: string;
    reason: string;
    occurredOn: string;
  }): Promise<void>;
  transfer(input: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    occurredOn: string;
    description: string;
  }): Promise<void>;
}
