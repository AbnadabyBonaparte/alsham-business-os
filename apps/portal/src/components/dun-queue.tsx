'use client';

import { useState, useTransition } from 'react';

import { daysOverdue, isInQueue, nextStep, outstandingCentsOf, positionOf } from '@alsham/dunning';
import type { RulerStep, StepExecution } from '@alsham/dunning';

import { executeStep } from '@/app/dun-actions';
import type { DunTitleRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

/**
 * A FILA da régua. Quem está nela, quantos dias, qual o próximo passo — tudo
 * decidido pelo pacote (`isInQueue`, `daysOverdue`, `nextStep`, `positionOf`).
 * A tela não compara data nenhuma.
 */
export function DunQueue({
  titles,
  steps,
  executions,
  today,
  canExecute,
}: {
  titles: readonly DunTitleRow[];
  steps: readonly RulerStep[];
  executions: readonly StepExecution[];
  today: string;
  canExecute: boolean;
}) {
  const fila = titles.filter((t) => isInQueue(t, today));

  if (fila.length === 0) {
    return (
      <EmptyState
        title="Ninguém na régua"
        hint="A fila mostra os títulos VENCIDOS e em aberto, projetados dos fatos do módulo de títulos. A baixa na origem tira daqui sozinha."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {fila.map((t) => (
        <TitleCard
          key={t.id}
          title={t}
          steps={steps}
          executions={executions}
          today={today}
          canExecute={canExecute}
        />
      ))}
    </div>
  );
}

function TitleCard({
  title,
  steps,
  executions,
  today,
  canExecute,
}: {
  title: DunTitleRow;
  steps: readonly RulerStep[];
  executions: readonly StepExecution[];
  today: string;
  canExecute: boolean;
}) {
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const atraso = daysOverdue(title, today);
  const proximo = nextStep(title, steps, executions, today);
  const posicao = positionOf(title, executions);

  function run(stepId: string) {
    setErro(null);
    startTransition(async () => {
      const r = await executeStep({ titleId: title.id, stepId, note: nota });
      if (!r.ok) setErro(r.message);
      else setNota('');
    });
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg text-bos-text">
              {title.payerName ?? 'Sem pagador nomeado'}
            </h2>
            <span className="font-mono text-[11px] text-bos-muted">{title.externalRef}</span>
            <Badge tone="danger">{atraso} dia(s) de atraso</Badge>
            <Badge tone="neutral">via {title.sourceModuleId}</Badge>
          </div>
          <p className="mt-2 text-sm text-bos-text tabular">
            Em aberto {money(outstandingCentsOf(title), title.currency)} · venceu{' '}
            {shortDate(title.dueDate)}
          </p>
          <p className="mt-1 text-xs text-bos-muted">
            {posicao
              ? `Última cobrança: ${posicao.stepName}${posicao.channel ? ` (${posicao.channel})` : ''}`
              : 'Nenhum passo executado ainda.'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {proximo ? (
            <>
              <p className="text-sm text-bos-text">
                Próximo: <span className="font-medium">{proximo.name}</span>
                {proximo.channel ? (
                  <span className="text-bos-muted"> — {proximo.channel}</span>
                ) : null}
              </p>
              {canExecute ? (
                <span className="flex items-center gap-2">
                  <input
                    className="w-48 rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
                    placeholder="anotação (opcional)"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
                    onClick={() => run(proximo.id)}
                  >
                    Registrar feito
                  </button>
                </span>
              ) : (
                <Badge tone="neutral">sem dun.step.execute</Badge>
              )}
            </>
          ) : (
            <Badge tone="warning">régua esgotada — decisão fora dela</Badge>
          )}
        </div>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
