'use client';

import { useState, useTransition } from 'react';

import {
  canClose,
  canEditTicket,
  canInteract,
  canReopen,
  canResolve,
  canStart,
  isOverdue,
  orderTickets,
} from '@alsham/care';
import type { CareCategory, CarePriority, Interaction } from '@alsham/care';

import { moveTicket, recordInteraction } from '@/app/care-actions';
import type { TicketRow } from '@/lib/data';
import { stamp } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  open: 'aberto',
  in_progress: 'em andamento',
  resolved: 'resolvido',
  closed: 'fechado',
};

export function CareQueue({
  tickets,
  categories,
  priorities,
  interactions,
  now,
  canManage,
  canResolvePerm,
}: {
  tickets: readonly TicketRow[];
  categories: readonly CareCategory[];
  priorities: readonly CarePriority[];
  interactions: readonly Interaction[];
  now: string;
  canManage: boolean;
  canResolvePerm: boolean;
}) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        title="Nenhum caso no balcão"
        hint="Abra o primeiro caso — a fila se ordena pela prioridade que o tenant desenhou."
      />
    );
  }

  // ⭐ A ORDEM é do pacote — prioridade do tenant, prazo, chegada.
  const fila = orderTickets(tickets, priorities) as readonly TicketRow[];

  return (
    <div className="flex flex-col gap-3">
      {fila.map((t) => (
        <TicketCard
          key={t.id}
          ticket={t}
          categories={categories}
          priorities={priorities}
          interactions={interactions.filter((i) => i.ticketId === t.id)}
          now={now}
          canManage={canManage}
          canResolvePerm={canResolvePerm}
        />
      ))}
    </div>
  );
}

function TicketCard({
  ticket: t,
  categories,
  priorities,
  interactions,
  now,
  canManage,
  canResolvePerm,
}: {
  ticket: TicketRow;
  categories: readonly CareCategory[];
  priorities: readonly CarePriority[];
  interactions: readonly Interaction[];
  now: string;
  canManage: boolean;
  canResolvePerm: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [fala, setFala] = useState('');
  const [canal, setCanal] = useState('');
  const [resolvendo, setResolvendo] = useState(false);
  const [pending, startTransition] = useTransition();

  const categoria = categories.find((c) => c.id === t.categoryId)?.name ?? null;
  const prioridade = priorities.find((p) => p.id === t.priorityId)?.name ?? null;
  const atrasado = isOverdue(t, now);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Falhou.');
      else {
        setResolvendo(false);
        setNota('');
        setFala('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg text-bos-text">{t.subject}</h2>
            <Badge tone={t.status === 'resolved' ? 'success' : t.status === 'closed' ? 'neutral' : 'warning'}>
              {ROTULOS[t.status]}
            </Badge>
            {prioridade ? <Badge tone="danger">{prioridade}</Badge> : null}
            {categoria ? <Badge tone="neutral">{categoria}</Badge> : null}
            {atrasado ? <Badge tone="danger">atrasado</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-bos-text">
            {t.requesterName}
            {t.requesterContact ? <span className="text-bos-muted"> · {t.requesterContact}</span> : null}
          </p>
          {t.description ? <p className="mt-1 text-xs text-bos-muted">{t.description}</p> : null}
          {t.status === 'resolved' && t.resolutionNote ? (
            <p className="mt-1 text-xs text-bos-muted">resolução: {t.resolutionNote}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && canStart(t.status) ? (
            <button type="button" disabled={pending} className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'in_progress' }))}>
              Atender
            </button>
          ) : null}
          {canManage && t.status === 'in_progress' ? (
            <button type="button" disabled={pending} className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'open' }))}>
              Devolver à fila
            </button>
          ) : null}
          {canResolvePerm && canResolve(t.status) ? (
            <button type="button" className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover" onClick={() => setResolvendo((v) => !v)}>
              Resolver…
            </button>
          ) : null}
          {canManage && canReopen(t.status) ? (
            <button type="button" disabled={pending} className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'open' }))}>
              Reabrir (o mesmo caso)
            </button>
          ) : null}
          {canResolvePerm && canClose(t.status) ? (
            <button type="button" disabled={pending} className="rounded-md border border-bos-danger px-3 py-1.5 text-sm text-bos-danger" onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'closed' }))}>
              Fechar de vez
            </button>
          ) : null}
        </div>
      </div>

      {resolvendo ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-bos-border pt-4">
          <label className="grow text-xs text-bos-muted">
            Nota de resolução (fica carimbada)
            <input className={`${campo} w-full`} value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
          <button type="button" disabled={pending} className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60" onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'resolved', resolutionNote: nota }))}>
            Confirmar resolução
          </button>
        </div>
      ) : null}

      {interactions.length > 0 ? (
        <div className="mt-4 border-t border-bos-border pt-3">
          {interactions.map((i) => (
            <p key={i.id} className="mt-1 text-xs text-bos-text">
              <span className="text-bos-muted">{stamp(i.occurredAt)}{i.channel ? ` · ${i.channel}` : ''} — </span>
              {i.body}
            </p>
          ))}
        </div>
      ) : null}

      {canManage && canInteract(t.status) && canEditTicket(t.status) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={`${campo} grow`} placeholder="registrar interação (eterna)" value={fala} onChange={(e) => setFala(e.target.value)} />
          <input className={`${campo} w-28`} placeholder="canal" value={canal} onChange={(e) => setCanal(e.target.value)} />
          <button type="button" disabled={pending} className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => run(() => recordInteraction({ ticketId: t.id, body: fala, channel: canal }))}>
            Registrar
          </button>
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
