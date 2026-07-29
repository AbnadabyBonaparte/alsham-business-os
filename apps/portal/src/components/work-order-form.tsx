'use client';

import { useState, useTransition } from 'react';

import { orderedStages, validateNewOrder } from '@alsham/ops';

import { openOrder } from '@/app/ops-actions';
import type { PipelineWithStages } from '@/lib/data';
import { Panel } from '@/components/states';

/**
 * Abrir uma ordem de serviço.
 *
 * ⭐ A OS nasce numa esteira DO TENANT, na primeira etapa dela — e a tela
 * mostra qual é, pelo nome, antes de o operador confirmar. Um formulário que
 * não diz onde a OS vai cair obriga a abrir e depois conferir.
 *
 * ⚠️ Zero regra própria: `validateNewOrder()` é a MESMA função que a Server
 * Action chama.
 */
export function WorkOrderForm({
  pipelines,
  canManage,
}: {
  pipelines: readonly PipelineWithStages[];
  canManage: boolean;
}) {
  const utilizaveis = pipelines.filter((p) => p.stages.length > 0);

  const [pipelineId, setPipelineId] = useState(utilizaveis[0]?.pipeline.id ?? '');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prazo, setPrazo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cortesia de interface. Quem IMPEDE de verdade é a policy `orders_insert`.
  if (!canManage) {
    return (
      <Panel className="px-6 py-5">
        <p className="text-sm text-bos-muted">
          Abrir ordem de serviço exige a permissão{' '}
          <code className="font-mono text-bos-text">ops.order.manage</code>.
        </p>
      </Panel>
    );
  }

  if (utilizaveis.length === 0) {
    return (
      <Panel className="px-6 py-5">
        <p className="text-sm text-bos-muted">
          Nenhuma esteira com etapas ainda. Desenhe uma em{' '}
          <strong className="text-bos-text">Esteiras</strong> antes de abrir a primeira OS — a OS
          não existe fora de uma esteira.
        </p>
      </Panel>
    );
  }

  const escolhida = utilizaveis.find((p) => p.pipeline.id === pipelineId);
  const primeira = escolhida ? orderedStages(escolhida.stages)[0] : undefined;

  const problema = validateNewOrder({
    pipelineId,
    title: titulo,
    dueDate: prazo === '' ? null : prazo,
  });

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Abrir ordem de serviço</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-bos-muted">Esteira</span>
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          >
            {utilizaveis.map((p) => (
              <option key={p.pipeline.id} value={p.pipeline.id}>
                {p.pipeline.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-bos-muted">Prazo (opcional)</span>
          <input
            type="date"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs text-bos-muted">Título</span>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="o que precisa ser feito"
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted/60"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs text-bos-muted">
            Descrição do trabalho (opcional) — texto livre
          </span>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          />
        </label>
      </div>

      {primeira ? (
        <p className="mt-3 text-xs text-bos-muted">
          A OS vai nascer na etapa{' '}
          <strong className="text-bos-text">{primeira.name}</strong>, a primeira desta esteira.
        </p>
      ) : null}

      {erro ? (
        <p role="alert" className="mt-3 text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}
      {ok ? <p className="mt-3 text-xs text-bos-success">{ok}</p> : null}

      <div className="mt-4 border-t border-bos-border pt-4">
        <button
          type="button"
          disabled={pending || problema !== null}
          onClick={() => {
            setErro(null);
            setOk(null);
            startTransition(async () => {
              const r = await openOrder({
                pipelineId,
                title: titulo,
                description: descricao,
                dueDate: prazo === '' ? null : prazo,
              });
              if (!r.ok) {
                setErro(r.message);
                return;
              }
              setOk('OS aberta. A primeira linha da trilha já está registrada.');
              setTitulo('');
              setDescricao('');
              setPrazo('');
            });
          }}
          className="rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text transition-colors hover:bg-bos-accent/25 disabled:opacity-40"
        >
          {pending ? 'Abrindo…' : 'Abrir OS'}
        </button>
      </div>
    </Panel>
  );
}
