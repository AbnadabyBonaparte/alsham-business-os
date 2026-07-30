'use client';

import { useState, useTransition } from 'react';

import { canEditAsset, canWriteOff, currentLocation } from '@alsham/assets';
import type { AssetTransfer, PatCategory } from '@alsham/assets';

import { transferAsset, writeOffAsset } from '@/app/pat-actions';
import type { AssetRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

/** O livro de bens — ordenado pelo PACOTE; a vigente calculada, nunca lida de coluna. */
export function PatBook({
  assets,
  transfers,
  categories,
  canManage,
  canDecide,
}: {
  assets: readonly AssetRow[];
  transfers: readonly AssetTransfer[];
  categories: readonly PatCategory[];
  canManage: boolean;
  canDecide: boolean;
}) {
  if (assets.length === 0) {
    return (
      <EmptyState
        title="Nenhum bem no livro"
        hint="Cadastre o primeiro — nome, etiqueta e onde ele está. O resto é história que o livro escreve."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {assets.map((a) => (
        <PatCard
          key={a.id}
          asset={a}
          transfers={transfers}
          categories={categories}
          canManage={canManage}
          canDecide={canDecide}
        />
      ))}
    </div>
  );
}

function PatCard({
  asset: a,
  transfers,
  categories,
  canManage,
  canDecide,
}: {
  asset: AssetRow;
  transfers: readonly AssetTransfer[];
  categories: readonly PatCategory[];
  canManage: boolean;
  canDecide: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [destino, setDestino] = useState('');
  const [nota, setNota] = useState('');
  const [razao, setRazao] = useState('');
  const [baixando, setBaixando] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [pending, startTransition] = useTransition();

  // ⭐ A localização vigente é do PACOTE — a tela não decide lugar.
  const vigente = currentLocation(a, transfers);
  const categoria = categories.find((c) => c.id === a.categoryId)?.name ?? null;
  const atosDoBem = transfers.filter((t) => t.assetId === a.id);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setMovendo(false);
        setBaixando(false);
        setDestino('');
        setNota('');
        setRazao('');
      }
    });
  }

  const baixado = a.status === 'written_off';

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-bos-text">
            {a.name} <span className="text-xs text-bos-muted">· {a.code}</span>
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            em <span className="text-bos-text">{vigente}</span>
            {categoria ? <> · {categoria}</> : null}
            {a.acquisitionCostCents !== null && a.currency !== null ? (
              <> · {money(a.acquisitionCostCents, a.currency)}</>
            ) : null}
            {a.acquiredOn ? <> · adquirido em {shortDate(a.acquiredOn)}</> : null}
          </p>
          {baixado ? (
            <p className="mt-1 text-xs text-bos-muted">
              baixado em {a.writtenOffAt ? shortDate(a.writtenOffAt) : '—'} — {a.writeOffReason}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={baixado ? 'neutral' : 'success'}>{baixado ? 'baixado' : 'ativo'}</Badge>
          {atosDoBem.length > 0 ? (
            <button
              type="button"
              className="text-xs text-bos-muted underline hover:text-bos-text"
              onClick={() => setHistorico((h) => !h)}
            >
              {historico ? 'esconder o livro' : `livro do lugar (${atosDoBem.length})`}
            </button>
          ) : null}
        </div>
      </div>

      {historico ? (
        <div className="mt-3 border-l border-bos-border pl-3">
          {atosDoBem.map((t) => (
            <p key={t.id} className="text-xs text-bos-muted">
              {shortDate(t.movedAt)} — de <span className="text-bos-text">{t.fromLocation}</span> para{' '}
              <span className="text-bos-text">{t.toLocation}</span>
              {t.note ? <> · {t.note}</> : null}
            </p>
          ))}
          <p className="mt-1 text-[11px] text-bos-muted">
            O &ldquo;de onde&rdquo; é carimbado pelo servidor — o livro não aceita rasura.
          </p>
        </div>
      ) : null}

      {!baixado && canEditAsset(a.status) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canManage && !movendo && !baixando ? (
            <button type="button" className={botao} onClick={() => setMovendo(true)}>
              Transferir
            </button>
          ) : null}
          {canDecide && canWriteOff(a.status) && !baixando && !movendo ? (
            <button type="button" className={botao} onClick={() => setBaixando(true)}>
              Baixar…
            </button>
          ) : null}

          {movendo ? (
            <span className="flex flex-wrap items-center gap-2">
              <input
                className={campo}
                placeholder="para onde?"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              />
              <input
                className={campo}
                placeholder="nota (opcional)"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
              <button
                type="button"
                className={botao}
                disabled={pending}
                onClick={() => run(() => transferAsset({ assetId: a.id, toLocation: destino, note: nota }))}
              >
                Registrar o ato
              </button>
              <button type="button" className={botaoNeutro} onClick={() => setMovendo(false)}>
                Deixar onde está
              </button>
            </span>
          ) : null}

          {baixando ? (
            <span className="flex flex-wrap items-center gap-2">
              <input
                className={campo}
                placeholder="a razão — alienação, perda, sucata…"
                value={razao}
                onChange={(e) => setRazao(e.target.value)}
              />
              <button
                type="button"
                className={botaoPerigo}
                disabled={pending}
                onClick={() => run(() => writeOffAsset({ assetId: a.id, reason: razao }))}
              >
                Baixar de vez — é terminal
              </button>
              <button type="button" className={botaoNeutro} onClick={() => setBaixando(false)}>
                Manter no livro
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
const botaoPerigo =
  'rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg';
