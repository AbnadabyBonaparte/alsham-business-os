'use client';

import { useState, useTransition } from 'react';

import { createLine } from '@/app/dre-actions';
import { Panel } from '@/components/states';

const campo = 'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

export function DreLineForm() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [natureza, setNatureza] = useState<'revenue' | 'cost' | 'expense'>('revenue');
  const [categoria, setCategoria] = useState('');
  const [posicao, setPosicao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        className="self-start rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Nova linha
      </button>
    );
  }
  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Nova linha da DRE</h2>
      <p className="mt-1 text-xs text-bos-muted">
        Nome livre; natureza (receita soma, custo e despesa subtraem); a categoria casa com os livros.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Vendas · Aluguel…" />
        <select className={campo} value={natureza} onChange={(e) => setNatureza(e.target.value as 'revenue' | 'cost' | 'expense')}>
          <option value="revenue">receita</option>
          <option value="cost">custo</option>
          <option value="expense">despesa</option>
        </select>
        <input className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="categoria (casa com os livros)…" />
        <input className={campo} inputMode="numeric" value={posicao} onChange={(e) => setPosicao(e.target.value)} placeholder="posição (0, 1, 2…)" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await createLine({ name: nome, kind: natureza, matchCategory: categoria, position: Number(posicao) || 0, currency: 'BRL' });
              if (!r.ok) setErro(r.message);
              else { setAberto(false); setNome(''); setCategoria(''); setPosicao(''); }
            })
          }
        >
          Criar
        </button>
        <button type="button" className="text-sm text-bos-muted hover:text-bos-text" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
