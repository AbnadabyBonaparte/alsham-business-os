'use client';

import { useState, useTransition } from 'react';

import type { MntPriority, OrderKind } from '@alsham/maintenance';

import { createOrder, createPriority } from '@/app/mnt-actions';
import { Badge, Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Abrir uma ordem. A validação é do pacote. */
export function MntOrderForm({ priorities }: { priorities: readonly MntPriority[] }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<OrderKind>('corrective');
  const [alvo, setAlvo] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [recorrencia, setRecorrencia] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Abrir ordem
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await createOrder({
        title: titulo,
        description: descricao,
        kind: tipo,
        target: alvo,
        priorityId: prioridade === '' ? null : prioridade,
        recurrenceDays: recorrencia.trim() === '' ? null : Number(recorrencia),
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setTitulo(''); setDescricao(''); setAlvo(''); setRecorrencia('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Nova ordem de manutenção</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Título*
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Alvo* (texto livre)
          <input className={campo} value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder="elevador 2 · ar da sala 5…" />
        </label>
        <label className="text-xs text-bos-muted">
          Tipo (física do domínio)
          <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as OrderKind)}>
            <option value="corrective">Corretiva — a falha já aconteceu</option>
            <option value="preventive">Preventiva — antecipar a falha</option>
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
        {tipo === 'preventive' ? (
          <label className="text-xs text-bos-muted">
            Recorrência: a cada N dias após a conclusão
            <input className={campo} inputMode="numeric" value={recorrencia} onChange={(e) => setRecorrencia(e.target.value)} placeholder="90" />
          </label>
        ) : null}
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

/** A régua de prioridade do tenant. */
export function MntSetup({
  priorities,
  canSetup,
}: {
  priorities: readonly MntPriority[];
  canSetup: boolean;
}) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canSetup) return null;

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Prioridades (na ordem)</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[...priorities].sort((a, b) => a.position - b.position).map((p) => (
          <Badge key={p.id} tone={p.status === 'active' ? 'danger' : 'warning'}>{p.name}</Badge>
        ))}
        <input
          className="w-44 rounded-md border border-bos-border bg-bos-bg px-2 py-1 text-xs text-bos-text"
          placeholder="nova prioridade"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-bos-border px-2 py-1 text-xs text-bos-text"
          onClick={() =>
            startTransition(async () => {
              const r = await createPriority({ name: nome, position: priorities.length });
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
