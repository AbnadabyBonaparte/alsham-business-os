'use client';

import { useState, useTransition } from 'react';

import { createNotice } from '@/app/comm-actions';
import { Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Redigir um comunicado — nasce no rascunho; a validação é do pacote. */
export function CommForm({
  correcting,
  onDone,
}: {
  correcting?: { id: string; title: string } | null;
  onDone?: () => void;
}) {
  const [aberto, setAberto] = useState(Boolean(correcting));
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [titulo, setTitulo] = useState('');
  const [audiencia, setAudiencia] = useState('');
  const [corpo, setCorpo] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Redigir comunicado
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await createNotice({
        title: titulo,
        body: corpo,
        audience: audiencia,
        correctsNoticeId: correcting?.id ?? null,
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setTitulo('');
        setAudiencia('');
        setCorpo('');
        onDone?.();
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">
        {correcting ? 'Corrigir publicando comunicado novo' : 'Novo comunicado no mural'}
      </h2>
      <p className="mt-1 text-xs text-bos-muted">
        {correcting ? (
          <>
            A palavra dada não se edita: este comunicado nasce referenciando{' '}
            <span className="text-bos-text">“{correcting.title}”</span> — e o título fica carimbado
            pelo servidor.
          </>
        ) : (
          <>Nasce no rascunho; o corpo pode vir depois — mas sem corpo não se publica.</>
        )}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Título*
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Audiência* (texto livre)
          <input
            className={campo}
            value={audiencia}
            onChange={(e) => setAudiencia(e.target.value)}
            placeholder="todos · administrativo · lojistas do piso 2…"
          />
        </label>
        <label className="text-xs text-bos-muted sm:col-span-2">
          Corpo
          <textarea className={campo} rows={4} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
        </label>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={enviar}
        >
          Redigir — nasce no rascunho
        </button>
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
          onClick={() => {
            setAberto(false);
            onDone?.();
          }}
        >
          Cancelar
        </button>
      </div>
    </Panel>
  );
}
