'use client';

import { useRef, useState, useTransition } from 'react';

import { createEvent } from '@/app/evt-actions';
import { Panel } from '@/components/states';

/** Criar um evento. Quem valida é o pacote, na action — a tela só pergunta. */
export function EventForm({ canManage }: { canManage: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text hover:bg-bos-accent/25"
      >
        Novo evento
      </button>
    );
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Criar evento</h2>
      <p className="mt-1 text-sm text-bos-muted">
        Onde é texto livre — &quot;salão 2&quot;, &quot;Zoom&quot;. Capacidade é opcional: com teto, a lotação
        recusa; sem teto, não há conta.
      </p>
      <form
        ref={formRef}
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          const fim = String(dados.get('endsAt') ?? '').trim();
          const local = String(dados.get('location') ?? '').trim();
          const teto = String(dados.get('capacity') ?? '').trim();
          setErro(null);
          startTransition(async () => {
            const r = await createEvent({
              name: String(dados.get('name') ?? ''),
              description: String(dados.get('description') ?? ''),
              startsAt: String(dados.get('startsAt') ?? ''),
              endsAt: fim.length > 0 ? fim : null,
              location: local.length > 0 ? local : null,
              capacity: teto.length > 0 ? Number(teto) : null,
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
            Nome
            <input
              name="name"
              required
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Onde (texto livre, opcional)
            <input
              name="location"
              placeholder="salão 2, sede, Zoom…"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Começa em
            <input
              name="startsAt"
              type="datetime-local"
              required
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text tabular"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Termina em (opcional)
            <input
              name="endsAt"
              type="datetime-local"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text tabular"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Capacidade (opcional)
            <input
              name="capacity"
              type="number"
              min="1"
              placeholder="sem teto"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text tabular"
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
        {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-bos-accent px-4 py-2 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
          >
            {pending ? 'Criando…' : 'Criar rascunho'}
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
