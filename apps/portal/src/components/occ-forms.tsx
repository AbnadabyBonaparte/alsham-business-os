'use client';

import { useState, useTransition } from 'react';

import type { Severity } from '@alsham/occurrences';

import { createSeverity, registerOccurrence } from '@/app/occ-actions';
import { Badge, Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Registrar o fato — nasce imutável. */
export function OccForm({ severities }: { severities: readonly Severity[] }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [titulo, setTitulo] = useState('');
  const [relato, setRelato] = useState('');
  const [local, setLocal] = useState('');
  const [envolvidos, setEnvolvidos] = useState('');
  const [gravidade, setGravidade] = useState('');
  const [quando, setQuando] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Registrar ocorrência
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await registerOccurrence({
        title: titulo,
        description: relato,
        location: local,
        involved: envolvidos,
        severityId: gravidade === '' ? null : gravidade,
        occurredAt: quando === '' ? '' : new Date(quando).toISOString(),
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setTitulo(''); setRelato(''); setLocal(''); setEnvolvidos(''); setQuando('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Registrar o fato</h2>
      <p className="mt-1 text-xs text-bos-muted">
        O registro nasce imutável — corrigir é tratativa. O futuro não entra: fato consumado.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Título*
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Quando aconteceu (vazio = agora)
          <input type="datetime-local" className={campo} value={quando} onChange={(e) => setQuando(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Onde (texto livre)
          <input className={campo} value={local} onChange={(e) => setLocal(e.target.value)} placeholder="doca 3 · corredor B…" />
        </label>
        <label className="text-xs text-bos-muted">
          Gravidade
          <select className={campo} value={gravidade} onChange={(e) => setGravidade(e.target.value)}>
            <option value="">— sem gravidade —</option>
            {severities.filter((s) => s.status === 'active').map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-bos-muted sm:col-span-2">
          Relato* (o registro É o relato)
          <textarea className={campo} rows={3} value={relato} onChange={(e) => setRelato(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted sm:col-span-2">
          Envolvidos (texto livre)
          <input className={campo} value={envolvidos} onChange={(e) => setEnvolvidos(e.target.value)} placeholder="nomes, placas, crachás…" />
        </label>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={pending} className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60" onClick={enviar}>
          Registrar
        </button>
        <button type="button" className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </div>
    </Panel>
  );
}

/** A régua de gravidade do tenant. */
export function SeveritySetup({
  severities,
  canSetup,
}: {
  severities: readonly Severity[];
  canSetup: boolean;
}) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canSetup) return null;

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Régua de gravidade (na ordem)</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[...severities].sort((a, b) => a.position - b.position).map((s) => (
          <Badge key={s.id} tone={s.status === 'active' ? 'danger' : 'warning'}>{s.name}</Badge>
        ))}
        <input
          className="w-44 rounded-md border border-bos-border bg-bos-bg px-2 py-1 text-xs text-bos-text"
          placeholder="nova gravidade"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-bos-border px-2 py-1 text-xs text-bos-text"
          onClick={() =>
            startTransition(async () => {
              const r = await createSeverity({ name: nome, position: severities.length });
              if (!r.ok) setErro(r.message);
              else setNome('');
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
