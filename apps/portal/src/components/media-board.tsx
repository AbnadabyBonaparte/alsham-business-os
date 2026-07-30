'use client';

import { useState, useTransition } from 'react';

import { canArchive, canRestore, orderShelf, orderTags, usageCount, usagesOf } from '@alsham/media';
import type { AssetTagLink, MediaTag, MediaUsage } from '@alsham/media';

import { createTag, recordUsage, setAssetStatus, tagAsset, untagAsset } from '@/app/media-actions';
import type { AssetRowMedia } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

/** A prateleira — ordenada pelo PACOTE: acervo vivo primeiro, por título. */
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
    <div className="flex flex-col gap-3">
      {prateleira.map((a) => (
        <AssetCard
          key={a.id}
          asset={a}
          tags={tags}
          links={links}
          usages={usages}
          canManage={canManage}
          canRecord={canRecord}
        />
      ))}
    </div>
  );
}

function AssetCard({
  asset: a,
  tags,
  links,
  usages,
  canManage,
  canRecord,
}: {
  asset: AssetRowMedia;
  tags: readonly MediaTag[];
  links: readonly AssetTagLink[];
  usages: readonly MediaUsage[];
  canManage: boolean;
  canRecord: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [usando, setUsando] = useState(false);
  const [livroAberto, setLivroAberto] = useState(false);
  const [emQue, setEmQue] = useState('');
  const [nota, setNota] = useState('');
  const [novaEtiqueta, setNovaEtiqueta] = useState('');
  const [pending, startTransition] = useTransition();

  // ⭐ O livro e a contagem são do PACOTE.
  const doLivro = usagesOf(a, usages);
  const usos = usageCount(a, usages);
  const minhas = links.filter((l) => l.assetId === a.id).map((l) => l.tagId);
  const etiquetas = orderTags(tags);
  const viva = a.status === 'active';

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
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-bos-text">
            {a.title}
            {a.assetType ? <span className="text-xs text-bos-muted"> · {a.assetType}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            vive em <span className="text-bos-text">{a.location}</span>
            {' '}· {usos} uso(s) no livro
          </p>
          {a.description ? <p className="mt-1 text-xs text-bos-muted">{a.description}</p> : null}
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {minhas.map((tagId) => {
              const t = etiquetas.find((x) => x.id === tagId);
              if (!t) return null;
              return (
                <span key={tagId} className="inline-flex items-center gap-1 rounded-full border border-bos-border px-2 py-0.5 text-[11px] text-bos-muted">
                  {t.name}
                  {canManage ? (
                    <button
                      type="button"
                      aria-label={`desfazer ${t.name}`}
                      className="hover:text-bos-danger"
                      onClick={() => run(() => untagAsset({ assetId: a.id, tagId }))}
                    >
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
                  {etiquetas
                    .filter((t) => !minhas.includes(t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
                <input
                  className="w-28 rounded-md border border-bos-border bg-bos-bg px-1.5 py-0.5 text-[11px] text-bos-text"
                  placeholder="nova etiqueta"
                  value={novaEtiqueta}
                  onChange={(e) => setNovaEtiqueta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && novaEtiqueta.trim()) {
                      run(() => createTag({ name: novaEtiqueta }));
                    }
                  }}
                />
              </>
            ) : null}
          </p>
        </div>
        <Badge tone={viva ? 'info' : 'neutral'}>{viva ? 'no acervo' : 'no arquivo'}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canRecord && viva && !usando ? (
          <button type="button" className={botao} onClick={() => setUsando(true)}>
            Registrar uso…
          </button>
        ) : null}
        {usando ? (
          <span className="flex flex-wrap items-center gap-2">
            <input
              className={campo}
              placeholder="em quê? (campanha, pauta, vitrine…)"
              value={emQue}
              onChange={(e) => setEmQue(e.target.value)}
            />
            <input className={campo} placeholder="nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
            <button
              type="button"
              disabled={pending}
              className={botao}
              onClick={() => run(() => recordUsage({ assetId: a.id, usedIn: emQue, note: nota }))}
            >
              No livro — não se rasura
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setUsando(false)}>
              Cancelar
            </button>
          </span>
        ) : null}

        {doLivro.length > 0 ? (
          <button type="button" className={botaoNeutro} onClick={() => setLivroAberto(!livroAberto)}>
            {livroAberto ? 'Fechar o livro' : `Abrir o livro (${doLivro.length})`}
          </button>
        ) : null}

        {canManage && canArchive(a.status) ? (
          <button
            type="button"
            disabled={pending}
            className={botaoNeutro}
            onClick={() => run(() => setAssetStatus({ assetId: a.id, status: 'archived' }))}
          >
            Arquivar — o livro fica
          </button>
        ) : null}
        {canManage && canRestore(a.status) ? (
          <button
            type="button"
            disabled={pending}
            className={botao}
            onClick={() => run(() => setAssetStatus({ assetId: a.id, status: 'active' }))}
          >
            Devolver ao acervo — a mesma obra
          </button>
        ) : null}
      </div>

      {livroAberto ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-bos-border pt-2">
          {doLivro.map((u) => (
            <li key={u.id} className="text-xs text-bos-muted">
              <span className="text-bos-text">{u.usedIn}</span> · {shortDate(u.usedAt)}
              {u.note ? <> — {u.note}</> : null}
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
