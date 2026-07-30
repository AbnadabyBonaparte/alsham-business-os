'use client';

import { useState, useTransition } from 'react';

import { orderStages } from '@alsham/editorial';
import type { Channel, EditorialStage } from '@alsham/editorial';

import { createChannel, createPiece, createStage, removeStage, setChannelStatus } from '@/app/edcal-actions';
import { Badge, Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';
const campoCurto =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

/** Planejar uma pauta — nasce planejada; a validação é do pacote. */
export function EdcalPieceForm({
  channels,
  stages,
}: {
  channels: readonly Channel[];
  stages: readonly EditorialStage[];
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [titulo, setTitulo] = useState('');
  const [brief, setBrief] = useState('');
  const [canal, setCanal] = useState('');
  const [etapa, setEtapa] = useState('');
  const [data, setData] = useState('');

  const vivos = channels.filter((c) => c.status === 'active');
  const fluxo = orderStages(stages);

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Planejar pauta
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await createPiece({
        title: titulo,
        brief,
        channelId: canal,
        stageId: etapa,
        plannedOn: data,
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setTitulo(''); setBrief(''); setCanal(''); setEtapa(''); setData('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Nova pauta no calendário</h2>
      <p className="mt-1 text-xs text-bos-muted">
        A data é PLANO — muda livre até o fim. A real, quem carimba é o servidor, no dia em que for ao ar.
      </p>
      {vivos.length === 0 || fluxo.length === 0 ? (
        <p className="mt-3 text-sm text-bos-muted">
          Antes da primeira pauta, desenhe o calendário: {vivos.length === 0 ? 'crie um canal' : ''}
          {vivos.length === 0 && fluxo.length === 0 ? ' e ' : ''}
          {fluxo.length === 0 ? 'crie as etapas do fluxo' : ''} — logo abaixo.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-bos-muted">
            Título*
            <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </label>
          <label className="text-xs text-bos-muted">
            Data planejada*
            <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="text-xs text-bos-muted">
            Canal*
            <select className={campo} value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">—</option>
              {vivos.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-bos-muted">
            Etapa de nascimento*
            <select className={campo} value={etapa} onChange={(e) => setEtapa(e.target.value)}>
              <option value="">—</option>
              {fluxo.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-bos-muted sm:col-span-2">
            Texto de trabalho
            <textarea className={campo} rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </label>
        </div>
      )}
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
      <div className="mt-4 flex gap-2">
        {vivos.length > 0 && fluxo.length > 0 ? (
          <button
            type="button"
            disabled={pending}
            className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
            onClick={enviar}
          >
            Planejar — nasce no fluxo
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </button>
      </div>
    </Panel>
  );
}

/** O desenho do calendário: canais (voltam do arquivo) e etapas (do tenant). */
export function EdcalDesign({
  channels,
  stages,
}: {
  channels: readonly Channel[];
  stages: readonly EditorialStage[];
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novoCanal, setNovoCanal] = useState('');
  const [novaEtapa, setNovaEtapa] = useState('');
  const [pending, startTransition] = useTransition();

  const fluxo = orderStages(stages);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setNovoCanal('');
        setNovaEtapa('');
      }
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        className="self-start rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:border-bos-accent"
        onClick={() => setAberto(true)}
      >
        Desenhar o calendário (canais e fluxo)
      </button>
    );
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg text-bos-text">O desenho é do tenant</h2>
        <button type="button" className="text-xs text-bos-muted hover:text-bos-text" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </div>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-bos-text">Canais</h3>
          <p className="mt-0.5 text-xs text-bos-muted">Arquivado não recebe pauta nova — e volta do arquivo.</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {channels.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm text-bos-text">
                <span>
                  {c.name}{' '}
                  {c.status === 'archived' ? <Badge tone="neutral">no arquivo</Badge> : null}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  className="text-xs text-bos-muted hover:text-bos-text"
                  onClick={() =>
                    run(() =>
                      setChannelStatus({
                        channelId: c.id,
                        status: c.status === 'active' ? 'archived' : 'active',
                      }),
                    )
                  }
                >
                  {c.status === 'active' ? 'Arquivar' : 'Devolver ao ativo'}
                </button>
              </li>
            ))}
            {channels.length === 0 ? <li className="text-xs text-bos-muted">Nenhum canal ainda.</li> : null}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              className={campoCurto}
              placeholder="novo canal (texto livre)"
              value={novoCanal}
              onChange={(e) => setNovoCanal(e.target.value)}
            />
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent"
              onClick={() => run(() => createChannel({ name: novoCanal }))}
            >
              Criar
            </button>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-bos-text">Fluxo editorial</h3>
          <p className="mt-0.5 text-xs text-bos-muted">
            Etapas do SEU jeito — a trilha carimba o nome e sobrevive ao redesenho.
          </p>
          <ol className="mt-2 flex flex-col gap-1.5">
            {fluxo.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm text-bos-text">
                <span>{s.position + 1}. {s.name}</span>
                <button
                  type="button"
                  disabled={pending}
                  className="text-xs text-bos-muted hover:text-bos-danger"
                  onClick={() => run(() => removeStage({ stageId: s.id }))}
                >
                  Apagar
                </button>
              </li>
            ))}
            {fluxo.length === 0 ? <li className="text-xs text-bos-muted">Nenhuma etapa ainda.</li> : null}
          </ol>
          <div className="mt-3 flex gap-2">
            <input
              className={campoCurto}
              placeholder="nova etapa (ao fim do fluxo)"
              value={novaEtapa}
              onChange={(e) => setNovaEtapa(e.target.value)}
            />
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent"
              onClick={() => run(() => createStage({ name: novaEtapa }))}
            >
              Criar
            </button>
          </div>
        </div>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
