'use client';

import { useState, useTransition } from 'react';

import { createContract } from '@/app/ctr-actions';
import { Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Registrar um contrato (nasce rascunho). A validação é do pacote. */
export function ContractForm() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [ref, setRef] = useState('');
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState('');
  const [contraparte, setContraparte] = useState('');
  const [taxId, setTaxId] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [valor, setValor] = useState('');
  const [moeda, setMoeda] = useState('BRL');
  const [descricao, setDescricao] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Registrar contrato
      </button>
    );
  }

  function enviar() {
    setErro(null);
    const cents = valor.trim() === '' ? null : Math.round(Number(valor.replace(',', '.')) * 100);
    startTransition(async () => {
      const r = await createContract({
        externalRef: ref,
        title: titulo,
        description: descricao,
        contractType: tipo,
        counterpartyName: contraparte,
        counterpartyTaxId: taxId,
        startsOn: inicio,
        endsOn: fim,
        valueCents: cents,
        currency: valor.trim() === '' ? '' : moeda,
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setRef(''); setTitulo(''); setTipo(''); setContraparte('');
        setTaxId(''); setInicio(''); setFim(''); setValor(''); setDescricao('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Novo contrato</h2>
      <p className="mt-1 text-xs text-bos-muted">
        Nasce rascunho. Entrar em vigor exige contraparte e início — e depois disso os termos mudam
        só por reajuste ou renovação.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Referência*
          <input className={campo} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="CTR-2026-003" />
        </label>
        <label className="text-xs text-bos-muted">
          Objeto*
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Locação de sala comercial" />
        </label>
        <label className="text-xs text-bos-muted">
          Tipo (texto livre)
          <input className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="locação · prestação · fornecimento…" />
        </label>
        <label className="text-xs text-bos-muted">
          Contraparte
          <input className={campo} value={contraparte} onChange={(e) => setContraparte(e.target.value)} placeholder="Razão social ou nome" />
        </label>
        <label className="text-xs text-bos-muted">
          Identificador fiscal
          <input className={campo} value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Início da vigência
          <input type="date" className={campo} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Fim da vigência (vazio = indeterminado)
          <input type="date" className={campo} value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Valor (opcional)
          <span className="flex gap-2">
            <input className={campo} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="3500,00" />
            <input className="w-20 rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text" value={moeda} onChange={(e) => setMoeda(e.target.value.toUpperCase())} />
          </span>
        </label>
        <label className="text-xs text-bos-muted sm:col-span-2">
          Anotações
          <textarea className={campo} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
          onClick={enviar}
        >
          Registrar
        </button>
        <button
          type="button"
          className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text"
          onClick={() => setAberto(false)}
        >
          Fechar
        </button>
      </div>
    </Panel>
  );
}
