'use client';

import { useState, useTransition } from 'react';

import { isOverdrawn, orderAccounts } from '@alsham/bank-accounts';

import { registerMovement, setAccountStatus } from '@/app/bank-actions';
import type { AccountRow, BalanceRow } from '@/lib/data';
import { money } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo = 'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';
const botao = 'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';

export function BankBoard({
  accounts,
  balances,
  canManage,
  canRegister,
  canAdjust,
}: {
  accounts: readonly AccountRow[];
  balances: readonly BalanceRow[];
  canManage: boolean;
  canRegister: boolean;
  canAdjust: boolean;
}) {
  const ordenadas = orderAccounts(accounts) as readonly AccountRow[];
  const saldoPorConta = new Map(balances.map((b) => [b.accountId, b]));

  if (ordenadas.length === 0) {
    return <EmptyState title="Nenhuma conta ainda" hint="Cadastre a primeira conta — apelido, banco e moeda." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {ordenadas.map((a) => (
        <AccountCard
          key={a.id}
          account={a}
          balance={saldoPorConta.get(a.id) ?? null}
          canManage={canManage}
          canRegister={canRegister}
          canAdjust={canAdjust}
        />
      ))}
    </div>
  );
}

function AccountCard({
  account: a,
  balance,
  canManage,
  canRegister,
  canAdjust,
}: {
  account: AccountRow;
  balance: BalanceRow | null;
  canManage: boolean;
  canRegister: boolean;
  canAdjust: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [lanc, setLanc] = useState(false);
  const [tipo, setTipo] = useState<'in' | 'out' | 'adjustment'>('in');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [razao, setRazao] = useState('');
  const [pending, startTransition] = useTransition();

  const viva = a.status === 'active';
  const saldo = balance?.balanceCents ?? 0;
  const negativo = isOverdrawn(saldo);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErro(res.message ?? 'Não deu.');
      else { setLanc(false); setValor(''); setData(''); setDescricao(''); setRazao(''); }
    });
  }

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-bos-text">
            {a.name}
            {!viva ? <span className="ml-2"><Badge tone="neutral">arquivada</Badge></span> : null}
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            {[a.bankName, a.branch, a.accountNumber].filter(Boolean).join(' · ') || 'sem dados bancários'} · {a.currency}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-medium ${negativo ? 'text-bos-danger' : 'text-bos-text'}`}>
            {money(saldo, a.currency)}
          </p>
          {negativo ? <p className="text-xs text-bos-danger">cheque especial</p> : null}
          {balance ? <p className="text-xs text-bos-muted">{balance.movementCount} movimento(s)</p> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(canRegister || canAdjust) && viva && !lanc ? (
          <button type="button" className={botao} onClick={() => setLanc(true)}>Lançar…</button>
        ) : null}
        {canManage ? (
          <button
            type="button"
            disabled={pending}
            className={botaoNeutro}
            onClick={() => run(() => setAccountStatus({ accountId: a.id, status: viva ? 'archived' : 'active' }))}
          >
            {viva ? 'arquivar' : 'devolver'}
          </button>
        ) : null}
      </div>

      {lanc ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-bos-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as 'in' | 'out' | 'adjustment')}>
              {canRegister ? <option value="in">entrada</option> : null}
              {canRegister ? <option value="out">saída</option> : null}
              {canAdjust ? <option value="adjustment">ajuste</option> : null}
            </select>
            <input className={campo + ' w-28'} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="valor" />
            <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <input className={campo} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="descrição" />
            {tipo === 'adjustment' ? (
              <input className={campo} value={razao} onChange={(e) => setRazao(e.target.value)} placeholder="razão (obrigatória)" />
            ) : null}
            <button
              type="button"
              disabled={pending}
              className={botao}
              onClick={() =>
                run(() =>
                  registerMovement({
                    accountId: a.id, kind: tipo, amount: valor, currency: a.currency,
                    description: descricao, reason: razao, occurredOn: data,
                  }),
                )
              }
            >
              Lançar — no livro
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setLanc(false)}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
