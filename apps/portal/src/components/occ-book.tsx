'use client';

import { useState, useTransition } from 'react';

import { canClose, canTreat, orderOccurrences } from '@alsham/occurrences';
import type { Severity, Treatment } from '@alsham/occurrences';

import { closeOccurrence, recordTreatment } from '@/app/occ-actions';
import type { OccurrenceRow } from '@/lib/data';
import { stamp } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * O livro — agora TABELA DE VERDADE (Mandato de Beleza). Ordenado pela
 * gravidade DO TENANT, pelo pacote (`orderOccurrences`). Cada ocorrência é uma
 * LINHA de resumo: identidade, gravidade/severidade, status e data. A história
 * de tratativas e as duas ações — registrar tratativa e **encerrar com
 * desfecho** — vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **A ocorrência NASCE IMUTÁVEL.** Não há edição do registro: corrigir é
 * ADICIONAR uma tratativa (linha eterna), e encerrar EXIGE o desfecho escrito.
 * Por isso a tela não oferece nenhum "editar" — o módulo não permite.
 *
 * ⭐ **Este componente não decide nada.** Se pode encerrar e se pode tratar são
 * perguntas feitas a `@alsham/occurrences` (`canClose`/`canTreat`).
 */

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

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
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Ocorrência</TH>
            <TH>Gravidade</TH>
            <TH>Status</TH>
            <TH>Data</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {livro.map((o) => (
            <OccRowItem
              key={o.id}
              occurrence={o}
              severities={severities}
              treatments={treatments.filter((t) => t.occurrenceId === o.id)}
              canTreatPerm={canTreatPerm}
              canClosePerm={canClosePerm}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function OccRowItem({
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
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tratativa, setTratativa] = useState('');
  const [desfecho, setDesfecho] = useState('');
  const [encerrando, setEncerrando] = useState(false);
  const [pending, startTransition] = useTransition();

  const gravidade = severities.find((s) => s.id === o.severityId)?.name ?? null;
  const painelId = `occ-${o.id}`;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Falhou.');
      else {
        setTratativa('');
        setDesfecho('');
        setEncerrando(false);
      }
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{o.title}</span>
          <span className="mt-0.5 block text-xs text-bos-muted">
            {o.location ? o.location : ''}
            {o.location && o.involved ? ' · ' : ''}
            {o.involved ? `envolvidos: ${o.involved}` : ''}
            {!o.location && !o.involved ? '—' : ''}
          </span>
        </TD>
        <TD className="whitespace-nowrap">
          {gravidade ? <Badge tone="danger">{gravidade}</Badge> : <span className="text-bos-muted">—</span>}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={o.status === 'open' ? 'warning' : 'neutral'}>
            {o.status === 'open' ? 'aberta' : 'encerrada'}
          </Badge>
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">{stamp(o.occurredAt)}</TD>
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
              <p className="max-w-2xl text-sm text-bos-text">{o.description}</p>

              {o.status === 'closed' ? (
                <p className="text-xs text-bos-muted">desfecho: {o.outcome}</p>
              ) : null}

              {treatments.length > 0 ? (
                <div className="border-t border-bos-border pt-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-bos-muted">
                    Tratativas (eternas)
                  </p>
                  {treatments.map((t) => (
                    <p key={t.id} className="mt-1 text-xs text-bos-text">
                      <span className="text-bos-muted">{stamp(t.occurredAt)} — </span>
                      {t.actionTaken}
                    </p>
                  ))}
                </div>
              ) : null}

              {canTreatPerm && canTreat(o.status) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={`${campo} grow`}
                    placeholder="registrar tratativa (eterna)"
                    value={tratativa}
                    onChange={(e) => setTratativa(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text transition-colors hover:bg-bos-surface disabled:opacity-60"
                    onClick={() => run(() => recordTreatment({ occurrenceId: o.id, actionTaken: tratativa }))}
                  >
                    Registrar
                  </button>
                </div>
              ) : null}

              {canClosePerm && canClose(o.status) ? (
                <div className="border-t border-bos-border pt-3">
                  {!encerrando ? (
                    <button
                      type="button"
                      onClick={() => setEncerrando(true)}
                      className="rounded-md border border-bos-danger/50 px-3 py-1.5 text-sm text-bos-danger transition-colors hover:bg-bos-danger/15"
                    >
                      Encerrar…
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="grow text-xs text-bos-muted">
                        Desfecho* (obrigatório — fica para sempre)
                        <input
                          className={`${campo} w-full`}
                          value={desfecho}
                          onChange={(e) => setDesfecho(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-md bg-bos-danger px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60"
                        onClick={() => run(() => closeOccurrence({ occurrenceId: o.id, outcome: desfecho }))}
                      >
                        {pending ? 'Encerrando…' : 'Confirmar encerramento'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEncerrando(false);
                          setErro(null);
                        }}
                        className="text-xs text-bos-muted transition-colors hover:text-bos-text"
                      >
                        Não fazer nada
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {erro ? (
                <p role="alert" className="text-sm text-bos-danger">
                  {erro}
                </p>
              ) : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}
