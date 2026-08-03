'use client';

import { useState, useTransition } from 'react';

import { canAnswer, orderItems, runProgress } from '@alsham/checklists';
import type { Answer, ChkRunItem } from '@alsham/checklists';

import { abandonRun, answerItem, completeRun } from '@/app/chk-actions';
import type { ChkRunRow } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * O livro de EXECUÇÕES — agora TABELA DE VERDADE (Mandato de Beleza).
 *
 * ⭐⭐ **Modelo e execução são objetos DIFERENTES.** Esta tela lista as
 * EXECUÇÕES (runs): o desenho do modelo vive no `ChkSetup` (chk-forms),
 * renderizado pela página. Cada execução é uma LINHA — qual checklist, o
 * andamento (respondido/total, contado pelo PACOTE), a situação e a data de
 * abertura. A **prancheta** (os itens da execução + responder) e as ações de
 * concluir/abandonar vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **Este componente não decide nada.** Quanto já respondeu, se pode
 * responder um item — tudo é pergunta feita a `@alsham/checklists`.
 */

const ROTULOS: Record<string, string> = {
  in_progress: 'em execução',
  completed: 'concluída',
  abandoned: 'abandonada',
};

const RESPOSTA: Record<Answer, string> = {
  ok: 'ok',
  not_ok: 'não ok',
  not_applicable: 'n/a',
};

export function ChkBoard({
  runs,
  items,
  canExecute,
}: {
  runs: readonly ChkRunRow[];
  items: readonly ChkRunItem[];
  canExecute: boolean;
}) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="Nenhuma execução no livro"
        hint="Desenhe um modelo e abra a primeira — a prancheta congela na abertura."
      />
    );
  }

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Checklist</TH>
            <TH num>Andamento</TH>
            <TH>Situação</TH>
            <TH>Aberta em</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {runs.map((r) => (
            <ChkRunRowItem key={r.id} run={r} items={items} canExecute={canExecute} />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function ChkRunRowItem({
  run: r,
  items,
  canExecute,
}: {
  run: ChkRunRow;
  items: readonly ChkRunItem[];
  canExecute: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [razao, setRazao] = useState('');
  const [abandonando, setAbandonando] = useState(false);
  const [aberto, setAberto] = useState(r.status === 'in_progress');
  const [pending, startTransition] = useTransition();
  const painelId = `chk-run-${r.id}`;

  const daExecucao = orderItems(items.filter((i) => i.runId === r.id));
  // ⭐ O andamento é do PACOTE — contado, nunca estimado.
  const p = runProgress(daExecucao);
  const viva = r.status === 'in_progress';

  function run_(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErro(res.message ?? 'Não deu.');
      else {
        setAbandonando(false);
        setRazao('');
      }
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{r.templateName}</span>
          {r.subject ? (
            <span className="ml-2 text-xs text-bos-muted">{r.subject}</span>
          ) : null}
          {r.status === 'abandoned' && r.abandonReason ? (
            <span className="mt-0.5 block text-[11px] text-bos-muted">
              razão: {r.abandonReason}
            </span>
          ) : null}
        </TD>
        <TD num className="whitespace-nowrap text-bos-muted">
          {p.answered}/{p.total}
          {p.notOk > 0 ? (
            <span className="mt-0.5 block text-[11px] text-bos-danger">{p.notOk} não ok</span>
          ) : null}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={viva ? 'info' : r.status === 'completed' ? 'success' : 'warning'}>
            {ROTULOS[r.status]}
          </Badge>
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">{shortDate(r.startedAt)}</TD>
        <TD className="text-right">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={painelId}
            className="text-[11px] text-bos-muted transition-colors hover:text-bos-text"
          >
            {aberto ? 'fechar' : 'prancheta'}
          </button>
        </TD>
      </TR>

      {aberto ? (
        <TR>
          <TD colSpan={5} className="bg-bos-elevated/20">
            <div id={painelId} className="flex flex-col gap-3 px-1 py-1">
              <div className="flex flex-col gap-1.5 border-l border-bos-border pl-3">
                {daExecucao.map((item) => (
                  <ItemLinha
                    key={item.id}
                    item={item}
                    podeResponder={canExecute && canAnswer(r, item)}
                    onAnswer={(answer, note) =>
                      run_(() => answerItem({ runId: r.id, itemId: item.id, answer, note }))
                    }
                  />
                ))}
              </div>

              {viva && canExecute ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md bg-bos-accent px-2.5 py-1 text-xs font-medium text-bos-bg hover:bg-bos-accent-hover"
                    onClick={() => run_(() => completeRun({ runId: r.id }))}
                  >
                    Concluir — exige tudo respondido
                  </button>
                  {!abandonando ? (
                    <button
                      type="button"
                      className="rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text"
                      onClick={() => setAbandonando(true)}
                    >
                      Abandonar…
                    </button>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <input
                        className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
                        placeholder="a razão — a interrompida também é história"
                        value={razao}
                        onChange={(e) => setRazao(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg"
                        onClick={() => run_(() => abandonRun({ runId: r.id, reason: razao }))}
                      >
                        Abandonar de vez
                      </button>
                      <button
                        type="button"
                        className="rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text"
                        onClick={() => setAbandonando(false)}
                      >
                        Continuar
                      </button>
                    </span>
                  )}
                </div>
              ) : null}

              {erro ? <p className="text-xs text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

function ItemLinha({
  item,
  podeResponder,
  onAnswer,
}: {
  item: ChkRunItem;
  podeResponder: boolean;
  onAnswer: (answer: Answer, note: string) => void;
}) {
  const [nota, setNota] = useState('');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-bos-text">{item.itemText}</span>
      {item.answer !== null ? (
        <>
          <Badge tone={item.answer === 'ok' ? 'success' : item.answer === 'not_ok' ? 'danger' : 'neutral'}>
            {RESPOSTA[item.answer]}
          </Badge>
          {item.note ? <span className="text-xs text-bos-muted">{item.note}</span> : null}
        </>
      ) : podeResponder ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {(['ok', 'not_ok', 'not_applicable'] as const).map((a) => (
            <button
              key={a}
              type="button"
              className="rounded-md border border-bos-border px-2 py-0.5 text-xs text-bos-text hover:border-bos-accent"
              onClick={() => onAnswer(a, nota)}
            >
              {RESPOSTA[a]}
            </button>
          ))}
          <input
            className="rounded-md border border-bos-border bg-bos-bg px-2 py-0.5 text-xs text-bos-text"
            placeholder="nota (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        </span>
      ) : (
        <Badge tone="neutral">sem resposta</Badge>
      )}
    </div>
  );
}
