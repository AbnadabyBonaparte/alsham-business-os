'use client';

import { useState, useTransition } from 'react';

import { canClose, canEditSurvey, canOpen, computeScore, orderSurveys } from '@alsham/nps';
import type { SurveyResponse } from '@alsham/nps';

import { closeSurvey, openSurvey, recordResponse, updateDraftSurvey } from '@/app/nps-actions';
import type { SurveyRow } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * O quadro — agora TABELA DE VERDADE (Mandato de Beleza). Ordenado pelo PACOTE
 * (`orderSurveys`): abertas primeiro. Cada rodada é uma LINHA de resumo:
 * pergunta, NPS, status e abertura. A régua 0–10, o livro de vozes, editar o
 * rascunho, abrir e encerrar vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **O placar é VIEW.** `computeScore` calcula do livro; nunca se guarda.
 * ⭐ **`closed` é TERMINAL** — a rodada que volta é pesquisa nova (o pacote
 * decide por `canClose`/`canOpen`/`canEditSurvey`).
 */

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  draft: 'rascunho',
  open: 'colhendo',
  closed: 'encerrada',
};

export function NpsBoard({
  surveys,
  responses,
  canManage,
  canRecord,
}: {
  surveys: readonly SurveyRow[];
  responses: readonly SurveyResponse[];
  canManage: boolean;
  canRecord: boolean;
}) {
  if (surveys.length === 0) {
    return (
      <EmptyState
        title="Nenhuma rodada ainda"
        hint="Redija a primeira medição — a régua é do método; a pergunta é sua."
      />
    );
  }

  const quadro = orderSurveys(surveys) as readonly SurveyRow[];

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Pesquisa</TH>
            <TH num>NPS</TH>
            <TH>Status</TH>
            <TH>Aberta</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {quadro.map((s) => (
            <SurveyRowItem
              key={s.id}
              survey={s}
              responses={responses.filter((r) => r.surveyId === s.id)}
              canManage={canManage}
              canRecord={canRecord}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function SurveyRowItem({
  survey: s,
  responses,
  canManage,
  canRecord,
}: {
  survey: SurveyRow;
  responses: readonly SurveyResponse[];
  canManage: boolean;
  canRecord: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [titulo, setTitulo] = useState(s.title);
  const [pergunta, setPergunta] = useState(s.question);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [quem, setQuem] = useState('');
  const [pending, startTransition] = useTransition();

  // ⭐ O placar é do PACOTE — calculado do livro, nunca guardado.
  const placar = computeScore(s, responses);
  const viva = s.status === 'open';
  const painelId = `nps-${s.id}`;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setEditando(false);
        setRespondendo(false);
        setNota(null);
        setComentario('');
        setQuem('');
      }
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{s.title}</span>
          <span className="mt-0.5 block text-xs italic text-bos-muted">“{s.question}”</span>
        </TD>
        <TD num className="whitespace-nowrap">
          {placar ? <span className="text-bos-text">{placar.score}</span> : <span className="text-bos-muted">—</span>}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={viva ? 'info' : s.status === 'draft' ? 'warning' : 'neutral'}>{ROTULOS[s.status]}</Badge>
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">
          {s.openedAt ? shortDate(s.openedAt) : <span className="italic">plano</span>}
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
                {s.closedAt ? <>encerrada em {shortDate(s.closedAt)} · </> : null}
                {placar ? (
                  <>
                    <span className="font-medium text-bos-text">NPS {placar.score}</span> ({placar.promoters} promotor(es) ·{' '}
                    {placar.passives} neutro(s) · {placar.detractors} detrator(es), de {placar.responses})
                  </>
                ) : (
                  <>ainda sem placar — sem voz, sem número</>
                )}
              </p>

              {editando ? (
                <div className="grid gap-2">
                  <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                  <textarea className={campo} rows={2} value={pergunta} onChange={(e) => setPergunta(e.target.value)} />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {canRecord && viva && !respondendo ? (
                  <button type="button" className={botao} onClick={() => setRespondendo(true)}>Registrar voz…</button>
                ) : null}
                {canManage && canEditSurvey(s.status) && !editando ? (
                  <button type="button" className={botaoNeutro} onClick={() => setEditando(true)}>Editar rascunho</button>
                ) : null}
                {editando ? (
                  <>
                    <button type="button" disabled={pending} className={botao} onClick={() => run(() => updateDraftSurvey({ surveyId: s.id, title: titulo, question: pergunta }))}>
                      Guardar rascunho
                    </button>
                    <button type="button" className={botaoNeutro} onClick={() => setEditando(false)}>Descartar edição</button>
                  </>
                ) : null}
                {canManage && canOpen(s.status) && !editando ? (
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => openSurvey({ surveyId: s.id }))}>
                    Abrir a coleta — a pergunta congela
                  </button>
                ) : null}
                {canManage && canClose(s.status) ? (
                  <button type="button" disabled={pending} className={botaoNeutro} onClick={() => run(() => closeSurvey({ surveyId: s.id }))}>
                    Encerrar — a rodada que volta é pesquisa nova
                  </button>
                ) : null}
              </div>

              {respondendo ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-bos-border pt-2">
                  <span className="flex items-center gap-1">
                    {Array.from({ length: 11 }, (_, n) => (
                      <button
                        key={n}
                        type="button"
                        className={
                          nota === n
                            ? 'h-6 w-6 rounded-md bg-bos-accent text-[11px] font-medium text-bos-bg'
                            : 'h-6 w-6 rounded-md border border-bos-border text-[11px] text-bos-muted hover:border-bos-accent'
                        }
                        onClick={() => setNota(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                  <input className={campo} placeholder="comentário (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
                  <input className={campo} placeholder="quem? neutro e opcional — 'mesa 12'" value={quem} onChange={(e) => setQuem(e.target.value)} />
                  <button type="button" disabled={pending || nota === null} className={botao} onClick={() => run(() => recordResponse({ surveyId: s.id, score: nota ?? -1, comment: comentario, respondent: quem }))}>
                    No livro
                  </button>
                  <button type="button" className={botaoNeutro} onClick={() => setRespondendo(false)}>Cancelar</button>
                </div>
              ) : null}

              {responses.length > 0 ? (
                <div className="border-t border-bos-border pt-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-bos-muted">O livro ({responses.length})</p>
                  {responses.map((r) => (
                    <p key={r.id} className="mt-1 text-xs text-bos-muted">
                      <span className="font-medium text-bos-text">{r.score}</span>
                      {r.comment ? <> — {r.comment}</> : null}
                      {r.respondent ? <> · {r.respondent}</> : null} · {shortDate(r.respondedAt)}
                    </p>
                  ))}
                </div>
              ) : null}

              {erro ? <p role="alert" className="text-xs text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text transition-colors hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted transition-colors hover:text-bos-text';
