'use client';

import { useState, useTransition } from 'react';

import { registerItem } from '@/app/inv-actions';
import { Panel } from '@/components/states';

/**
 * Cadastrar um item. Descrição e unidade em TEXTO LIVRE; SKU opcional, do
 * tenant. Quem valida é o pacote, na action — a tela só pergunta.
 */
export function ItemForm({ canManage }: { canManage: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md border border-bos-border px-4 py-2 text-sm text-bos-text hover:bg-bos-surface"
        onClick={() => setAberto(true)}
      >
        Cadastrar item
      </button>
    );
  }

  return (
    <Panel className="px-6 py-5">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const dados = new FormData(form);
          const sku = String(dados.get('sku') ?? '').trim();
          setErro(null);
          startTransition(async () => {
            const r = await registerItem({
              description: String(dados.get('description') ?? ''),
              unit: String(dados.get('unit') ?? ''),
              sku: sku.length > 0 ? sku : null,
            });
            if (!r.ok) setErro(r.message);
            else {
              form.reset();
              setAberto(false);
            }
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-bos-muted sm:col-span-2">
            Descrição
            <input
              name="description"
              required
              placeholder="Parafuso 8mm, Tinta acrílica 18L…"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Unidade
            <input
              name="unit"
              required
              placeholder="un, kg, caixa, m²…"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm text-bos-muted sm:max-w-xs">
          SKU (opcional — o código do tenant, se houver)
          <input
            name="sku"
            placeholder="deixe vazio se não usa código"
            className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 font-mono text-bos-text"
          />
        </label>
        {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-bos-accent px-4 py-2 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
          >
            {pending ? 'Cadastrando…' : 'Cadastrar'}
          </button>
          <button
            type="button"
            className="rounded-md border border-bos-border px-4 py-2 text-sm text-bos-muted"
            onClick={() => setAberto(false)}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
