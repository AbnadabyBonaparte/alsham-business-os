'use client';

import { useState, useTransition } from 'react';

import {
  canActivate,
  canAdjust,
  canCancel,
  canEnd,
  canRenew,
  currentEndsOn,
  currentValueCents,
  daysToEnd,
} from '@alsham/contracts';
import type { Adjustment, Renewal } from '@alsham/contracts';

import {
  activateContract,
  cancelContract,
  endContract,
  registerAdjustment,
  renewContract,
  terminateContract,
} from '@/app/ctr-actions';
import type { ContractRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

export function ContractList({
  contracts,
  adjustments,
  renewals,
  today,
  canManage,
  canAmend,
  canDecide,
}: {
  contracts: readonly ContractRow[];
  adjustments: readonly Adjustment[];
  renewals: readonly Renewal[];
  today: string;
  canManage: boolean;
  canAmend: boolean;
  canDecide: boolean;
}) {
  if (contracts.length === 0) {
    return (
      <EmptyState
        title="Nenhum contrato na carteira"
        hint="Registre o primeiro — ele nasce rascunho e só entra em vigor com contraparte e início."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {contracts.map((c) => (
        <ContractCard
          key={c.id}
          contract={c}
          adjustments={adjustments.filter((a) => a.contractId === c.id)}
          renewals={renewals.filter((r) => r.contractId === c.id)}
          today={today}
          canManage={canManage}
          canAmend={canAmend}
          canDecide={canDecide}
        />
      ))}
    </div>
  );
}

const TONS: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  active: 'success',
  ended: 'neutral',
  terminated: 'danger',
  cancelled: 'neutral',
};

const ROTULOS: Record<string, string> = {
  draft: 'rascunho',
  active: 'em vigor',
  ended: 'encerrado',
  terminated: 'rescindido',
  cancelled: 'cancelado',
};

function ContractCard({
  contract: c,
  adjustments,
  renewals,
  today,
  canManage,
  canAmend,
  canDecide,
}: {
  contract: ContractRow;
  adjustments: readonly Adjustment[];
  renewals: readonly Renewal[];
  today: string;
  canManage: boolean;
  canAmend: boolean;
  canDecide: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState<'nenhum' | 'reajuste' | 'renovacao' | 'rescisao'>('nenhum');
  const [pending, startTransition] = useTransition();

  const [razao, setRazao] = useState('');
  const [indice, setIndice] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [dataReajuste, setDataReajuste] = useState(today);
  const [novoFim, setNovoFim] = useState('');
  const [nota, setNota] = useState('');

  // ⭐ Termo VIGENTE e prazo: decisão do pacote — a tela não compara data.
  const valorVigente = currentValueCents(c, adjustments);
  const fimVigente = currentEndsOn(c, renewals);
  const dias = daysToEnd(c, renewals, today);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Falhou.');
      else setPainel('nenhum');
    });
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg text-bos-text">{c.title}</h2>
            <span className="font-mono text-[11px] text-bos-muted">{c.externalRef}</span>
            <Badge tone={TONS[c.status] ?? 'neutral'}>{ROTULOS[c.status] ?? c.status}</Badge>
            {c.contractType ? <Badge tone="neutral">{c.contractType}</Badge> : null}
            {dias !== null && c.status === 'active' ? (
              <Badge tone={dias < 0 ? 'danger' : dias <= 30 ? 'warning' : 'neutral'}>
                {dias < 0 ? `vencido há ${-dias} dia(s)` : `vence em ${dias} dia(s)`}
              </Badge>
            ) : null}
            {fimVigente === null && c.status === 'active' ? (
              <Badge tone="neutral">prazo indeterminado</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-bos-text">
            {c.counterpartyName ?? 'Sem contraparte (rascunho)'}
            {valorVigente !== null && c.currency ? (
              <span className="tabular"> · {money(valorVigente, c.currency)}</span>
            ) : null}
            {valorVigente !== null && c.valueCents !== null && valorVigente !== c.valueCents ? (
              <span className="text-xs text-bos-muted"> (original {money(c.valueCents, c.currency!)})</span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-bos-muted">
            {c.startsOn ? `vigência desde ${shortDate(c.startsOn)}` : 'início a definir'}
            {fimVigente ? ` até ${shortDate(fimVigente)}` : ''}
            {adjustments.length > 0 ? ` · ${adjustments.length} reajuste(s)` : ''}
            {renewals.length > 0 ? ` · ${renewals.length} renovação(ões)` : ''}
          </p>
          {c.status === 'terminated' && c.outcomeReason ? (
            <p className="mt-1 text-xs text-bos-danger">rescisão: {c.outcomeReason}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && canActivate(c) ? (
            <button type="button" disabled={pending} className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60" onClick={() => run(() => activateContract({ contractId: c.id }))}>
              Pôr em vigor
            </button>
          ) : null}
          {canManage && canCancel(c) ? (
            <button type="button" disabled={pending} className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => run(() => cancelContract({ contractId: c.id }))}>
              Cancelar rascunho
            </button>
          ) : null}
          {canAmend && canAdjust(c) ? (
            <button type="button" className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => setPainel(painel === 'reajuste' ? 'nenhum' : 'reajuste')}>
              Reajustar
            </button>
          ) : null}
          {canAmend && canRenew(c, renewals) ? (
            <button type="button" className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => setPainel(painel === 'renovacao' ? 'nenhum' : 'renovacao')}>
              Renovar
            </button>
          ) : null}
          {canDecide && canEnd(c, renewals, today) ? (
            <button type="button" disabled={pending} className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => run(() => endContract({ contractId: c.id }))}>
              Encerrar (prazo vencido)
            </button>
          ) : null}
          {canDecide && c.status === 'active' ? (
            <button type="button" className="rounded-md border border-bos-danger px-3 py-1.5 text-sm text-bos-danger" onClick={() => setPainel(painel === 'rescisao' ? 'nenhum' : 'rescisao')}>
              Rescindir…
            </button>
          ) : null}
        </div>
      </div>

      {painel === 'reajuste' ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-bos-border pt-4">
          <label className="text-xs text-bos-muted">
            Índice / acordo*
            <input className={campo} value={indice} onChange={(e) => setIndice(e.target.value)} placeholder="IGP-M · IPCA · acordo…" />
          </label>
          <label className="text-xs text-bos-muted">
            Novo valor
            <input className={campo} inputMode="decimal" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} placeholder="3850,00" />
          </label>
          <label className="text-xs text-bos-muted">
            Vale desde
            <input type="date" className={campo} value={dataReajuste} onChange={(e) => setDataReajuste(e.target.value)} />
          </label>
          <label className="text-xs text-bos-muted">
            Anotação
            <input className={campo} value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
          <button type="button" disabled={pending} className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60" onClick={() => run(() => registerAdjustment({ contractId: c.id, adjustedOn: dataReajuste, indexName: indice, newValueCents: Math.round(Number(novoValor.replace(',', '.')) * 100), note: nota }))}>
            Registrar reajuste
          </button>
        </div>
      ) : null}

      {painel === 'renovacao' ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-bos-border pt-4">
          <label className="text-xs text-bos-muted">
            Novo fim de vigência
            <input type="date" className={campo} value={novoFim} onChange={(e) => setNovoFim(e.target.value)} />
          </label>
          <label className="text-xs text-bos-muted">
            Anotação
            <input className={campo} value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
          <button type="button" disabled={pending} className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60" onClick={() => run(() => renewContract({ contractId: c.id, newEndsOn: novoFim, note: nota }))}>
            Renovar (estende o MESMO contrato)
          </button>
        </div>
      ) : null}

      {painel === 'rescisao' ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-bos-border pt-4">
          <label className="grow text-xs text-bos-muted">
            Razão da rescisão* (fica no livro)
            <input className={`${campo} w-full`} value={razao} onChange={(e) => setRazao(e.target.value)} placeholder="inadimplência · distrato consensual · descumprimento…" />
          </label>
          <button type="button" disabled={pending} className="rounded-md bg-bos-danger px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60" onClick={() => run(() => terminateContract({ contractId: c.id, reason: razao }))}>
            Confirmar rescisão
          </button>
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
