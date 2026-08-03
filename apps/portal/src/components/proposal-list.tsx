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
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A carteira de propostas — agora TABELA DE VERDADE (Mandato de Beleza, Bloco
 * Comercial & CRM). Cada proposta é uma linha: o TOTAL à direita com tabular
 * figures, a validade e a situação à mostra. O desmembramento dos itens e
 * TODAS as ações (enviar, registrar aceite/recusa com nota, registrar
 * expiração, retirar — a retirada com confirmação em dois passos) vivem numa
 * LINHA EXPANSÍVEL — a densidade da tabela convivendo com a decisão que cada
 * veredito exige.
 *
 * ⭐ **A tela não decide nada:** enviar, decidir, cancelar e expirar são
 * perguntas feitas a `@alsham/quotes`; depois de enviada, o conteúdo congela.
 */

const campo = 'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

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
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Proposta</TH>
            <TH num>Total</TH>
            <TH>Validade</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {rows.map((p) => (
            <ProposalRowItem
              key={p.id}
              proposal={p}
              today={today}
              canManageProposals={canManageProposals}
              canDecideProposals={canDecideProposals}
              canCancelProposals={canCancelProposals}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function ProposalRowItem({
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
  const [aberto, setAberto] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const vencida = isExpirable(proposal, today);
  const painelId = `quote-${proposal.id}`;

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setErro(r.message ?? 'Falha');
      else setConfirmWithdraw(false);
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{proposal.prospectName ?? 'Sem contraparte nomeada'}</span>
          <span className="ml-2 font-mono text-[11px] text-bos-muted">{proposal.externalRef}</span>
          {proposal.description ? (
            <span className="mt-0.5 block max-w-md truncate text-xs text-bos-muted">
              {proposal.description}
            </span>
          ) : null}
        </TD>
        <TD num className="whitespace-nowrap">
          <span className="text-bos-text">{money(proposal.totalCents, proposal.currency)}</span>
          <span className="block text-[11px] text-bos-muted">
            {proposal.items.length} item(ns)
          </span>
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">
          {proposal.validUntil ? shortDate(proposal.validUntil) : '—'}
          {vencida ? (
            <span className="mt-0.5 block">
              <Badge tone="warning">validade vencida</Badge>
            </span>
          ) : null}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={TOM[proposal.status]}>{ROTULO[proposal.status]}</Badge>
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
          <TD colSpan={5} className="bg-bos-elevated/20">
            <div id={painelId} className="flex flex-col gap-3 px-1 py-1">
              {proposal.decidedAt ? (
                <p className="text-xs text-bos-muted">
                  Veredito registrado em {shortDate(proposal.decidedAt)}
                  {proposal.decisionNote ? ` — ${proposal.decisionNote}` : ''}
                </p>
              ) : null}

              {proposal.items.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {proposal.items.map((i) => (
                    <p key={i.lineNo} className="text-sm text-bos-muted tabular">
                      {i.lineNo}. {i.description} — {i.quantity.toLocaleString('pt-BR')} ×{' '}
                      {money(i.unitAmountCents, proposal.currency)} ={' '}
                      {money(i.lineTotalCents, proposal.currency)}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-bos-border pt-3">
                {canManageProposals && canSend(proposal.status) ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
                    onClick={() => run(() => sendProposal({ proposalId: proposal.id }))}
                  >
                    Enviar
                  </button>
                ) : null}
                {canDecideProposals && canDecide(proposal.status) ? (
                  <>
                    <input
                      className={`${campo} w-40`}
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
                {canManageProposals && vencida ? (
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
                        className="rounded-md bg-bos-danger px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60"
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
                      className="rounded-md border border-bos-danger px-3 py-1.5 text-sm text-bos-danger hover:bg-bos-danger/15"
                      onClick={() => setConfirmWithdraw(true)}
                    >
                      Retirar…
                    </button>
                  )
                ) : null}
              </div>

              {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}
