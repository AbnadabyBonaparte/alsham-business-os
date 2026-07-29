'use client';

import { useState, useTransition } from 'react';

import {
  canAttend,
  canCancelEvent,
  canHold,
  canPublish,
  canRegister,
  canTransitionRegistration,
  isFull,
  remainingCapacity,
} from '@alsham/event-management';
import type { EventStatus, Registration, TenantEvent } from '@alsham/event-management';

import {
  changeEventStatus,
  changeRegistrationStatus,
  registerAttendee,
} from '@/app/evt-actions';
import type { EventRow, RegistrationRow } from '@/lib/data';
import { stamp } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ROTULO: Record<EventStatus, string> = {
  draft: 'rascunho',
  published: 'publicado',
  held: 'realizado',
  cancelled: 'cancelado',
};

const TOM: Record<EventStatus, Tone> = {
  draft: 'neutral',
  published: 'info',
  held: 'success',
  cancelled: 'neutral',
};

const ROTULO_REG = {
  registered: 'inscrita(o)',
  confirmed: 'confirmada(o)',
  cancelled: 'cancelou',
  attended: 'presente',
} as const;

export function EventList({
  events,
  registrations,
  now,
  canDecide,
  canManageRegistrations,
}: {
  events: readonly EventRow[];
  registrations: readonly RegistrationRow[];
  now: string;
  canDecide: boolean;
  canManageRegistrations: boolean;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="Nenhum evento na agenda"
        hint="Crie o primeiro acima. Publicar é abrir a lista de inscrições — e a lotação, quando existir, recusa em vez de fingir."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {events.map((e) => (
        <EventCard
          key={e.id}
          event={e}
          registrations={registrations.filter((r) => r.eventId === e.id)}
          now={now}
          canDecide={canDecide}
          canManageRegistrations={canManageRegistrations}
        />
      ))}
    </div>
  );
}

function EventCard({
  event,
  registrations,
  now,
  canDecide,
  canManageRegistrations,
}: {
  event: EventRow;
  registrations: readonly RegistrationRow[];
  now: string;
  canDecide: boolean;
  canManageRegistrations: boolean;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // As vagas vêm do PACOTE — a tela não conta.
  const vagas = remainingCapacity(event, registrations);
  const lotado = isFull(event, registrations);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setErro(r.message ?? 'Falha');
      else setConfirmCancel(false);
    });
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg text-bos-text">{event.name}</h2>
            <Badge tone={TOM[event.status]}>{ROTULO[event.status]}</Badge>
            {vagas !== null ? (
              <Badge tone={lotado ? 'danger' : 'neutral'}>
                {lotado ? 'lotado' : `${vagas} vaga(s)`}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-bos-muted tabular">
            {stamp(event.startsAt)}
            {event.endsAt ? ` → ${stamp(event.endsAt)}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          {event.description ? (
            <p className="mt-1 max-w-2xl text-sm text-bos-muted">{event.description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canDecide && canPublish(event.status) ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:bg-bos-surface"
              onClick={() => run(() => changeEventStatus({ eventId: event.id, to: 'published' }))}
            >
              Publicar
            </button>
          ) : null}
          {canDecide && canHold(event, now) ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:bg-bos-surface"
              onClick={() => run(() => changeEventStatus({ eventId: event.id, to: 'held' }))}
            >
              Registrar realizado
            </button>
          ) : null}
          {canDecide && canCancelEvent(event.status) ? (
            confirmCancel ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-danger"
                  onClick={() =>
                    run(() => changeEventStatus({ eventId: event.id, to: 'cancelled' }))
                  }
                >
                  Confirmar cancelamento
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1.5 text-sm text-bos-muted"
                  onClick={() => setConfirmCancel(false)}
                >
                  Voltar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
                onClick={() => setConfirmCancel(true)}
              >
                Cancelar evento
              </button>
            )
          ) : null}
          <button
            type="button"
            className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:bg-bos-surface"
            onClick={() => setListaAberta((v) => !v)}
          >
            Lista ({registrations.filter((r) => r.status !== 'cancelled').length})
          </button>
        </div>
      </div>

      {listaAberta ? (
        <RegistrationList
          event={event}
          registrations={registrations}
          canManageRegistrations={canManageRegistrations}
          pending={pending}
          run={run}
        />
      ) : null}

      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

function RegistrationList({
  event,
  registrations,
  canManageRegistrations,
  pending,
  run,
}: {
  event: TenantEvent;
  registrations: readonly RegistrationRow[];
  canManageRegistrations: boolean;
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; message?: string }>) => void;
}) {
  const [nome, setNome] = useState('');
  const [contato, setContato] = useState('');

  return (
    <div className="mt-4 border-t border-bos-border pt-3">
      {canManageRegistrations && canRegister(event) ? (
        <form
          className="mb-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              registerAttendee({
                eventId: event.id,
                attendeeName: nome,
                contact: contato.trim().length > 0 ? contato : null,
              }),
            );
            setNome('');
            setContato('');
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-bos-muted">
            Quem vem
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-bos-muted">
            Contato (qualquer instrumento)
            <input
              value={contato}
              onChange={(e) => setContato(e.target.value)}
              placeholder="e-mail, telefone, @perfil…"
              className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
          >
            Inscrever
          </button>
        </form>
      ) : null}

      {registrations.length === 0 ? (
        <p className="text-sm text-bos-muted">Ninguém na lista ainda.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {registrations.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-bos-text">{r.attendeeName}</span>
              {r.contact ? <span className="text-xs text-bos-muted">{r.contact}</span> : null}
              <Badge tone={r.status === 'attended' ? 'success' : r.status === 'cancelled' ? 'neutral' : 'info'}>
                {ROTULO_REG[r.status]}
              </Badge>
              {canManageRegistrations && canTransitionRegistration(r.status, 'confirmed') ? (
                <BotaoReg label="Confirmar" pending={pending}
                  onClick={() => run(() => changeRegistrationStatus({ registrationId: r.id, to: 'confirmed' }))} />
              ) : null}
              {canManageRegistrations && canAttend(r as Registration, event) ? (
                <BotaoReg label="Presente" pending={pending}
                  onClick={() => run(() => changeRegistrationStatus({ registrationId: r.id, to: 'attended' }))} />
              ) : null}
              {canManageRegistrations && canTransitionRegistration(r.status, 'cancelled') ? (
                <BotaoReg label="Cancelar" pending={pending}
                  onClick={() => run(() => changeRegistrationStatus({ registrationId: r.id, to: 'cancelled' }))} />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BotaoReg({
  label,
  pending,
  onClick,
}: {
  label: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-md border border-bos-border px-2 py-0.5 text-xs text-bos-muted hover:text-bos-text"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
