'use client';

import { useRef, useState, useTransition } from 'react';

import type { FunnelWithStages } from '@/lib/data';
import { createFunnel, openOpportunity } from '@/app/deal-actions';
import { Panel } from '@/components/states';

/** Desenhar um funil: nome + estágios em linhas, um nome por linha. */
export function FunnelForm({ canDesign }: { canDesign: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canDesign) return null;

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md border border-bos-border px-4 py-2 text-sm text-bos-text hover:bg-bos-surface"
        onClick={() => setAberto(true)}
      >
        Desenhar funil
      </button>
    );
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Desenhar funil</h2>
      <p className="mt-1 text-sm text-bos-muted">
        Os estágios são seus: nome livre, ordem livre, um por linha.
      </p>
      <form
        ref={formRef}
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          setErro(null);
          startTransition(async () => {
            const r = await createFunnel({
              name: String(dados.get('name') ?? ''),
              description: String(dados.get('description') ?? ''),
              stageNames: String(dados.get('stages') ?? '')
                .split('\n')
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            });
            if (!r.ok) setErro(r.message);
            else {
              formRef.current?.reset();
              setAberto(false);
            }
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Nome do funil
            <input
              name="name"
              required
              placeholder="Vendas diretas, Licitações…"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Descrição (opcional)
            <input
              name="description"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm text-bos-muted">
          Estágios — um por linha, na ordem
          <textarea
            name="stages"
            rows={4}
            required
            placeholder={'contato\nconversa\nproposta na mesa\naperto de mão'}
            className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 font-mono text-sm text-bos-text"
          />
        </label>
        {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-bos-accent px-4 py-2 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
          >
            {pending ? 'Criando…' : 'Criar funil'}
          </button>
          <button
            type="button"
            className="rounded-md px-4 py-2 text-sm text-bos-muted"
            onClick={() => setAberto(false)}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

/** Abrir uma negociação — nasce no primeiro estágio do funil escolhido. */
export function OpportunityForm({
  funnels,
  canManage,
}: {
  funnels: readonly FunnelWithStages[];
  canManage: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const comEstagios = funnels.filter(
    (f) => f.funnel.status === 'active' && f.stages.length > 0,
  );

  if (!canManage || comEstagios.length === 0) return null;

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text hover:bg-bos-accent/25"
        onClick={() => setAberto(true)}
      >
        Abrir negociação
      </button>
    );
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Abrir negociação</h2>
      <p className="mt-1 text-sm text-bos-muted">
        A contraparte é opcional — negociar não exige cadastrar. Valor e moeda andam juntos.
      </p>
      <form
        ref={formRef}
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          const valor = String(dados.get('value') ?? '').trim();
          const moeda = String(dados.get('currency') ?? '').trim().toUpperCase();
          const prob = String(dados.get('probability') ?? '').trim();
          const fecha = String(dados.get('expectedCloseDate') ?? '').trim();
          const contraparte = String(dados.get('partyName') ?? '').trim();
          const tags = String(dados.get('tags') ?? '')
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
          setErro(null);
          startTransition(async () => {
            const r = await openOpportunity({
              funnelId: String(dados.get('funnelId') ?? ''),
              title: String(dados.get('title') ?? ''),
              description: String(dados.get('description') ?? ''),
              valueCents: valor.length > 0 ? Math.round(Number(valor) * 100) : null,
              currency: valor.length > 0 ? moeda : null,
              probability: prob.length > 0 ? Number(prob) : null,
              expectedCloseDate: fecha.length > 0 ? fecha : null,
              partyName: contraparte.length > 0 ? contraparte : null,
              tags,
            });
            if (!r.ok) setErro(r.message);
            else {
              formRef.current?.reset();
              setAberto(false);
            }
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Funil
            <select
              name="funnelId"
              required
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            >
              {comEstagios.map((f) => (
                <option key={f.funnel.id} value={f.funnel.id}>
                  {f.funnel.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Título
            <input
              name="title"
              required
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Contraparte (opcional)
            <input
              name="partyName"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Etiquetas (separadas por vírgula)
            <input
              name="tags"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Valor (R$, opcional)
            <input
              name="value"
              type="number"
              step="0.01"
              min="0"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text tabular"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Moeda
            <input
              name="currency"
              placeholder="BRL"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Probabilidade (0–100)
            <input
              name="probability"
              type="number"
              min="0"
              max="100"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text tabular"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Fecha em (AAAA-MM-DD)
            <input
              name="expectedCloseDate"
              placeholder="opcional"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm text-bos-muted">
          Descrição (opcional — anote aqui o que a sua metodologia pedir)
          <input
            name="description"
            className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
          />
        </label>
        {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-bos-accent px-4 py-2 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
          >
            {pending ? 'Abrindo…' : 'Abrir'}
          </button>
          <button
            type="button"
            className="rounded-md px-4 py-2 text-sm text-bos-muted"
            onClick={() => setAberto(false)}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
