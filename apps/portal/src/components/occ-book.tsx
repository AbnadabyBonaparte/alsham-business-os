'use client';

import { useState, useTransition } from 'react';

import { canClose, canTreat, orderOccurrences } from '@alsham/occurrences';
import type { Severity, Treatment } from '@alsham/occurrences';

import { closeOccurrence, recordTreatment } from '@/app/occ-actions';
import type { OccurrenceRow } from '@/lib/data';
import { stamp } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

/** O livro — ordenado pela gravidade DO TENANT, pelo pacote. */
export function OccBook({
  occurrences,
  severities,
  treatments,
  canTreatPerm,
  canClosePerm,
}: {
  occurrences: readonly OccurrenceRow[];
  severities: readonly Severity[];
  treatments: readonly Treatment[];
  canTreatPerm: boolean;
  canClosePerm: boolean;
}) {
  if (occurrences.length === 0) {
    return (
      <EmptyState
        title="Livro vazio"
        hint="Registre o primeiro fato — o registro nasce imutável: corrigir é tratativa."
      />
    );
  }

  const livro = orderOccurrences(occurrences, severities) as readonly OccurrenceRow[];

  return (
    <div className="flex flex-col gap-3">
      {livro.map((o) => (
        <OccCard
          key={o.id}
          occurrence={o}
          severities={severities}
          treatments={treatments.filter((t) => t.occurrenceId === o.id)}
          canTreatPerm={canTreatPerm}
          canClosePerm={canClosePerm}
        />
      ))}
    </div>
  );
}

function OccCard({
  occurrence: o,
  severities,
  treatments,
  canTreatPerm,
  canClosePerm,
}: {
  occurrence: OccurrenceRow;
  severities: readonly Severity[];
  treatments: readonly Treatment[];
  canTreatPerm: boolean;
  canClosePerm: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [tratativa, setTratativa] = useState('');
  const [desfecho, setDesfecho] = useState('');
  const [encerrando, setEncerrando] = useState(false);
  const [pending, startTransition] = useTransition();

  const gravidade = severities.find((s) => s.id === o.severityId)?.name ?? null;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Falhou.');
      else {
        setTratativa('');
        setEncerrando(false);
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg text-bos-text">{o.title}</h2>
            <Badge tone={o.status === 'open' ? 'warning' : 'neutral'}>
              {o.status === 'open' ? 'aberta' : 'encerrada'}
            </Badge>
            {gravidade ? <Badge tone="danger">{gravidade}</Badge> : null}
            {o.location ? <Badge tone="neutral">{o.location}</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-bos-text">{o.description}</p>
          <p className="mt-1 text-xs text-bos-muted">
            aconteceu em {stamp(o.occurredAt)}
            {o.involved ? ` · envolvidos: ${o.involved}` : ''}
          </p>
          {o.status === 'closed' ? (
            <p className="mt-1 text-xs text-bos-muted">desfecho: {o.outcome}</p>
          ) : null}
        </div>

        {canClosePerm && canClose(o.status) ? (
          <button
            type="button"
            className="rounded-md border border-bos-danger px-3 py-1.5 text-sm text-bos-danger"
            onClick={() => setEncerrando((v) => !v)}
          >
            Encerrar…
          </button>
        ) : null}
      </div>

      {encerrando ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-bos-border pt-4">
          <label className="grow text-xs text-bos-muted">
            Desfecho* (obrigatório — fica para sempre)
            <input className={`${campo} w-full`} value={desfecho} onChange={(e) => setDesfecho(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={pending}
            className="rounded-md bg-bos-danger px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60"
            onClick={() => run(() => closeOccurrence({ occurrenceId: o.id, outcome: desfecho }))}
          >
            Confirmar encerramento
          </button>
        </div>
      ) : null}

      {treatments.length > 0 ? (
        <div className="mt-4 border-t border-bos-border pt-3">
          {treatments.map((t) => (
            <p key={t.id} className="mt-1 text-xs text-bos-text">
              <span className="text-bos-muted">{stamp(t.occurredAt)} — </span>
              {t.actionTaken}
            </p>
          ))}
        </div>
      ) : null}

      {canTreatPerm && canTreat(o.status) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className={`${campo} grow`}
            placeholder="registrar tratativa (eterna)"
            value={tratativa}
            onChange={(e) => setTratativa(e.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text"
            onClick={() => run(() => recordTreatment({ occurrenceId: o.id, actionTaken: tratativa }))}
          >
            Registrar
          </button>
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
