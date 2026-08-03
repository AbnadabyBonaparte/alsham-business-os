'use client';

import { useState, useTransition } from 'react';

import { ackCount, canArchive, canEditNotice, canPublish, hasAcked, orderBoard } from '@alsham/comms';
import type { NoticeAck } from '@alsham/comms';

import { ackNotice, archiveNotice, publishNotice, updateDraftNotice } from '@/app/comm-actions';
import { CommForm } from '@/components/comm-forms';
import type { NoticeRow } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * O mural — agora TABELA DE VERDADE (Mandato de Beleza). Ordenado pelo PACOTE
 * (`orderBoard`): publicados primeiro, depois rascunhos, depois o arquivo. Cada
 * comunicado é uma LINHA de resumo: título/audiência, ciências, situação e
 * publicação. O corpo, dar ciência, editar o rascunho, publicar, corrigir e
 * arquivar vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **A ciência é ato PRÓPRIO, ÚNICO e ETERNO** (o gatilho força o próprio
 * punho). ⭐ **Publicar CONGELA a palavra dada** — corrigir é comunicado NOVO.
 * ⭐ **`archived` é TERMINAL** — sai do mural, não da história.
 */

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  draft: 'rascunho',
  published: 'no mural',
  archived: 'arquivado',
};

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
      <Panel className="px-2 py-1.5">
        <Table>
          <THead>
            <TR>
              <TH>Comunicado</TH>
              <TH num>Ciências</TH>
              <TH>Situação</TH>
              <TH>Publicado</TH>
              <TH className="w-8" />
            </TR>
          </THead>
          <TBody>
            {mural.map((n) => (
              <NoticeRowItem
                key={n.id}
                notice={n}
                acks={acks}
                userId={userId}
                canManage={canManage}
                canAckPerm={canAckPerm}
                onCorrect={() => setCorrigindo({ id: n.id, title: n.title })}
              />
            ))}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}

function NoticeRowItem({
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
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(n.title);
  const [audiencia, setAudiencia] = useState(n.audience);
  const [corpo, setCorpo] = useState(n.body);
  const [pending, startTransition] = useTransition();

  // ⭐ Ciência e cobertura são do PACOTE.
  const jaLi = hasAcked(n, userId, acks);
  const cobertura = ackCount(n, acks);
  const painelId = `comm-${n.id}`;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else setEditando(false);
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{n.title}</span>
          <span className="mt-0.5 block text-xs text-bos-muted">
            para {n.audience}
            {n.correctsNoticeId ? <> · corrige “{n.correctsTitle}”</> : null}
          </span>
        </TD>
        <TD num className="whitespace-nowrap">
          {n.status !== 'draft' ? (
            <span className="text-bos-text">
              {cobertura}
              {jaLi ? <span className="text-bos-muted"> ✓</span> : null}
            </span>
          ) : (
            <span className="text-bos-muted">—</span>
          )}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={n.status === 'published' ? 'info' : n.status === 'draft' ? 'warning' : 'neutral'}>
            {ROTULOS[n.status]}
          </Badge>
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">
          {n.publishedAt ? shortDate(n.publishedAt) : <span className="italic">—</span>}
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
              {n.body.trim().length > 0 && !editando ? (
                <p className="max-w-2xl whitespace-pre-wrap text-sm text-bos-text">{n.body}</p>
              ) : null}
              {n.status !== 'draft' ? (
                <p className="text-xs text-bos-muted">{cobertura} ciência(s){jaLi ? ' — a sua entre elas' : ''}</p>
              ) : null}

              {editando ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                  <input className={campo} value={audiencia} onChange={(e) => setAudiencia(e.target.value)} />
                  <textarea className={`${campo} sm:col-span-2`} rows={3} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {canAckPerm && n.status === 'published' && !jaLi ? (
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => ackNotice({ noticeId: n.id }))}>
                    Ciente — uma vez, do próprio punho
                  </button>
                ) : null}

                {canManage && canEditNotice(n.status) && !editando ? (
                  <button type="button" className={botaoNeutro} onClick={() => setEditando(true)}>Editar rascunho</button>
                ) : null}
                {editando ? (
                  <>
                    <button type="button" disabled={pending} className={botao} onClick={() => run(() => updateDraftNotice({ noticeId: n.id, title: titulo, body: corpo, audience: audiencia }))}>
                      Guardar rascunho
                    </button>
                    <button type="button" className={botaoNeutro} onClick={() => setEditando(false)}>Descartar edição</button>
                  </>
                ) : null}

                {canManage && canPublish(n.status) && !editando ? (
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => publishNotice({ noticeId: n.id }))}>
                    Publicar — a palavra dada congela
                  </button>
                ) : null}

                {canManage && n.status === 'published' ? (
                  <button type="button" className={botaoNeutro} onClick={onCorrect}>Corrigir publicando novo…</button>
                ) : null}

                {canManage && canArchive(n.status) ? (
                  <button type="button" disabled={pending} className={botaoNeutro} onClick={() => run(() => archiveNotice({ noticeId: n.id }))}>
                    Arquivar — sai do mural, não da história
                  </button>
                ) : null}
              </div>

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
