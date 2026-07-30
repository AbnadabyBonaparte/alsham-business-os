'use client';

import { useState, useTransition } from 'react';

import { canClose, canEditSurvey, canOpen, computeScore, orderSurveys } from '@alsham/nps';
import type { SurveyResponse } from '@alsham/nps';

import { closeSurvey, openSurvey, recordResponse, updateDraftSurvey } from '@/app/nps-actions';
import type { SurveyRow } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  draft: 'rascunho',
  open: 'colhendo',
  closed: 'encerrada',
};

/** O quadro — ordenado pelo PACOTE: abertas primeiro. */
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
    <div className="flex flex-col gap-3">
      {quadro.map((s) => (
        <SurveyCard
          key={s.id}
          survey={s}
          responses={responses}
          canManage={canManage}
          canRecord={canRecord}
        />
      ))}
    </div>
  );
}

function SurveyCard({
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
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [respondendo, setRespondendo] = useState(false);
  const [livroAberto, setLivroAberto] = useState(false);
  const [titulo, setTitulo] = useState(s.title);
  const [pergunta, setPergunta] = useState(s.question);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [quem, setQuem] = useState('');
  const [pending, startTransition] = useTransition();

  // ⭐ O placar é do PACOTE — calculado do livro, nunca guardado.
  const placar = computeScore(s, responses);
  const doLivro = responses.filter((r) => r.surveyId === s.id);
  const viva = s.status === 'open';

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
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-bos-text">{s.title}</p>
          {!editando ? <p className="mt-0.5 text-xs italic text-bos-muted">“{s.question}”</p> : null}
          <p className="mt-0.5 text-xs text-bos-muted">
            {s.openedAt ? <>coleta aberta em {shortDate(s.openedAt)}</> : <>a pergunta ainda é plano</>}
            {s.closedAt ? <> · encerrada em {shortDate(s.closedAt)}</> : null}
            {placar ? (
              <>
                {' '}· <span className="font-medium text-bos-text">NPS {placar.score}</span>{' '}
                ({placar.promoters} promotor(es) · {placar.passives} neutro(s) · {placar.detractors} detrator(es), de {placar.responses})
              </>
            ) : (
              <> · ainda sem placar — sem voz, sem número</>
            )}
          </p>
        </div>
        <Badge tone={viva ? 'info' : s.status === 'draft' ? 'warning' : 'neutral'}>
          {ROTULOS[s.status]}
        </Badge>
      </div>

      {editando ? (
        <div className="mt-3 grid gap-2">
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <textarea className={campo} rows={2} value={pergunta} onChange={(e) => setPergunta(e.target.value)} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canRecord && viva && !respondendo ? (
          <button type="button" className={botao} onClick={() => setRespondendo(true)}>
            Registrar voz…
          </button>
        ) : null}
        {respondendo ? (
          <span className="flex flex-wrap items-center gap-2">
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
            <button
              type="button"
              disabled={pending || nota === null}
              className={botao}
              onClick={() =>
                run(() => recordResponse({ surveyId: s.id, score: nota ?? -1, comment: comentario, respondent: quem }))
              }
            >
              No livro
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setRespondendo(false)}>
              Cancelar
            </button>
          </span>
        ) : null}

        {doLivro.length > 0 ? (
          <button type="button" className={botaoNeutro} onClick={() => setLivroAberto(!livroAberto)}>
            {livroAberto ? 'Fechar o livro' : `Abrir o livro (${doLivro.length})`}
          </button>
        ) : null}

        {canManage && canEditSurvey(s.status) && !editando ? (
          <button type="button" className={botaoNeutro} onClick={() => setEditando(true)}>
            Editar rascunho
          </button>
        ) : null}
        {editando ? (
          <>
            <button
              type="button"
              disabled={pending}
              className={botao}
              onClick={() => run(() => updateDraftSurvey({ surveyId: s.id, title: titulo, question: pergunta }))}
            >
              Guardar rascunho
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setEditando(false)}>
              Descartar edição
            </button>
          </>
        ) : null}

        {canManage && canOpen(s.status) && !editando ? (
          <button
            type="button"
            disabled={pending}
            className={botao}
            onClick={() => run(() => openSurvey({ surveyId: s.id }))}
          >
            Abrir a coleta — a pergunta congela
          </button>
        ) : null}

        {canManage && canClose(s.status) ? (
          <button
            type="button"
            disabled={pending}
            className={botaoNeutro}
            onClick={() => run(() => closeSurvey({ surveyId: s.id }))}
          >
            Encerrar — a rodada que volta é pesquisa nova
          </button>
        ) : null}
      </div>

      {livroAberto ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-bos-border pt-2">
          {doLivro.map((r) => (
            <li key={r.id} className="text-xs text-bos-muted">
              <span className="font-medium text-bos-text">{r.score}</span>
              {r.comment ? <> — {r.comment}</> : null}
              {r.respondent ? <> · {r.respondent}</> : null}
              {' '}· {shortDate(r.respondedAt)}
            </li>
          ))}
        </ul>
      ) : null}

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
