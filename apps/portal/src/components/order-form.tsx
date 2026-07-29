'use client';

import { useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';

import { registerOrder } from '@/app/po-actions';
import { ErrorState, Panel } from '@/components/states';

type Linha = { key: string; description: string; quantity: string; unit: string };

/**
 * Formulário de pedido COM itens dinâmicos.
 * Validação de negócio: `validateNewOrder()` no pacote — aqui só formata.
 */
export function OrderForm({ canManage }: { canManage: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [linhas, setLinhas] = useState<Linha[]>([
    { key: '1', description: '', quantity: '1', unit: '' },
  ]);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <ErrorState
        title="Você não pode registrar pedidos neste tenant"
        detail="Esta ação exige a permissão po.order.manage."
      />
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text transition-colors hover:bg-bos-accent/25"
      >
        Novo pedido
      </button>
    );
  }

  function salvar(formData: FormData) {
    setErro(null);
    setCampos({});

    startTransition(async () => {
      const r = await registerOrder({
        externalRef: String(formData.get('externalRef') ?? ''),
        currency: String(formData.get('currency') ?? '').trim().toUpperCase(),
        supplierName: String(formData.get('supplierName') ?? ''),
        counterpartyTaxId: String(formData.get('counterpartyTaxId') ?? ''),
        description: String(formData.get('description') ?? ''),
        items: linhas.map((l) => ({
          description: l.description,
          quantity: l.quantity ? Number(l.quantity) : undefined,
          unitAmountCents: l.unit ? Math.round(Number(l.unit) * 100) : undefined,
        })),
      });

      if (!r.ok) {
        setErro(r.message);
        if ('problems' in r && r.problems) {
          setCampos(Object.fromEntries(r.problems.map((p) => [p.field, p.message])));
        }
        return;
      }
      formRef.current?.reset();
      setLinhas([{ key: String(Date.now()), description: '', quantity: '1', unit: '' }]);
      setAberto(false);
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Registrar pedido</h2>
      <p className="mt-1 text-sm text-bos-muted">
        Itens são texto livre — sem catálogo, SKU ou NCM. Sem cotação nem centro de custo.
      </p>

      <form
        ref={formRef}
        className="mt-4 flex flex-col gap-4"
        action={(fd) => salvar(fd)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Referência" name="externalRef" erro={campos.externalRef} required />
          <Campo label="Moeda (ISO)" name="currency" placeholder="BRL" erro={campos.currency} required />
          <Campo label="Fornecedor" name="supplierName" erro={campos.supplierName} />
          <Campo
            label="Identificador fiscal"
            name="counterpartyTaxId"
            erro={campos.counterpartyTaxId}
          />
        </div>
        <Campo label="Descrição" name="description" erro={campos.description} />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-bos-muted">Itens</span>
            <button
              type="button"
              className="text-sm text-bos-accent hover:underline"
              onClick={() =>
                setLinhas((ls) => [
                  ...ls,
                  { key: String(Date.now()), description: '', quantity: '1', unit: '' },
                ])
              }
            >
              + linha
            </button>
          </div>
          {campos.items ? <p className="mb-2 text-xs text-bos-danger">{campos.items}</p> : null}
          <div className="flex flex-col gap-2">
            {linhas.map((l, idx) => (
              <div key={l.key} className="grid gap-2 sm:grid-cols-12">
                <input
                  className="sm:col-span-6 rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm"
                  placeholder="Descrição do item"
                  value={l.description}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="sm:col-span-2 rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm"
                  placeholder="Qtd"
                  value={l.quantity}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="sm:col-span-3 rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm"
                  placeholder="Unitário (R$)"
                  value={l.unit}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className="sm:col-span-1 text-xs text-bos-muted hover:text-bos-danger"
                  disabled={linhas.length <= 1}
                  onClick={() => setLinhas((ls) => ls.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text disabled:opacity-50"
          >
            {pending ? 'Salvando…' : 'Salvar rascunho'}
          </button>
          <button
            type="button"
            className="rounded-md px-4 py-2 text-sm text-bos-muted hover:text-bos-text"
            onClick={() => setAberto(false)}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Campo({
  label,
  name,
  erro,
  required,
  placeholder,
}: {
  label: ReactNode;
  name: string;
  erro?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-bos-muted">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
      />
      {erro ? <span className="text-xs text-bos-danger">{erro}</span> : null}
    </label>
  );
}
