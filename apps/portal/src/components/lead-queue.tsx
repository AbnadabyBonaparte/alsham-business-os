'use client';

import { useState, useTransition } from 'react';

import { canDiscard, canQualify, canReturnToQueue, canTake, orderQueue } from '@alsham/leads';

import { discardLead, moveLead, qualifyLead } from '@/app/lead-actions';
import type { LeadRow } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  new: 'na fila',
  in_contact: 'em contato',
  qualified: 'qualificado',
  discarded: 'descartado',
};

/** A fila — ordenada pelo PACOTE: quem chegou primeiro, primeiro. */
export function LeadQueue({
  leads,
  canManage,
  canDecide,
}: {
  leads: readonly LeadRow[];
  canManage: boolean;
  canDecide: boolean;
}) {
  if (leads.length === 0) {
    return (
      <EmptyState
        title="A fila está vazia"
        hint="Registre o primeiro interesse — e a origem dele: é o dado que a fila existe para guardar."
      />
    );
  }

  const fila = orderQueue(leads) as readonly LeadRow[];

  return (
    <div className="flex flex-col gap-3">
      {fila.map((l) => (
        <LeadCard key={l.id} lead={l} canManage={canManage} canDecide={canDecide} />
      ))}
    </div>
  );
}

function LeadCard({
  lead: l,
  canManage,
  canDecide,
}: {
  lead: LeadRow;
  canManage: boolean;
  canDecide: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [razao, setRazao] = useState('');
  const [descartando, setDescartando] = useState(false);
  const [qualificando, setQualificando] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [oppId, setOppId] = useState('');
  const [oppTitle, setOppTitle] = useState('');
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setDescartando(false);
        setQualificando(false);
        setRazao('');
      }
    });
  }

  const vivo = l.status === 'new' || l.status === 'in_contact';

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-bos-text">
            {l.name}
            {l.source ? <span className="text-xs text-bos-muted"> · veio de: {l.source}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            {l.interest || 'interesse não anotado'}
            {l.contact ? <> · {l.contact}</> : null}
            <> · chegou {shortDate(l.createdAt)}</>
            {l.status === 'discarded' ? <> · razão: {l.discardReason}</> : null}
            {l.status === 'qualified' && l.partyName ? <> · virou: {l.partyName}</> : null}
            {l.status === 'qualified' && l.opportunityTitle ? <> · negócio: {l.opportunityTitle}</> : null}
          </p>
        </div>
        <Badge
          tone={l.status === 'new' ? 'warning' : l.status === 'in_contact' ? 'info' : l.status === 'qualified' ? 'success' : 'neutral'}
        >
          {ROTULOS[l.status]}
        </Badge>
      </div>

      {vivo ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canManage && canTake(l.status) ? (
            <button type="button" disabled={pending} className={botao} onClick={() => run(() => moveLead({ leadId: l.id, to: 'in_contact' }))}>
              Atender
            </button>
          ) : null}
          {canManage && canReturnToQueue(l.status) ? (
            <button type="button" disabled={pending} className={botaoNeutro} onClick={() => run(() => moveLead({ leadId: l.id, to: 'new' }))}>
              Devolver à fila
            </button>
          ) : null}
          {canDecide && canQualify(l.status) && !qualificando && !descartando ? (
            <button type="button" className={botao} onClick={() => setQualificando(true)}>
              Qualificar…
            </button>
          ) : null}
          {canDecide && canDiscard(l.status) && !descartando && !qualificando ? (
            <button type="button" className={botaoNeutro} onClick={() => setDescartando(true)}>
              Descartar…
            </button>
          ) : null}

          {qualificando ? (
            <span className="flex flex-wrap items-center gap-2">
              <input className={campo} placeholder="id da contraparte (crm)" value={partyId} onChange={(e) => setPartyId(e.target.value)} />
              <input className={campo} placeholder="nome carimbado" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
              <input className={campo} placeholder="id do negócio (funil)" value={oppId} onChange={(e) => setOppId(e.target.value)} />
              <input className={campo} placeholder="título carimbado" value={oppTitle} onChange={(e) => setOppTitle(e.target.value)} />
              <button
                type="button"
                disabled={pending}
                className={botao}
                onClick={() =>
                  run(() =>
                    qualifyLead({
                      leadId: l.id,
                      partyId,
                      partyName,
                      opportunityId: oppId,
                      opportunityTitle: oppTitle,
                    }),
                  )
                }
              >
                Qualificar — terminal
              </button>
              <button type="button" className={botaoNeutro} onClick={() => setQualificando(false)}>
                Ainda não
              </button>
            </span>
          ) : null}

          {descartando ? (
            <span className="flex flex-wrap items-center gap-2">
              <input
                className={campo}
                placeholder="a razão — a fila que apaga em silêncio esconde o funil"
                value={razao}
                onChange={(e) => setRazao(e.target.value)}
              />
              <button
                type="button"
                disabled={pending}
                className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg"
                onClick={() => run(() => discardLead({ leadId: l.id, reason: razao }))}
              >
                Descartar de vez
              </button>
              <button type="button" className={botaoNeutro} onClick={() => setDescartando(false)}>
                Manter na fila
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
