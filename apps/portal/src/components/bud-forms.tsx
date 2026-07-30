'use client';

import { useState, useTransition } from 'react';

import { createBudget } from '@/app/bud-actions';
import { Panel } from '@/components/states';

const campo = 'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

export function BudBudgetForm() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [teto, setTeto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        className="self-start rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Novo orçamento
      </button>
    );
  }
  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Novo orçamento</h2>
      <p className="mt-1 text-xs text-bos-muted">
        Nasce no rascunho — a categoria casa com o caixa; ativar congela a trave (categoria, período, teto).
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Marketing Q3…" />
        <input className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="categoria (casa com o caixa)…" />
        <label className="flex items-center gap-2 text-xs text-bos-muted">
          início
          <input className={campo} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-bos-muted">
          fim
          <input className={campo} type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
        <input className={campo} inputMode="decimal" value={teto} onChange={(e) => setTeto(e.target.value)} placeholder="teto (BRL)" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await createBudget({
                name: nome,
                category: categoria,
                startsOn: inicio,
                endsOn: fim,
                limit: teto,
                currency: 'BRL',
              });
              if (!r.ok) setErro(r.message);
              else {
                setAberto(false);
                setNome(''); setCategoria(''); setInicio(''); setFim(''); setTeto('');
              }
            })
          }
        >
          Criar rascunho
        </button>
        <button type="button" className="text-sm text-bos-muted hover:text-bos-text" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
