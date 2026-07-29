'use client';

import { useState, useTransition } from 'react';

import type { Category, EntryKind } from '@alsham/cashflow';

import { createCategory, createEntry, setCategoryStatus } from '@/app/cash-actions';
import { Badge, Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Lançar no livro — entrada, saída ou ajuste (com razão). */
export function CashEntryForm({
  categories,
  canRegister,
  canAdjust,
  today,
}: {
  categories: readonly Category[];
  canRegister: boolean;
  canAdjust: boolean;
  today: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState<EntryKind>('in');
  const [valor, setValor] = useState('');
  const [moeda, setMoeda] = useState('BRL');
  const [descricao, setDescricao] = useState('');
  const [razao, setRazao] = useState('');
  const [categoria, setCategoria] = useState('');
  const [conta, setConta] = useState('');
  const [data, setData] = useState(today);

  const ativas = categories.filter((c) => c.status === 'active');

  function enviar() {
    setErro(null);
    const cents = Math.round(Number(valor.replace(',', '.')) * 100);
    startTransition(async () => {
      const r = await createEntry({
        kind,
        amountCents: cents,
        currency: moeda,
        description: descricao,
        reason: razao,
        categoryId: categoria === '' ? null : categoria,
        account: conta,
        occurredOn: data,
      });
      if (!r.ok) setErro(r.message);
      else {
        setValor(''); setDescricao(''); setRazao(''); setConta('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Lançar no livro</h2>
      <p className="mt-1 text-xs text-bos-muted">
        O sinal vem do tipo. Ajuste exige razão. Futuro não entra — previsão é Orçamento.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-bos-muted">
          Tipo
          <select className={campo} value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
            {canRegister ? <option value="in">Entrada</option> : null}
            {canRegister ? <option value="out">Saída</option> : null}
            {canAdjust ? <option value="adjustment">Ajuste (com razão)</option> : null}
          </select>
        </label>
        <label className="text-xs text-bos-muted">
          Valor
          <span className="flex gap-2">
            <input className={campo} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={kind === 'adjustment' ? '-120,00' : '1200,00'} />
            <input className="w-20 rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text" value={moeda} onChange={(e) => setMoeda(e.target.value.toUpperCase())} />
          </span>
        </label>
        <label className="text-xs text-bos-muted">
          Dia do movimento
          <input type="date" className={campo} value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Categoria (opcional — sem categoria é honesto)
          <select className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">— sem categoria —</option>
            {ativas.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-bos-muted">
          Conta (texto livre)
          <input className={campo} value={conta} onChange={(e) => setConta(e.target.value)} placeholder="caixa loja · conta principal…" />
        </label>
        <label className="text-xs text-bos-muted">
          Descrição
          <input className={campo} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
        {kind === 'adjustment' ? (
          <label className="text-xs text-bos-muted sm:col-span-3">
            Razão do ajuste* (fica no livro para sempre)
            <input className={campo} value={razao} onChange={(e) => setRazao(e.target.value)} placeholder="diferença de caixa · contagem inicial…" />
          </label>
        ) : null}
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
      <div className="mt-4">
        <button
          type="button"
          disabled={pending || (!canRegister && !canAdjust)}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
          onClick={enviar}
        >
          Lançar
        </button>
      </div>
    </Panel>
  );
}

/** As categorias do tenant — criar, arquivar, reativar. */
export function CategoryManager({
  categories,
  canManage,
}: {
  categories: readonly Category[];
  canManage: boolean;
}) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;

  function criar() {
    setErro(null);
    startTransition(async () => {
      const r = await createCategory({ name: nome });
      if (!r.ok) setErro(r.message);
      else setNome('');
    });
  }

  function mudar(categoryId: string, status: 'active' | 'archived') {
    startTransition(async () => {
      const r = await setCategoryStatus({ categoryId, status });
      if (!r.ok) setErro(r.message);
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Categorias do tenant</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <Badge tone={c.status === 'active' ? 'neutral' : 'warning'}>{c.name}</Badge>
            <button
              type="button"
              disabled={pending}
              className="text-[11px] text-bos-muted underline"
              onClick={() => mudar(c.id, c.status === 'active' ? 'archived' : 'active')}
            >
              {c.status === 'active' ? 'arquivar' : 'reativar'}
            </button>
          </span>
        ))}
        <span className="flex items-center gap-2">
          <input
            className="w-44 rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
            placeholder="nova categoria"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-bos-border px-2 py-1 text-xs text-bos-text"
            onClick={criar}
          >
            Criar
          </button>
        </span>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
