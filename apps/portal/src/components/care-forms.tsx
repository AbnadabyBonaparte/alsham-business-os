'use client';

import { useState, useTransition } from 'react';

import type { CareCategory, CarePriority } from '@alsham/care';

import { createCategory, createPriority, createTicket } from '@/app/care-actions';
import { Badge, Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Abrir um caso. A validação é do pacote. */
export function TicketForm({
  categories,
  priorities,
}: {
  categories: readonly CareCategory[];
  priorities: readonly CarePriority[];
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [solicitante, setSolicitante] = useState('');
  const [contato, setContato] = useState('');
  const [categoria, setCategoria] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [prazo, setPrazo] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Abrir caso
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await createTicket({
        subject: assunto,
        description: descricao,
        requesterName: solicitante,
        requesterContact: contato,
        categoryId: categoria === '' ? null : categoria,
        priorityId: prioridade === '' ? null : prioridade,
        dueAt: prazo === '' ? '' : new Date(prazo).toISOString(),
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setAssunto(''); setDescricao(''); setSolicitante(''); setContato(''); setPrazo('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Novo caso</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Assunto*
          <input className={campo} value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Solicitante* (pode não ser contraparte do crm)
          <input className={campo} value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Contato (texto livre)
          <input className={campo} value={contato} onChange={(e) => setContato(e.target.value)} placeholder="telefone · e-mail · balcão…" />
        </label>
        <label className="text-xs text-bos-muted">
          Prazo (opcional)
          <input type="datetime-local" className={campo} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Categoria
          <select className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">— sem categoria —</option>
            {categories.filter((c) => c.status === 'active').map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-bos-muted">
          Prioridade
          <select className={campo} value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
            <option value="">— sem prioridade —</option>
            {priorities.filter((p) => p.status === 'active').map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-bos-muted sm:col-span-2">
          Descrição
          <textarea className={campo} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={pending} className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60" onClick={enviar}>
          Abrir
        </button>
        <button type="button" className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </div>
    </Panel>
  );
}

/** O vocabulário do tenant: categorias e prioridades. */
export function CareSetup({
  categories,
  priorities,
  canSetup,
}: {
  categories: readonly CareCategory[];
  priorities: readonly CarePriority[];
  canSetup: boolean;
}) {
  const [nomeCat, setNomeCat] = useState('');
  const [nomePri, setNomePri] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canSetup) return null;

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Vocabulário do tenant</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-bos-muted">Categorias:</span>
        {categories.map((c) => (
          <Badge key={c.id} tone={c.status === 'active' ? 'neutral' : 'warning'}>{c.name}</Badge>
        ))}
        <input
          className="w-40 rounded-md border border-bos-border bg-bos-bg px-2 py-1 text-xs text-bos-text"
          placeholder="nova categoria"
          value={nomeCat}
          onChange={(e) => setNomeCat(e.target.value)}
        />
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-bos-border px-2 py-1 text-xs text-bos-text"
          onClick={() =>
            startTransition(async () => {
              const r = await createCategory({ name: nomeCat });
              if (!r.ok) setErro(r.message);
              else setNomeCat('');
            })
          }
        >
          Criar
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-bos-muted">Prioridades (na ordem):</span>
        {[...priorities].sort((a, b) => a.position - b.position).map((p) => (
          <Badge key={p.id} tone={p.status === 'active' ? 'danger' : 'warning'}>{p.name}</Badge>
        ))}
        <input
          className="w-40 rounded-md border border-bos-border bg-bos-bg px-2 py-1 text-xs text-bos-text"
          placeholder="nova prioridade"
          value={nomePri}
          onChange={(e) => setNomePri(e.target.value)}
        />
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-bos-border px-2 py-1 text-xs text-bos-text"
          onClick={() =>
            startTransition(async () => {
              const r = await createPriority({ name: nomePri, position: priorities.length });
              if (!r.ok) setErro(r.message);
              else setNomePri('');
            })
          }
        >
          Criar
        </button>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
