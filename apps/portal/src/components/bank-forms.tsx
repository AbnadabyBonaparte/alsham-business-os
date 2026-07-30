'use client';

import { useState, useTransition } from 'react';

import type { AccountRow } from '@/lib/data';
import { createAccount, transfer } from '@/app/bank-actions';
import { Panel } from '@/components/states';

const campo = 'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

export function BankAccountForm() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [numero, setNumero] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        className="self-start rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Cadastrar conta
      </button>
    );
  }
  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Nova conta bancária</h2>
      <p className="mt-1 text-xs text-bos-muted">Apelido livre; banco, agência e número em texto. A conta é sua.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Conta Principal…" />
        <input className={campo} value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="banco (opcional)" />
        <input className={campo} value={agencia} onChange={(e) => setAgencia(e.target.value)} placeholder="agência (opcional)" />
        <input className={campo} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="número (opcional)" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await createAccount({ name: nome, bankName: banco, branch: agencia, accountNumber: numero, currency: 'BRL' });
              if (!r.ok) setErro(r.message);
              else { setAberto(false); setNome(''); setBanco(''); setAgencia(''); setNumero(''); }
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

export function BankTransferForm({ accounts }: { accounts: readonly AccountRow[] }) {
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState('');
  const [para, setPara] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ativas = accounts.filter((a) => a.status === 'active');
  if (ativas.length < 2) return null;

  if (!aberto) {
    return (
      <button
        type="button"
        className="self-start rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:border-bos-accent"
        onClick={() => setAberto(true)}
      >
        Transferir entre contas
      </button>
    );
  }
  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Transferir entre contas</h2>
      <p className="mt-1 text-xs text-bos-muted">Duas pernas, uma transação — ou as duas entram, ou nenhuma.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select className={campo} value={de} onChange={(e) => setDe(e.target.value)}>
          <option value="">de…</option>
          {ativas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={campo} value={para} onChange={(e) => setPara(e.target.value)}>
          <option value="">para…</option>
          {ativas.filter((a) => a.id !== de).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className={campo} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="valor (BRL)" />
        <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <input className={campo + ' sm:col-span-2'} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="descrição (opcional)" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:border-bos-accent"
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await transfer({ fromAccountId: de, toAccountId: para, amount: valor, occurredOn: data, description: descricao });
              if (!r.ok) setErro(r.message);
              else { setAberto(false); setDe(''); setPara(''); setValor(''); setData(''); setDescricao(''); }
            })
          }
        >
          Transferir
        </button>
        <button type="button" className="text-sm text-bos-muted hover:text-bos-text" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
