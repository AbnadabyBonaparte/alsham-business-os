'use client';

import { useState, useTransition } from 'react';

import { createSurvey } from '@/app/nps-actions';
import { Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Redigir uma rodada — nasce no rascunho; a validação é do pacote. */
export function NpsSurveyForm() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [titulo, setTitulo] = useState('');
  const [pergunta, setPergunta] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Redigir rodada
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await createSurvey({ title: titulo, question: pergunta });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setTitulo('');
        setPergunta('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Nova rodada de medição</h2>
      <p className="mt-1 text-xs text-bos-muted">
        A régua 0–10 é do método — as palavras da pergunta são suas. Ao abrir a coleta, a pergunta congela.
      </p>
      <div className="mt-4 grid gap-3">
        <label className="text-xs text-bos-muted">
          Título*
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="A voz da praça — agosto" />
        </label>
        <label className="text-xs text-bos-muted">
          Pergunta*
          <textarea
            className={campo}
            rows={2}
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            placeholder="De 0 a 10, o quanto você nos recomendaria a um amigo?"
          />
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
          onClick={() => setAberto(false)}
        >
          Cancelar
        </button>
      </div>
    </Panel>
  );
}
