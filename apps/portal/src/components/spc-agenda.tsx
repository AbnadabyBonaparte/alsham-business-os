'use client';

import { useState, useTransition } from 'react';

import { canCancel, orderAgenda } from '@alsham/spaces';
import type { Space } from '@alsham/spaces';

import { cancelReservation } from '@/app/spc-actions';
import type { ReservationRow } from '@/lib/data';
import { Badge, EmptyState, Panel } from '@/components/states';

function periodo(startsAt: string, endsAt: string): string {
  const f = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${f(startsAt)} → ${f(endsAt)}`;
}

/** A agenda — ordenada pelo PACOTE; o conflito quem recusa é a constraint. */
export function SpcAgenda({
  reservations,
  spaces,
  canManage,
}: {
  reservations: readonly ReservationRow[];
  spaces: readonly Space[];
  canManage: boolean;
}) {
  if (reservations.length === 0) {
    return (
      <EmptyState
        title="Agenda vazia"
        hint="Reserve o primeiro período — o conflito é recusado pelo banco, nunca por sorte."
      />
    );
  }

  const agenda = orderAgenda(reservations) as readonly ReservationRow[];

  return (
    <div className="flex flex-col gap-3">
      {agenda.map((r) => (
        <ReservaCard key={r.id} reservation={r} spaces={spaces} canManage={canManage} />
      ))}
    </div>
  );
}

function ReservaCard({
  reservation: r,
  spaces,
  canManage,
}: {
  reservation: ReservationRow;
  spaces: readonly Space[];
  canManage: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [razao, setRazao] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [pending, startTransition] = useTransition();

  const espaco = spaces.find((s) => s.id === r.spaceId)?.name ?? '—';
  const cancelada = r.status === 'cancelled';

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-bos-text">
            {espaco} <span className="text-xs text-bos-muted">· {periodo(r.startsAt, r.endsAt)}</span>
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            {r.purpose || 'sem finalidade — e sem finalidade também vale'}
            {cancelada ? <> · cancelada: {r.cancelReason}</> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={cancelada ? 'neutral' : 'info'}>{cancelada ? 'cancelada' : 'reservada'}</Badge>
          {canManage && canCancel(r.status) && !cancelando ? (
            <button
              type="button"
              className="rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text"
              onClick={() => setCancelando(true)}
            >
              Cancelar…
            </button>
          ) : null}
        </div>
      </div>

      {cancelando ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
            placeholder="a razão — desmarcar sem porquê é agenda que se apaga"
            value={razao}
            onChange={(e) => setRazao(e.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg"
            onClick={() => {
              setErro(null);
              startTransition(async () => {
                const res = await cancelReservation({ reservationId: r.id, reason: razao });
                if (!res.ok) setErro(res.message);
                else {
                  setCancelando(false);
                  setRazao('');
                }
              });
            }}
          >
            Cancelar de vez — o período libera sozinho
          </button>
          <button
            type="button"
            className="rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text"
            onClick={() => setCancelando(false)}
          >
            Manter
          </button>
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
