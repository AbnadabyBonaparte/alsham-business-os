'use client';

import { useState, useTransition } from 'react';

import { canCancel, canCheckIn, canCheckOut, canMarkNoShow, orderGate } from '@alsham/visits';

import { cancelVisit, checkInVisit, checkOutVisit, markNoShow } from '@/app/vis-actions';
import type { VisitRow } from '@/lib/data';
import { Badge, EmptyState, Panel } from '@/components/states';

const ROTULOS: Record<string, string> = {
  scheduled: 'agendada',
  checked_in: 'no pátio',
  checked_out: 'saiu',
  no_show: 'não veio',
  cancelled: 'desmarcada',
};

function hora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** O livro da portaria — ordenado pelo PACOTE: dentro, agendados, história. */
export function VisGate({
  visits,
  canRegister,
  canSchedule,
}: {
  visits: readonly VisitRow[];
  canRegister: boolean;
  canSchedule: boolean;
}) {
  if (visits.length === 0) {
    return (
      <EmptyState
        title="O livro está em branco"
        hint="Registre a primeira entrada — o carimbo é do servidor, nunca do relógio da parede."
      />
    );
  }

  const livro = orderGate(visits) as readonly VisitRow[];

  return (
    <div className="flex flex-col gap-3">
      {livro.map((v) => (
        <VisitaCard key={v.id} visit={v} canRegister={canRegister} canSchedule={canSchedule} />
      ))}
    </div>
  );
}

function VisitaCard({
  visit: v,
  canRegister,
  canSchedule,
}: {
  visit: VisitRow;
  canRegister: boolean;
  canSchedule: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [razao, setRazao] = useState('');
  const [desmarcando, setDesmarcando] = useState(false);
  const [pending, startTransition] = useTransition();

  const dentro = v.status === 'checked_in';

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setDesmarcando(false);
        setRazao('');
      }
    });
  }

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-bos-text">
            {v.visitorName}
            <span className="text-xs text-bos-muted"> · para {v.host}</span>
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            {v.reason ? <>{v.reason} · </> : null}
            {v.status === 'scheduled' ? <>esperada {hora(v.expectedAt)}</> : null}
            {v.checkedInAt ? <>entrou {hora(v.checkedInAt)}</> : null}
            {v.checkedOutAt ? <> · saiu {hora(v.checkedOutAt)}</> : null}
            {v.status === 'cancelled' ? <>desmarcada: {v.cancelReason}</> : null}
            {v.visitorDocument ? <> · doc. {v.visitorDocument}</> : null}
          </p>
        </div>
        <Badge
          tone={dentro ? 'info' : v.status === 'scheduled' ? 'warning' : v.status === 'checked_out' ? 'success' : 'neutral'}
        >
          {ROTULOS[v.status]}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canRegister && canCheckIn(v.status) ? (
          <button type="button" disabled={pending} className={botao} onClick={() => run(() => checkInVisit({ visitId: v.id }))}>
            Chegou — carimbar entrada
          </button>
        ) : null}
        {canRegister && canCheckOut(v.status) ? (
          <button type="button" disabled={pending} className={botao} onClick={() => run(() => checkOutVisit({ visitId: v.id }))}>
            Saiu — carimbar saída
          </button>
        ) : null}
        {canRegister && canMarkNoShow(v.status) ? (
          <button type="button" disabled={pending} className={botaoNeutro} onClick={() => run(() => markNoShow({ visitId: v.id }))}>
            Não veio
          </button>
        ) : null}
        {canSchedule && canCancel(v.status) && !desmarcando ? (
          <button type="button" className={botaoNeutro} onClick={() => setDesmarcando(true)}>
            Desmarcar…
          </button>
        ) : null}

        {desmarcando ? (
          <span className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
              placeholder="a razão — agenda que se apaga em silêncio mente"
              value={razao}
              onChange={(e) => setRazao(e.target.value)}
            />
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg"
              onClick={() => run(() => cancelVisit({ visitId: v.id, reason: razao }))}
            >
              Desmarcar de vez
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setDesmarcando(false)}>
              Manter
            </button>
          </span>
        ) : null}
      </div>

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
