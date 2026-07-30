'use client';

import { useState, useTransition } from 'react';

import { canEditPiece, canMove, orderCalendar, orderStages } from '@alsham/editorial';
import type { Channel, EditorialStage } from '@alsham/editorial';

import { closePiece, movePiece, updatePlan } from '@/app/edcal-actions';
import type { PieceRow } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  planned: 'no plano',
  published: 'no ar',
  dropped: 'descartada',
};

/** O calendário — ordenado pelo PACOTE: a planejada mais próxima primeiro. */
export function EdcalBoard({
  pieces,
  channels,
  stages,
  canManage,
  canDecide,
}: {
  pieces: readonly PieceRow[];
  channels: readonly Channel[];
  stages: readonly EditorialStage[];
  canManage: boolean;
  canDecide: boolean;
}) {
  if (pieces.length === 0) {
    return (
      <EmptyState
        title="Calendário vazio"
        hint="Planeje a primeira pauta — ela nasce no fluxo do SEU desenho, com a data como plano."
      />
    );
  }

  const calendario = orderCalendar(pieces) as readonly PieceRow[];

  return (
    <div className="flex flex-col gap-3">
      {calendario.map((p) => (
        <PieceCard
          key={p.id}
          piece={p}
          channels={channels}
          stages={stages}
          canManage={canManage}
          canDecide={canDecide}
        />
      ))}
    </div>
  );
}

function PieceCard({
  piece: p,
  channels,
  stages,
  canManage,
  canDecide,
}: {
  piece: PieceRow;
  channels: readonly Channel[];
  stages: readonly EditorialStage[];
  canManage: boolean;
  canDecide: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [titulo, setTitulo] = useState(p.title);
  const [brief, setBrief] = useState(p.brief);
  const [data, setData] = useState(p.plannedOn);
  const [razao, setRazao] = useState('');
  const [pending, startTransition] = useTransition();

  const canal = channels.find((c) => c.id === p.channelId);
  const etapa = stages.find((s) => s.id === p.currentStageId);
  const fluxo = orderStages(stages);
  const viva = p.status === 'planned';

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setEditando(false);
        setFechando(false);
        setRazao('');
      }
    });
  }

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-bos-text">
            {p.title}{' '}
            <span className="text-xs text-bos-muted">
              · {canal?.name ?? 'canal fora do ar'}
              {etapa ? <> · etapa: {etapa.name}</> : null}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            planejada para {shortDate(p.plannedOn)}
            {p.publishedAt ? (
              <>
                {' '}· <span className="text-bos-text">no ar em {shortDate(p.publishedAt)}</span> — a data real, do servidor
              </>
            ) : null}
            {p.status === 'dropped' ? <> · razão: {p.dropReason}</> : null}
          </p>
          {p.brief.trim().length > 0 && !editando ? (
            <p className="mt-2 whitespace-pre-wrap text-xs text-bos-text">{p.brief}</p>
          ) : null}
        </div>
        <Badge tone={p.status === 'planned' ? 'info' : p.status === 'published' ? 'success' : 'neutral'}>
          {ROTULOS[p.status]}
        </Badge>
      </div>

      {editando ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <textarea
            className={`${campo} sm:col-span-2`}
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canManage && viva && canMove(p.status) && !editando && !fechando ? (
          <select
            className={campo}
            value=""
            disabled={pending}
            onChange={(e) => {
              if (e.target.value) run(() => movePiece({ pieceId: p.id, toStageId: e.target.value, note: '' }));
            }}
          >
            <option value="">mover no fluxo…</option>
            {fluxo
              .filter((s) => s.id !== p.currentStageId)
              .map((s) => (
                <option key={s.id} value={s.id}>→ {s.name}</option>
              ))}
          </select>
        ) : null}

        {canManage && canEditPiece(p.status) && !editando && !fechando ? (
          <button type="button" className={botaoNeutro} onClick={() => setEditando(true)}>
            Editar o plano (reagendar é livre)
          </button>
        ) : null}
        {editando ? (
          <>
            <button
              type="button"
              disabled={pending}
              className={botao}
              onClick={() => run(() => updatePlan({ pieceId: p.id, title: titulo, brief, plannedOn: data }))}
            >
              Guardar o plano
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setEditando(false)}>
              Descartar edição
            </button>
          </>
        ) : null}

        {canDecide && viva && !fechando && !editando ? (
          <button type="button" className={botaoNeutro} onClick={() => setFechando(true)}>
            Registrar o fim…
          </button>
        ) : null}

        {fechando ? (
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              className={botao}
              onClick={() => run(() => closePiece({ pieceId: p.id, outcome: 'published', reason: '' }))}
            >
              Foi ao ar — a data real é do servidor
            </button>
            <input
              className={campo}
              placeholder="a razão do descarte"
              value={razao}
              onChange={(e) => setRazao(e.target.value)}
            />
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg"
              onClick={() => run(() => closePiece({ pieceId: p.id, outcome: 'dropped', reason: razao }))}
            >
              Morreu
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setFechando(false)}>
              O plano continua
            </button>
          </span>
        ) : null}
      </div>

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
