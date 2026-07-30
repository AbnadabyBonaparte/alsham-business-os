'use client';

import { useState, useTransition } from 'react';

import { createHolding } from '@/app/invest-actions';
import { Panel } from '@/components/states';

const campo = 'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

export function InvestHoldingForm() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [instituicao, setInstituicao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        className="self-start rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Cadastrar investimento
      </button>
    );
  }
  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Novo investimento</h2>
      <p className="mt-1 text-xs text-bos-muted">Nome, tipo e instituição em texto livre — CDB, cota de fundo, imóvel. É seu.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="CDB Banco X…" />
        <input className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="tipo (opcional)" />
        <input className={campo} value={instituicao} onChange={(e) => setInstituicao(e.target.value)} placeholder="instituição (opcional)" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await createHolding({ name: nome, kind: tipo, institution: instituicao, currency: 'BRL' });
              if (!r.ok) setErro(r.message);
              else { setAberto(false); setNome(''); setTipo(''); setInstituicao(''); }
            })
          }
        >
          Cadastrar
        </button>
        <button type="button" className="text-sm text-bos-muted hover:text-bos-text" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
