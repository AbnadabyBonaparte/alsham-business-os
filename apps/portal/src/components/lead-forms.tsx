'use client';

import { useState, useTransition } from 'react';

import { countBySource } from '@alsham/leads';
import type { Lead } from '@alsham/leads';

import { createLead } from '@/app/lead-actions';
import { Badge, Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Registrar um interesse — a fila não faz interrogatório. */
export function LeadForm() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [nome, setNome] = useState('');
  const [contato, setContato] = useState('');
  const [origem, setOrigem] = useState('');
  const [interesse, setInteresse] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Registrar interesse
      </button>
    );
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Novo lead na fila</h2>
      <p className="mt-1 text-xs text-bos-muted">
        A origem é texto livre — &ldquo;instagram&rdquo;, &ldquo;indicação&rdquo;, &ldquo;stand&rdquo;. É o dado que a fila existe para guardar.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Nome*
          <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Contato (opcional — fica na fila, não viaja no correio)
          <input className={campo} value={contato} onChange={(e) => setContato(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          De onde veio (texto livre)
          <input className={campo} value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="instagram · indicação · stand…" />
        </label>
        <label className="text-xs text-bos-muted">
          Interesse (texto livre)
          <input className={campo} value={interesse} onChange={(e) => setInteresse(e.target.value)} />
        </label>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={() => {
            setErro(null);
            startTransition(async () => {
              const r = await createLead({ name: nome, contact: contato, source: origem, interest: interesse });
              if (!r.ok) setErro(r.message);
              else {
                setAberto(false);
                setNome(''); setContato(''); setOrigem(''); setInteresse('');
              }
            });
          }}
        >
          Entrar na fila
        </button>
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

/** As origens contadas — a leitura de funil que a fila existe para dar. */
export function LeadSources({ leads }: { leads: readonly Lead[] }) {
  if (leads.length === 0) return null;
  const mapa = [...countBySource(leads).entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">De onde as pessoas chegam</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {mapa.map(([origem, n]) => (
          <Badge key={origem} tone="neutral">
            {origem} · {n}
          </Badge>
        ))}
      </div>
    </Panel>
  );
}
