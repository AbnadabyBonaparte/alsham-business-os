'use client';

import { useState, useTransition } from 'react';

import { canCancel, canDecide, canSend, isExpirable } from '@alsham/quotes';
import type { ProposalStatus } from '@alsham/quotes';

import {
  decideProposal,
  expireProposal,
  sendProposal,
  withdrawProposal,
} from '@/app/quote-actions';
import type { ProposalRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ROTULO: Record<ProposalStatus, string> = {
  draft: 'rascunho',
  sent: 'na mesa',
  accepted: 'aceita',
  declined: 'recusada',
  expired: 'expirada',
  cancelled: 'retirada',
};

const TOM: Record<ProposalStatus, Tone> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  declined: 'danger',
  expired: 'warning',
  cancelled: 'neutral',
};

export function ProposalList({
  rows,
  today,
  canManageProposals,
  canDecideProposals,
  canCancelProposals,
}: {
  rows: readonly ProposalRow[];
  today: string;
  canManageProposals: boolean;
  canDecideProposals: boolean;
  canCancelProposals: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhuma proposta registrada"
        hint="Monte a primeira acima. Depois de enviada o conteúdo congela — e aceite ou recusa ficam carimbados com quem e quando."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          today={today}
          canManageProposals={canManageProposals}
          canDecideProposals={canDecideProposals}
          canCancelProposals={canCancelProposals}
        />
      ))}
    </div>
  );
}

function ProposalCard({
  proposal,
  today,
  canManageProposals,
  canDecideProposals,
  canCancelProposals,
}: {
  proposal: ProposalRow;
  today: string;
  canManageProposals: boolean;
  canDecideProposals: boolean;
  canCancelProposals: boolean;
}) {
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setErro(r.message ?? 'Falha');
      else setConfirmWithdraw(false);
    });
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg text-bos-text">
              {proposal.prospectName ?? 'Sem contraparte nomeada'}
            </h2>
            <span className="font-mono text-[11px] text-bos-muted">{proposal.externalRef}</span>
            <Badge tone={TOM[proposal.status]}>{ROTULO[proposal.status]}</Badge>
            {isExpirable(proposal, today) ? (
              <Badge tone="warning">validade vencida</Badge>
            ) : null}
          </div>
          {proposal.description ? (
            <p className="mt-1 max-w-2xl text-sm text-bos-muted">{proposal.description}</p>
          ) : null}
          <p className="mt-2 text-sm text-bos-text tabular">
            Total {money(proposal.totalCents, proposal.currency)} · {proposal.items.length}{' '}
            item(ns)
            {proposal.validUntil ? ` · válida até ${shortDate(proposal.validUntil)}` : ''}
          </p>
          {proposal.decidedAt ? (
            <p className="mt-1 text-xs text-bos-muted">
              Veredito registrado em {shortDate(proposal.decidedAt)}
              {proposal.decisionNote ? ` — ${proposal.decisionNote}` : ''}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageProposals && canSend(proposal.status) ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:bg-bos-surface"
              onClick={() => run(() => sendProposal({ proposalId: proposal.id }))}
            >
              Enviar
            </button>
          ) : null}
          {canDecideProposals && canDecide(proposal.status) ? (
            <>
              <input
                className="w-40 rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
                placeholder="nota do veredito (opcional)"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
              <button
                type="button"
                disabled={pending}
                className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:bg-bos-surface"
                onClick={() =>
                  run(() =>
                    decideProposal({ proposalId: proposal.id, decision: 'accepted', note: nota }),
                  )
                }
              >
                Registrar aceite
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
                onClick={() =>
                  run(() =>
                    decideProposal({ proposalId: proposal.id, decision: 'declined', note: nota }),
                  )
                }
              >
                Registrar recusa
              </button>
            </>
          ) : null}
          {canManageProposals && isExpirable(proposal, today) ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
              onClick={() => run(() => expireProposal({ proposalId: proposal.id }))}
            >
              Registrar expiração
            </button>
          ) : null}
          {canCancelProposals && canCancel(proposal.status) ? (
            confirmWithdraw ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-danger"
                  onClick={() => run(() => withdrawProposal({ proposalId: proposal.id }))}
                >
                  Confirmar retirada
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1.5 text-sm text-bos-muted"
                  onClick={() => setConfirmWithdraw(false)}
                >
                  Voltar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
                onClick={() => setConfirmWithdraw(true)}
              >
                Retirar
              </button>
            )
          ) : null}
        </div>
      </div>

      {proposal.items.length > 0 ? (
        <div className="mt-3 border-t border-bos-border pt-3">
          {proposal.items.map((i) => (
            <p key={i.lineNo} className="text-sm text-bos-muted tabular">
              {i.lineNo}. {i.description} — {i.quantity.toLocaleString('pt-BR')} ×{' '}
              {money(i.unitAmountCents, proposal.currency)} ={' '}
              {money(i.lineTotalCents, proposal.currency)}
            </p>
          ))}
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
