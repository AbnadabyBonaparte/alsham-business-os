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
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A carteira de contratos — agora TABELA DE VERDADE (Mandato de Beleza, Bloco
 * Financeiro leva 2). Cada contrato é uma linha: valor VIGENTE à direita com
 * tabular figures. O detalhe (vigência, partes, reajustes/renovações) e TODAS
 * as ações (pôr em vigor, cancelar, reajustar, renovar, encerrar, rescindir —
 * a rescisão com razão obrigatória) vivem numa LINHA EXPANSÍVEL — a densidade
 * da tabela convivendo com a prosa que cada decisão exige.
 *
 * ⭐ **A tela não compara data:** termo vigente, fim vigente e prazo vêm de
 * `@alsham/contracts`.
 */

const campo = 'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

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
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Contrato</TH>
            <TH>Contraparte</TH>
            <TH num>Valor vigente</TH>
            <TH>Vigência</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {contracts.map((c) => (
            <ContractRowItem
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
        </TBody>
      </Table>
    </Panel>
  );
}

function ContractRowItem({
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
  const [aberto, setAberto] = useState(false);
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
  const painelId = `ctr-${c.id}`;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Falhou.');
      else setPainel('nenhum');
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{c.title}</span>
          <span className="ml-2 font-mono text-[11px] text-bos-muted">{c.externalRef}</span>
          {c.contractType ? (
            <span className="ml-2 align-middle">
              <Badge tone="neutral">{c.contractType}</Badge>
            </span>
          ) : null}
        </TD>
        <TD className="text-bos-text">{c.counterpartyName ?? 'Sem contraparte (rascunho)'}</TD>
        <TD num className="whitespace-nowrap">
          {valorVigente !== null && c.currency ? (
            <>
              <span className="text-bos-text">{money(valorVigente, c.currency)}</span>
              {c.valueCents !== null && valorVigente !== c.valueCents ? (
                <span className="block text-[11px] text-bos-muted">
                  original {money(c.valueCents, c.currency)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-bos-muted">—</span>
          )}
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">
          <span className="block">
            {c.startsOn ? shortDate(c.startsOn) : 'início a definir'}
            {fimVigente ? ` → ${shortDate(fimVigente)}` : ''}
          </span>
          {dias !== null && c.status === 'active' ? (
            <span className="mt-0.5 inline-block">
              <Badge tone={dias < 0 ? 'danger' : dias <= 30 ? 'warning' : 'neutral'}>
                {dias < 0 ? `vencido há ${-dias} dia(s)` : `vence em ${dias} dia(s)`}
              </Badge>
            </span>
          ) : null}
          {fimVigente === null && c.status === 'active' ? (
            <span className="mt-0.5 inline-block">
              <Badge tone="neutral">prazo indeterminado</Badge>
            </span>
          ) : null}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={TONS[c.status] ?? 'neutral'}>{ROTULOS[c.status] ?? c.status}</Badge>
        </TD>
        <TD className="text-right">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={painelId}
            className="text-[11px] text-bos-muted transition-colors hover:text-bos-text"
          >
            {aberto ? 'fechar' : 'detalhes'}
          </button>
        </TD>
      </TR>

      {aberto ? (
        <TR>
          <TD colSpan={6} className="bg-bos-elevated/20">
            <div id={painelId} className="flex flex-col gap-3 px-1 py-1">
              <p className="text-xs text-bos-muted">
                {c.startsOn ? `vigência desde ${shortDate(c.startsOn)}` : 'início a definir'}
                {fimVigente ? ` até ${shortDate(fimVigente)}` : ''}
                {adjustments.length > 0 ? ` · ${adjustments.length} reajuste(s)` : ''}
                {renewals.length > 0 ? ` · ${renewals.length} renovação(ões)` : ''}
              </p>
              {c.status === 'terminated' && c.outcomeReason ? (
                <p className="text-xs text-bos-danger">rescisão: {c.outcomeReason}</p>
              ) : null}

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

              {painel === 'reajuste' ? (
                <div className="flex flex-wrap items-end gap-2 border-t border-bos-border pt-3">
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
                <div className="flex flex-wrap items-end gap-2 border-t border-bos-border pt-3">
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
                <div className="flex flex-wrap items-end gap-2 border-t border-bos-border pt-3">
                  <label className="grow text-xs text-bos-muted">
                    Razão da rescisão* (fica no livro)
                    <input className={`${campo} w-full`} value={razao} onChange={(e) => setRazao(e.target.value)} placeholder="inadimplência · distrato consensual · descumprimento…" />
                  </label>
                  <button type="button" disabled={pending} className="rounded-md bg-bos-danger px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60" onClick={() => run(() => terminateContract({ contractId: c.id, reason: razao }))}>
                    Confirmar rescisão
                  </button>
                </div>
              ) : null}

              {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}
