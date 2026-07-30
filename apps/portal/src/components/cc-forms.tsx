'use client';

import { useState, useTransition } from 'react';

import { createCenter, createRule } from '@/app/cc-actions';
import { Panel } from '@/components/states';

const campo = 'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

export function CcCenterForm() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        className="self-start rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Cadastrar centro
      </button>
    );
  }
  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Novo centro de custo</h2>
      <p className="mt-1 text-xs text-bos-muted">Nome livre — por obra, por cliente, por setor. O centro é seu.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className={campo + ' sm:w-72'} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Administrativo · Obra Zona Sul…" />
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await createCenter({ name: nome });
              if (!r.ok) setErro(r.message);
              else { setAberto(false); setNome(''); }
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

export function CcRuleForm() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        className="self-start rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:border-bos-accent"
        onClick={() => setAberto(true)}
      >
        Nova regra de rateio
      </button>
    );
  }
  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Nova regra de rateio</h2>
      <p className="mt-1 text-xs text-bos-muted">
        Nasce no rascunho — some as linhas por centro; ativar exige fechar 100%.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className={campo + ' sm:w-72'} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Rateio da matriz…" />
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:border-bos-accent"
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await createRule({ name: nome });
              if (!r.ok) setErro(r.message);
              else { setAberto(false); setNome(''); }
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
