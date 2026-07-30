'use client';

import { useState, useTransition } from 'react';

import { ackCount, canArchive, canEditNotice, canPublish, hasAcked, orderBoard } from '@alsham/comms';
import type { NoticeAck } from '@alsham/comms';

import { ackNotice, archiveNotice, publishNotice, updateDraftNotice } from '@/app/comm-actions';
import { CommForm } from '@/components/comm-forms';
import type { NoticeRow } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  draft: 'rascunho',
  published: 'no mural',
  archived: 'arquivado',
};

/** O mural — ordenado pelo PACOTE: publicados primeiro, depois rascunhos, depois o arquivo. */
export function CommBoard({
  notices,
  acks,
  userId,
  canManage,
  canAckPerm,
}: {
  notices: readonly NoticeRow[];
  acks: readonly NoticeAck[];
  userId: string;
  canManage: boolean;
  canAckPerm: boolean;
}) {
  const [corrigindo, setCorrigindo] = useState<{ id: string; title: string } | null>(null);

  if (notices.length === 0) {
    return (
      <EmptyState
        title="Mural vazio"
        hint="Redija o primeiro comunicado — nasce no rascunho, e só vai ao mural quando você der a palavra."
      />
    );
  }

  const mural = orderBoard(notices) as readonly NoticeRow[];

  return (
    <div className="flex flex-col gap-3">
      {corrigindo ? (
        <CommForm key={corrigindo.id} correcting={corrigindo} onDone={() => setCorrigindo(null)} />
      ) : null}
      {mural.map((n) => (
        <NoticeCard
          key={n.id}
          notice={n}
          acks={acks}
          userId={userId}
          canManage={canManage}
          canAckPerm={canAckPerm}
          onCorrect={() => setCorrigindo({ id: n.id, title: n.title })}
        />
      ))}
    </div>
  );
}

function NoticeCard({
  notice: n,
  acks,
  userId,
  canManage,
  canAckPerm,
  onCorrect,
}: {
  notice: NoticeRow;
  acks: readonly NoticeAck[];
  userId: string;
  canManage: boolean;
  canAckPerm: boolean;
  onCorrect: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(n.title);
  const [audiencia, setAudiencia] = useState(n.audience);
  const [corpo, setCorpo] = useState(n.body);
  const [pending, startTransition] = useTransition();

  // ⭐ Ciência e cobertura são do PACOTE.
  const jaLi = hasAcked(n, userId, acks);
  const cobertura = ackCount(n, acks);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else setEditando(false);
    });
  }

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-bos-text">
            {n.title} <span className="text-xs text-bos-muted">· para {n.audience}</span>
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            {n.publishedAt ? <>publicado em {shortDate(n.publishedAt)}</> : <>ainda não publicado</>}
            {n.status !== 'draft' ? (
              <> · {cobertura} ciência(s){jaLi ? ' — a sua entre elas' : ''}</>
            ) : null}
            {n.correctsNoticeId ? (
              <> · corrige <span className="text-bos-text">“{n.correctsTitle}”</span></>
            ) : null}
          </p>
          {n.body.trim().length > 0 && !editando ? (
            <p className="mt-2 whitespace-pre-wrap text-xs text-bos-text">{n.body}</p>
          ) : null}
        </div>
        <Badge tone={n.status === 'published' ? 'info' : n.status === 'draft' ? 'warning' : 'neutral'}>
          {ROTULOS[n.status]}
        </Badge>
      </div>

      {editando ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <input className={campo} value={audiencia} onChange={(e) => setAudiencia(e.target.value)} />
          <textarea
            className={`${campo} sm:col-span-2`}
            rows={3}
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canAckPerm && n.status === 'published' && !jaLi ? (
          <button
            type="button"
            disabled={pending}
            className={botao}
            onClick={() => run(() => ackNotice({ noticeId: n.id }))}
          >
            Ciente — uma vez, do próprio punho
          </button>
        ) : null}

        {canManage && canEditNotice(n.status) && !editando ? (
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
              onClick={() =>
                run(() => updateDraftNotice({ noticeId: n.id, title: titulo, body: corpo, audience: audiencia }))
              }
            >
              Guardar rascunho
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setEditando(false)}>
              Descartar edição
            </button>
          </>
        ) : null}

        {canManage && canPublish(n.status) && !editando ? (
          <button
            type="button"
            disabled={pending}
            className={botao}
            onClick={() => run(() => publishNotice({ noticeId: n.id }))}
          >
            Publicar — a palavra dada congela
          </button>
        ) : null}

        {canManage && n.status === 'published' ? (
          <button type="button" className={botaoNeutro} onClick={onCorrect}>
            Corrigir publicando novo…
          </button>
        ) : null}

        {canManage && canArchive(n.status) ? (
          <button
            type="button"
            disabled={pending}
            className={botaoNeutro}
            onClick={() => run(() => archiveNotice({ noticeId: n.id }))}
          >
            Arquivar — sai do mural, não da história
          </button>
        ) : null}
      </div>

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
