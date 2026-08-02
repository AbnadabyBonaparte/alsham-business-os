'use client';

import { useState, useTransition } from 'react';

import { isOverBudget, orderBudgets, usedPercent } from '@alsham/budgets';

import { activateBudget, closeBudget, renameBudget } from '@/app/bud-actions';
import type { BudgetRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * Os orçamentos — agora TABELA DE VERDADE (Mandato de Beleza, Bloco Financeiro
 * leva 2). Cada orçamento é uma linha: realizado/teto à direita com tabular
 * figures, e a BARRA DE PROGRESSO preservada dentro da própria linha (o
 * indicador visual não se perde — só se reencaixa no formato). As ações
 * (renomear, ativar, fechar) vivem numa linha expansível.
 *
 * ⭐ **A tela não decide nada:** `usedPercent`, `isOverBudget` e a ordem vêm de
 * `@alsham/budgets`; o realizado é da VIEW (o teto da trave). A barra passa de
 * 100% e é honesta.
 */

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
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Orçamento</TH>
            <TH>Período</TH>
            <TH num>Realizado / Teto</TH>
            <TH>Progresso</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {ordenados.map((b) => (
            <BudgetRowItem key={b.id} budget={b} canManage={canManage} canClose={canClose} />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function BudgetRowItem({
  budget: b,
  canManage,
  canClose,
}: {
  budget: BudgetRow;
  canManage: boolean;
  canClose: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(b.name);
  const [pending, startTransition] = useTransition();

  const pct = usedPercent(b, b.realizedCents);
  const estourou = isOverBudget(b, b.realizedCents);
  const rascunho = b.status === 'draft';
  const ativo = b.status === 'active';
  const painelId = `bud-${b.id}`;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErro(res.message ?? 'Não deu.');
      else setEditando(false);
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD className="text-bos-text">{b.name}</TD>
        <TD className="whitespace-nowrap text-bos-muted">
          <span className="text-bos-text">{b.category}</span>
          <span className="block text-[11px]">
            {shortDate(b.startsOn)} → {shortDate(b.endsOn)}
          </span>
        </TD>
        <TD num className="whitespace-nowrap">
          <span className="text-bos-text">{money(b.realizedCents, b.currency)}</span>
          <span className="text-bos-muted"> / {money(b.limitCents, b.currency)}</span>
        </TD>
        {/* ⭐ A barra de progresso, reencaixada na célula — o indicador visual
            não se perde. Passa de 100% e é honesta (fica no vermelho). */}
        <TD className="w-48">
          <div
            role="meter"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${b.name}: ${pct}% do teto`}
            className="h-2 w-full overflow-hidden rounded-full bg-bos-border"
          >
            <div
              className={estourou ? 'h-full bg-bos-danger' : 'h-full bg-bos-accent'}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p className={`mt-1 text-[11px] ${estourou ? 'text-bos-danger' : 'text-bos-muted'}`}>
            {pct}%
            {estourou
              ? ` · estouro de ${money(-b.remainingCents, b.currency)}`
              : ` · ${money(b.remainingCents, b.currency)} de saldo`}
          </p>
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={b.status === 'active' ? 'success' : b.status === 'draft' ? 'warning' : 'neutral'}>
            {b.status === 'active' ? 'ativo' : b.status === 'draft' ? 'rascunho' : 'fechado'}
          </Badge>
        </TD>
        <TD className="text-right">
          {canManage || canClose ? (
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              aria-expanded={aberto}
              aria-controls={painelId}
              className="text-[11px] text-bos-muted transition-colors hover:text-bos-text"
            >
              {aberto ? 'fechar' : 'ações'}
            </button>
          ) : null}
        </TD>
      </TR>

      {aberto ? (
        <TR>
          <TD colSpan={6} className="bg-bos-elevated/20">
            <div id={painelId} className="flex flex-col gap-2 px-1 py-1">
              <p className="text-[11px] text-bos-muted">
                {pct}% do teto · {b.movementCount} lançamento(s) no período
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {editando ? (
                  <>
                    <input className={campo + ' w-56'} value={nome} onChange={(e) => setNome(e.target.value)} />
                    <button type="button" disabled={pending} className={botao}
                      onClick={() => run(() => renameBudget({ budgetId: b.id, name: nome }))}>
                      salvar
                    </button>
                    <button type="button" className={botaoNeutro} onClick={() => setEditando(false)}>cancelar</button>
                  </>
                ) : (
                  <>
                    {canManage ? (
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
                  </>
                )}
              </div>
              {erro ? <p className="text-xs text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}
