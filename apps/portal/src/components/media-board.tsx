'use client';

import { useState, useTransition } from 'react';

import { canArchive, canRestore, orderShelf, orderTags, usageCount, usagesOf } from '@alsham/media';
import type { AssetTagLink, MediaTag, MediaUsage } from '@alsham/media';

import { createTag, recordUsage, setAssetStatus, tagAsset, untagAsset } from '@/app/media-actions';
import type { AssetRowMedia } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A prateleira — agora TABELA DE VERDADE (Mandato de Beleza). Ordenada pelo
 * PACOTE (`orderShelf`): acervo vivo primeiro, por título. Cada obra é uma LINHA
 * de resumo: título/tipo, onde vive, usos e situação. A descrição, as etiquetas,
 * o livro de usos, registrar uso e arquivar/devolver vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **CATÁLOGO, não cofre** — o ativo diz ONDE a obra vive; o Storage é futuro.
 * ⭐ **O acervo VOLTA do arquivo** (`canRestore`) — a MESMA obra, o DIVERGE
 * assinado do patrimônio (cuja baixa é terminal). Arquivar não apaga: o livro
 * fica.
 */

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

export function MediaShelf({
  assets,
  tags,
  links,
  usages,
  canManage,
  canRecord,
}: {
  assets: readonly AssetRowMedia[];
  tags: readonly MediaTag[];
  links: readonly AssetTagLink[];
  usages: readonly MediaUsage[];
  canManage: boolean;
  canRecord: boolean;
}) {
  if (assets.length === 0) {
    return (
      <EmptyState
        title="Acervo vazio"
        hint="Catalogue a primeira obra — o registro diz onde ela vive; o cofre é capacidade futura do Core."
      />
    );
  }

  const prateleira = orderShelf(assets) as readonly AssetRowMedia[];

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Obra</TH>
            <TH>Local</TH>
            <TH num>Usos</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {prateleira.map((a) => (
            <AssetRowItem
              key={a.id}
              asset={a}
              tags={tags}
              usages={usages.filter((u) => u.assetId === a.id)}
              myTagIds={links.filter((l) => l.assetId === a.id).map((l) => l.tagId)}
              canManage={canManage}
              canRecord={canRecord}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function AssetRowItem({
  asset: a,
  tags,
  usages,
  myTagIds,
  canManage,
  canRecord,
}: {
  asset: AssetRowMedia;
  tags: readonly MediaTag[];
  usages: readonly MediaUsage[];
  myTagIds: readonly string[];
  canManage: boolean;
  canRecord: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [usando, setUsando] = useState(false);
  const [emQue, setEmQue] = useState('');
  const [nota, setNota] = useState('');
  const [novaEtiqueta, setNovaEtiqueta] = useState('');
  const [pending, startTransition] = useTransition();

  // ⭐ A contagem é do PACOTE.
  const usos = usageCount(a, usages);
  const etiquetas = orderTags(tags);
  const viva = a.status === 'active';
  const painelId = `media-${a.id}`;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setUsando(false);
        setEmQue('');
        setNota('');
        setNovaEtiqueta('');
      }
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{a.title}</span>
          {a.assetType ? <span className="mt-0.5 block text-xs text-bos-muted">{a.assetType}</span> : null}
        </TD>
        <TD className="text-bos-muted">{a.location}</TD>
        <TD num className="whitespace-nowrap text-bos-text">{usos}</TD>
        <TD className="whitespace-nowrap">
          <Badge tone={viva ? 'info' : 'neutral'}>{viva ? 'no acervo' : 'no arquivo'}</Badge>
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
              {a.description ? <p className="max-w-2xl text-sm text-bos-text">{a.description}</p> : null}

              <div className="flex flex-wrap items-center gap-1.5">
                {myTagIds.map((tagId) => {
                  const t = etiquetas.find((x) => x.id === tagId);
                  if (!t) return null;
                  return (
                    <span key={tagId} className="inline-flex items-center gap-1 rounded-full border border-bos-border px-2 py-0.5 text-[11px] text-bos-muted">
                      {t.name}
                      {canManage ? (
                        <button type="button" aria-label={`desfazer ${t.name}`} className="hover:text-bos-danger" onClick={() => run(() => untagAsset({ assetId: a.id, tagId }))}>
                          ×
                        </button>
                      ) : null}
                    </span>
                  );
                })}
                {canManage ? (
                  <>
                    <select
                      className="rounded-md border border-bos-border bg-bos-bg px-1.5 py-0.5 text-[11px] text-bos-muted"
                      value=""
                      disabled={pending}
                      onChange={(e) => {
                        if (e.target.value) run(() => tagAsset({ assetId: a.id, tagId: e.target.value }));
                      }}
                    >
                      <option value="">+ etiqueta…</option>
                      {etiquetas.filter((t) => !myTagIds.includes(t.id)).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <input
                      className="w-28 rounded-md border border-bos-border bg-bos-bg px-1.5 py-0.5 text-[11px] text-bos-text"
                      placeholder="nova etiqueta"
                      value={novaEtiqueta}
                      onChange={(e) => setNovaEtiqueta(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && novaEtiqueta.trim()) run(() => createTag({ name: novaEtiqueta }));
                      }}
                    />
                  </>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canRecord && viva && !usando ? (
                  <button type="button" className={botao} onClick={() => setUsando(true)}>Registrar uso…</button>
                ) : null}
                {canManage && canArchive(a.status) ? (
                  <button type="button" disabled={pending} className={botaoNeutro} onClick={() => run(() => setAssetStatus({ assetId: a.id, status: 'archived' }))}>
                    Arquivar — o livro fica
                  </button>
                ) : null}
                {canManage && canRestore(a.status) ? (
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => setAssetStatus({ assetId: a.id, status: 'active' }))}>
                    Devolver ao acervo — a mesma obra
                  </button>
                ) : null}
              </div>

              {usando ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-bos-border pt-2">
                  <input className={campo} placeholder="em quê? (campanha, pauta, vitrine…)" value={emQue} onChange={(e) => setEmQue(e.target.value)} />
                  <input className={campo} placeholder="nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => recordUsage({ assetId: a.id, usedIn: emQue, note: nota }))}>
                    No livro — não se rasura
                  </button>
                  <button type="button" className={botaoNeutro} onClick={() => setUsando(false)}>Cancelar</button>
                </div>
              ) : null}

              {usages.length > 0 ? (
                <div className="border-t border-bos-border pt-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-bos-muted">O livro ({usages.length})</p>
                  {usagesOf(a, usages).map((u) => (
                    <p key={u.id} className="mt-1 text-xs text-bos-muted">
                      <span className="text-bos-text">{u.usedIn}</span> · {shortDate(u.usedAt)}
                      {u.note ? <> — {u.note}</> : null}
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
