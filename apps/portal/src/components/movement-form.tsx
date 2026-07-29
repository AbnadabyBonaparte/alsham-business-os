'use client';

import { useState, useTransition } from 'react';

import { permissionForMovement } from '@alsham/inventory';
import type { MovementKind } from '@alsham/inventory';

import { registerMovement } from '@/app/inv-actions';
import type { ItemRow } from '@/lib/data';
import { Panel } from '@/components/states';

const ROTULO_KIND: Record<MovementKind, string> = {
  in: 'entrada',
  out: 'saída',
  adjustment: 'ajuste',
};

/**
 * Lançar no livro. O tipo decide a permissão (`permissionForMovement`, do
 * pacote) — o botão de ajuste só aparece para quem pode ajustar, e a razão
 * do ajuste é obrigatória na validação E na constraint do banco.
 */
export function MovementForm({
  items,
  canRegister,
  canAdjust,
}: {
  items: readonly ItemRow[];
  canRegister: boolean;
  canAdjust: boolean;
}) {
  const [kind, setKind] = useState<MovementKind>('in');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ativos = items.filter((i) => i.status === 'active');
  const tipos = (Object.keys(ROTULO_KIND) as MovementKind[]).filter((k) =>
    permissionForMovement(k) === 'inv.movement.adjust' ? canAdjust : canRegister,
  );

  if (tipos.length === 0 || ativos.length === 0) return null;

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Lançar no livro</h2>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const dados = new FormData(form);
          const externalRef = String(dados.get('externalRef') ?? '').trim();
          const location = String(dados.get('location') ?? '').trim();
          setErro(null);
          startTransition(async () => {
            const r = await registerMovement({
              itemId: String(dados.get('itemId') ?? ''),
              kind,
              quantity: Number(dados.get('quantity')),
              reason: String(dados.get('reason') ?? ''),
              externalRef: externalRef.length > 0 ? externalRef : null,
              location: location.length > 0 ? location : null,
            });
            if (!r.ok) setErro(r.message);
            else form.reset();
          });
        }}
      >
        <div className="flex flex-wrap gap-2">
          {tipos.map((k) => (
            <button
              key={k}
              type="button"
              className={
                k === kind
                  ? 'rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg'
                  : 'rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text'
              }
              onClick={() => setKind(k)}
            >
              {ROTULO_KIND[k]}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-bos-muted sm:col-span-2">
            Item
            <select
              name="itemId"
              required
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            >
              {ativos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.description} ({i.unit}){i.sku ? ` · ${i.sku}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Quantidade{kind === 'adjustment' ? ' (± permite negativo)' : ''}
            <input
              name="quantity"
              type="number"
              step="any"
              required
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text tabular"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm text-bos-muted">
          Razão{kind === 'adjustment' ? ' (obrigatória no ajuste)' : ' (opcional)'}
          <input
            name="reason"
            required={kind === 'adjustment'}
            placeholder={
              kind === 'adjustment' ? 'quebra na descarga, contagem física…' : 'opcional'
            }
            className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Referência externa (opcional)
            <input
              name="externalRef"
              placeholder="NF, pedido, romaneio…"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 font-mono text-bos-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-bos-muted">
            Local (opcional, texto livre)
            <input
              name="location"
              placeholder="depósito 1, loja centro…"
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
        </div>

        {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-bos-accent px-4 py-2 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
          >
            {pending ? 'Lançando…' : 'Lançar movimento'}
          </button>
        </div>
      </form>
    </Panel>
  );
}
