'use client';

import { useState, useTransition } from 'react';

import type { PatCategory } from '@alsham/assets';

import { createAsset, createPatCategory } from '@/app/pat-actions';
import { Badge, Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Cadastrar um bem. A validação é do pacote. */
export function PatAssetForm({ categories }: { categories: readonly PatCategory[] }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [nome, setNome] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('');
  const [lugar, setLugar] = useState('');
  const [valor, setValor] = useState('');
  const [moeda, setMoeda] = useState('BRL');
  const [dataAquisicao, setDataAquisicao] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Cadastrar bem
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const temValor = valor.trim() !== '';
      const r = await createAsset({
        name: nome,
        code: etiqueta,
        description: descricao,
        categoryId: categoria === '' ? null : categoria,
        originalLocation: lugar,
        acquisitionCostCents: temValor ? Math.round(Number(valor) * 100) : null,
        currency: temValor ? moeda : null,
        acquiredOn: dataAquisicao.trim() === '' ? null : dataAquisicao,
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setNome(''); setEtiqueta(''); setDescricao(''); setLugar(''); setValor(''); setDataAquisicao('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Novo bem no livro</h2>
      <p className="mt-1 text-xs text-bos-muted">
        A localização de cadastro congela — depois, mudar de lugar é ato no livro de transferências.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Nome*
          <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Etiqueta* (única no tenant)
          <input className={campo} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="ETQ-0031" />
        </label>
        <label className="text-xs text-bos-muted">
          Onde está* (texto livre)
          <input className={campo} value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="galpão 1 · sala 3 · van 12…" />
        </label>
        <label className="text-xs text-bos-muted">
          Categoria (do tenant)
          <select className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">— sem categoria —</option>
            {categories.filter((c) => c.status === 'active').map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-bos-muted">
          Valor de aquisição (opcional)
          <input className={campo} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="8500,00 → 8500.00" />
        </label>
        <label className="text-xs text-bos-muted">
          Moeda (junto com o valor)
          <input className={campo} value={moeda} onChange={(e) => setMoeda(e.target.value)} maxLength={3} />
        </label>
        <label className="text-xs text-bos-muted">
          Data de aquisição (sem futuro)
          <input className={campo} type="date" value={dataAquisicao} onChange={(e) => setDataAquisicao(e.target.value)} />
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
          Entrar no livro
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

/** As categorias do tenant — vocabulário, nunca enum. */
export function PatSetup({
  categories,
  canSetup,
}: {
  categories: readonly PatCategory[];
  canSetup: boolean;
}) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Categorias do tenant</h2>
      <p className="mt-1 text-xs text-bos-muted">
        &ldquo;máquina&rdquo;, &ldquo;veículo&rdquo;, &ldquo;mobiliário&rdquo; — o vocabulário é seu, nunca enum do produto.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {categories.length === 0 ? (
          <span className="text-xs text-bos-muted">Nenhuma categoria — e sem categoria também vale.</span>
        ) : (
          categories.map((c) => (
            <Badge key={c.id} tone={c.status === 'active' ? 'neutral' : 'warning'}>
              {c.name}
            </Badge>
          ))
        )}
      </div>
      {canSetup ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
            placeholder="nova categoria"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent"
            onClick={() => {
              setErro(null);
              startTransition(async () => {
                const r = await createPatCategory({ name: nome });
                if (!r.ok) setErro(r.message);
                else setNome('');
              });
            }}
          >
            Criar
          </button>
          {erro ? <span className="text-xs text-bos-danger">{erro}</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}
