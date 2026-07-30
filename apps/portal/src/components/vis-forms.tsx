'use client';

import { useState, useTransition } from 'react';

import { createVisit } from '@/app/vis-actions';
import { Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Registrar entrada (walk-in) ou agendar — o carimbo é sempre do servidor. */
export function VisForm({
  canRegister,
  canSchedule,
}: {
  canRegister: boolean;
  canSchedule: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [contato, setContato] = useState('');
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [agendar, setAgendar] = useState(false);
  const [quando, setQuando] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        {canRegister ? 'Registrar entrada' : 'Agendar visita'}
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await createVisit({
        visitorName: nome,
        visitorDocument: documento,
        visitorContact: contato,
        host: destino,
        reason: motivo,
        scheduled: agendar || !canRegister,
        expectedAt: quando.trim() === '' ? null : quando,
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setNome(''); setDocumento(''); setContato(''); setDestino(''); setMotivo(''); setQuando('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">
        {agendar || !canRegister ? 'Agendar visita' : 'Registrar entrada — agora'}
      </h2>
      <p className="mt-1 text-xs text-bos-muted">
        A hora de entrada quem carimba é o servidor. O documento fica na portaria — ele não passeia pelo correio.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Nome do visitante*
          <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Destino / anfitrião* (texto livre)
          <input className={campo} value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="compras · dr. Silva · obra 2…" />
        </label>
        <label className="text-xs text-bos-muted">
          Documento (opcional)
          <input className={campo} value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Contato (opcional)
          <input className={campo} value={contato} onChange={(e) => setContato(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted sm:col-span-2">
          Motivo (opcional)
          <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        {canRegister && canSchedule ? (
          <label className="flex items-center gap-2 text-xs text-bos-muted">
            <input type="checkbox" checked={agendar} onChange={(e) => setAgendar(e.target.checked)} />
            Agendar para depois
          </label>
        ) : null}
        {agendar || !canRegister ? (
          <label className="text-xs text-bos-muted">
            Quando*
            <input className={campo} type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
          </label>
        ) : null}
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={enviar}
        >
          {agendar || !canRegister ? 'Agendar' : 'Entrou — carimbar agora'}
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
