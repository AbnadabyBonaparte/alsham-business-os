import { balanceOf } from '@alsham/bank-accounts';

import type { AccountRow, BalanceRow, BankPort, MovementRow } from './bank-port';

const agora = () => new Date().toISOString();
let seq = 10;
let movSeq = 0;

const accounts: AccountRow[] = [
  { id: 'mock-ac-1', name: 'Conta Principal', bankName: 'Banco Alfa', branch: '0001', accountNumber: '12345-6', currency: 'BRL', status: 'active', createdAt: agora() },
  { id: 'mock-ac-2', name: 'Conta Reserva', bankName: 'Banco Alfa', branch: '0001', accountNumber: '65432-1', currency: 'BRL', status: 'active', createdAt: agora() },
  { id: 'mock-ac-3', name: 'Conta Antiga', bankName: 'Banco Beta', branch: '0044', accountNumber: '00000-0', currency: 'BRL', status: 'archived', createdAt: agora() },
];

const movements: MovementRow[] = [
  { id: 'mock-mv-1', accountId: 'mock-ac-1', kind: 'in', amountCents: 500000, signedAmountCents: 500000, currency: 'BRL', description: 'recebimento', reason: '', counterpartyName: '', externalRef: null, transferId: null, occurredOn: '2026-07-05', createdAt: agora() },
  { id: 'mock-mv-2', accountId: 'mock-ac-1', kind: 'out', amountCents: 120000, signedAmountCents: -120000, currency: 'BRL', description: 'fornecedor', reason: '', counterpartyName: '', externalRef: null, transferId: null, occurredOn: '2026-07-10', createdAt: agora() },
];

function balances(): BalanceRow[] {
  const out: BalanceRow[] = [];
  for (const a of accounts) {
    const movs = movements.filter((m) => m.accountId === a.id);
    if (movs.length === 0 && a.status === 'archived') continue;
    out.push({
      accountId: a.id,
      accountName: a.name,
      currency: a.currency,
      balanceCents: balanceOf(movs),
      inflowCents: movs.filter((m) => m.signedAmountCents > 0).reduce((n, m) => n + m.signedAmountCents, 0),
      outflowCents: movs.filter((m) => m.signedAmountCents < 0).reduce((n, m) => n - m.signedAmountCents, 0),
      movementCount: movs.length,
    });
  }
  return out;
}

export function createBankMockPort(): BankPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['bank.account.manage', 'bank.movement.register', 'bank.movement.adjust']);
    },

    async loadAccounts() {
      return accounts.map((a) => ({ ...a }));
    },
    async loadBalances() {
      return balances();
    },
    async loadMovements(input) {
      return movements.filter((m) => m.accountId === input.accountId).map((m) => ({ ...m }));
    },

    async createAccount(input) {
      const id = `mock-ac-${(seq += 1)}`;
      accounts.push({ id, ...input, status: 'active', createdAt: agora() });
      return { accountId: id };
    },
    async setAccountStatus(input) {
      const a = accounts.find((x) => x.id === input.accountId);
      if (a) (a as { status: string }).status = input.status;
    },
    async registerMovement(input) {
      movSeq += 1;
      movements.unshift({
        id: `mock-mv-${movSeq + 10}`,
        accountId: input.accountId,
        kind: input.kind,
        amountCents: Math.abs(input.amountCents),
        signedAmountCents: input.kind === 'out' ? -Math.abs(input.amountCents) : input.amountCents,
        currency: input.currency,
        description: input.description,
        reason: input.reason,
        counterpartyName: '',
        externalRef: null,
        transferId: null,
        occurredOn: input.occurredOn,
        createdAt: agora(),
      });
    },
    async transfer(input) {
      const transfer = `mock-tr-${(movSeq += 1)}`;
      const from = accounts.find((a) => a.id === input.fromAccountId);
      const to = accounts.find((a) => a.id === input.toAccountId);
      const currency = from?.currency ?? 'BRL';
      movements.unshift({
        id: `${transfer}-out`, accountId: input.fromAccountId, kind: 'out', amountCents: input.amountCents,
        signedAmountCents: -input.amountCents, currency, description: input.description, reason: '',
        counterpartyName: to?.name ?? '', externalRef: null, transferId: transfer, occurredOn: input.occurredOn, createdAt: agora(),
      });
      movements.unshift({
        id: `${transfer}-in`, accountId: input.toAccountId, kind: 'in', amountCents: input.amountCents,
        signedAmountCents: input.amountCents, currency, description: input.description, reason: '',
        counterpartyName: from?.name ?? '', externalRef: null, transferId: transfer, occurredOn: input.occurredOn, createdAt: agora(),
      });
    },
  };
}
