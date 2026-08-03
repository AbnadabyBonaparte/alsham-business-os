'use client';

import { useState, useTransition } from 'react';

import { daysOverdue, isInQueue, nextStep, outstandingCentsOf, positionOf } from '@alsham/dunning';
import type { RulerStep, StepExecution } from '@alsham/dunning';

import { executeStep } from '@/app/dun-actions';
import type { DunTitleRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A FILA da régua — agora TABELA DE VERDADE (Mandato de Beleza). Quem está nela,
 * quantos dias, qual o próximo passo — tudo decidido pelo pacote (`isInQueue`,
 * `daysOverdue`, `nextStep`, `positionOf`). A tela não compara data nenhuma.
 * Cada título é uma LINHA de resumo: pagador, em aberto, atraso e próximo passo.
 * O histórico e o registrar-feito vivem numa LINHA EXPANSÍVEL.
 *
 * ⚠️ **O módulo NÃO ENVIA nada** — registrar o passo é ATO CARIMBADO, não um
 * disparo. Os títulos são projeção alimentada por `ar.*`; a baixa na origem tira
 * daqui sozinha.
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
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Pagador</TH>
            <TH num>Em aberto</TH>
            <TH num>Atraso</TH>
            <TH>Próximo passo</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {fila.map((t) => (
            <TitleRowItem
              key={t.id}
              title={t}
              steps={steps}
              executions={executions.filter((e) => e.titleId === t.id)}
              today={today}
              canExecute={canExecute}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function TitleRowItem({
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
  const [aberto, setAberto] = useState(false);
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const atraso = daysOverdue(title, today);
  const proximo = nextStep(title, steps, executions, today);
  const posicao = positionOf(title, executions);
  const painelId = `dun-${title.id}`;

  function run(stepId: string) {
    setErro(null);
    startTransition(async () => {
      const r = await executeStep({ titleId: title.id, stepId, note: nota });
      if (!r.ok) setErro(r.message);
      else setNota('');
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{title.payerName ?? 'Sem pagador nomeado'}</span>
          <span className="mt-0.5 block font-mono text-[11px] text-bos-muted">{title.externalRef}</span>
        </TD>
        <TD num className="whitespace-nowrap text-bos-text">{money(outstandingCentsOf(title), title.currency)}</TD>
        <TD num className="whitespace-nowrap">
          <span className="text-bos-danger">{atraso}</span> <span className="text-bos-muted">dia(s)</span>
        </TD>
        <TD className="whitespace-nowrap">
          {proximo ? (
            <span className="text-bos-text">
              {proximo.name}
              {proximo.channel ? <span className="text-bos-muted"> — {proximo.channel}</span> : null}
            </span>
          ) : (
            <Badge tone="warning">régua esgotada</Badge>
          )}
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
              <p className="text-xs text-bos-muted">
                venceu {shortDate(title.dueDate)} · via {title.sourceModuleId} ·{' '}
                {posicao
                  ? `última cobrança: ${posicao.stepName}${posicao.channel ? ` (${posicao.channel})` : ''}`
                  : 'nenhum passo executado ainda'}
              </p>

              {proximo ? (
                canExecute ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-bos-text">
                      Próximo: <span className="font-medium">{proximo.name}</span>
                      {proximo.channel ? <span className="text-bos-muted"> — {proximo.channel}</span> : null}
                    </span>
                    <input
                      className="w-48 rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
                      placeholder="anotação (opcional)"
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg transition-colors hover:bg-bos-accent-hover disabled:opacity-60"
                      onClick={() => run(proximo.id)}
                    >
                      Registrar feito
                    </button>
                  </div>
                ) : (
                  <Badge tone="neutral">sem dun.step.execute</Badge>
                )
              ) : (
                <Badge tone="warning">régua esgotada — decisão fora dela</Badge>
              )}

              {erro ? <p role="alert" className="text-sm text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}
