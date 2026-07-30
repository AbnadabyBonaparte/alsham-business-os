'use client';

import { useState, useTransition } from 'react';

import { isOverBudget, orderBudgets, usedPercent } from '@alsham/budgets';

import { activateBudget, closeBudget, renameBudget } from '@/app/bud-actions';
import type { BudgetRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const botao = 'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
const campo = 'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

export function BudBoard({
  budgets,
  canManage,
  canClose,
}: {
  budgets: readonly BudgetRow[];
  canManage: boolean;
  canClose: boolean;
}) {
  const ordenados = orderBudgets(budgets) as readonly BudgetRow[];

  if (ordenados.length === 0) {
    return <EmptyState title="Nenhum orçamento ainda" hint="Crie o primeiro — categoria, período e teto. O realizado vem do caixa." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {ordenados.map((b) => (
        <BudgetCard key={b.id} budget={b} canManage={canManage} canClose={canClose} />
      ))}
    </div>
  );
}

function BudgetCard({
  budget: b,
  canManage,
  canClose,
}: {
  budget: BudgetRow;
  canManage: boolean;
  canClose: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(b.name);
  const [pending, startTransition] = useTransition();

  const pct = usedPercent(b, b.realizedCents);
  const estourou = isOverBudget(b, b.realizedCents);
  const rascunho = b.status === 'draft';
  const ativo = b.status === 'active';

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErro(res.message ?? 'Não deu.');
      else setEditando(false);
    });
  }

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {editando ? (
            <div className="flex items-center gap-2">
              <input className={campo + ' w-56'} value={nome} onChange={(e) => setNome(e.target.value)} />
              <button type="button" disabled={pending} className={botao}
                onClick={() => run(() => renameBudget({ budgetId: b.id, name: nome }))}>
                salvar
              </button>
              <button type="button" className={botaoNeutro} onClick={() => setEditando(false)}>cancelar</button>
            </div>
          ) : (
            <p className="text-sm font-medium text-bos-text">{b.name}</p>
          )}
          <p className="mt-0.5 text-xs text-bos-muted">
            {b.category} · {shortDate(b.startsOn)} → {shortDate(b.endsOn)}
          </p>
        </div>
        <Badge tone={b.status === 'active' ? 'success' : b.status === 'draft' ? 'warning' : 'neutral'}>
          {b.status === 'active' ? 'ativo' : b.status === 'draft' ? 'rascunho' : 'fechado'}
        </Badge>
      </div>

      {/* ⭐ O realizado é da VIEW — o teto da trave. A barra passa de 100 e é honesta. */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-bos-text">
          <span>
            {money(b.realizedCents, b.currency)} de {money(b.limitCents, b.currency)}
          </span>
          <span className={estourou ? 'text-bos-danger' : 'text-bos-muted'}>
            {estourou ? `estouro de ${money(-b.remainingCents, b.currency)}` : `${money(b.remainingCents, b.currency)} de saldo`}
          </span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-bos-border">
          <div
            className={estourou ? 'h-full bg-bos-danger' : 'h-full bg-bos-accent'}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-bos-muted">
          {pct}% do teto · {b.movementCount} lançamento(s) no período
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canManage && !editando ? (
          <button type="button" className={botaoNeutro} onClick={() => { setNome(b.name); setEditando(true); }}>
            renomear
          </button>
        ) : null}
        {canManage && rascunho ? (
          <button type="button" disabled={pending} className={botao}
            onClick={() => run(() => activateBudget({ budgetId: b.id, status: b.status }))}>
            Ativar — congela a trave
          </button>
        ) : null}
        {canClose && ativo ? (
          <button type="button" disabled={pending} className={botao}
            onClick={() => run(() => closeBudget({ budgetId: b.id, status: b.status }))}>
            Fechar período — terminal
          </button>
        ) : null}
      </div>

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
