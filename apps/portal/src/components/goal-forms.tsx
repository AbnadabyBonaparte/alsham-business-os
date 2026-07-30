'use client';

import { useState, useTransition } from 'react';

import { createGoal } from '@/app/goal-actions';
import { Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Declarar uma ambição — nasce no rascunho; a validação é do pacote. */
export function GoalForm() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [metrica, setMetrica] = useState('');
  const [alvo, setAlvo] = useState('');
  const [moeda, setMoeda] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Declarar meta
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await createGoal({
        title: titulo,
        description: descricao,
        metric: metrica,
        targetValue: alvo.trim() === '' ? null : Number(alvo.replace(',', '.')),
        currency: moeda.trim() === '' ? null : moeda,
        startsOn: inicio,
        endsOn: fim,
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setTitulo(''); setDescricao(''); setMetrica(''); setAlvo(''); setMoeda(''); setInicio(''); setFim('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Nova ambição no placar</h2>
      <p className="mt-1 text-xs text-bos-muted">
        A métrica é texto livre — a unidade mora nela. O alvo é opcional; se for dinheiro, a moeda vem junto.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Título*
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Métrica* (texto livre)
          <input className={campo} value={metrica} onChange={(e) => setMetrica(e.target.value)} placeholder="faturamento · NPS da praça · lojas ocupadas…" />
        </label>
        <label className="text-xs text-bos-muted">
          Alvo (opcional)
          <input className={campo} inputMode="decimal" value={alvo} onChange={(e) => setAlvo(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Moeda (só se o alvo for dinheiro)
          <input className={campo} maxLength={3} value={moeda} onChange={(e) => setMoeda(e.target.value)} placeholder="BRL" />
        </label>
        <label className="text-xs text-bos-muted">
          Início do período*
          <input className={campo} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Fim do período*
          <input className={campo} type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted sm:col-span-2">
          Descrição
          <textarea className={campo} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
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
          Declarar — nasce no rascunho
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
