'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { canArchive, canReactivate } from '@alsham/inventory';
import type { ItemBalance } from '@alsham/inventory';

import { changeItemStatus } from '@/app/inv-actions';
import { Badge, EmptyState, Panel } from '@/components/states';

/**
 * A lista de itens com o SALDO CALCULADO — recebido pronto do pacote
 * (`buildBalances`), nunca somado aqui. Saldo negativo aparece em vermelho
 * dizendo "investigue": ele é permitido de propósito (0023 §4.1), e
 * escondê-lo seria maquiar o livro.
 */
export function InventoryList({
  rows,
  canManage,
}: {
  rows: readonly ItemBalance[];
  canManage: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhum item cadastrado"
        hint="Cadastre o primeiro acima. O saldo nasce do livro de movimentos — calculado, nunca digitado."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((b) => (
        <ItemCard key={b.item.id} row={b} canManage={canManage} />
      ))}
    </div>
  );
}

function ItemCard({ row, canManage }: { row: ItemBalance; canManage: boolean }) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { item, balance, state, movementCount } = row;

  function run(to: 'active' | 'archived') {
    setErro(null);
    startTransition(async () => {
      const r = await changeItemStatus({ itemId: item.id, to });
      if (!r.ok) setErro(r.message);
      else setConfirmArchive(false);
    });
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg text-bos-text">{item.description}</h2>
            {item.sku ? (
              <span className="font-mono text-[11px] text-bos-muted">{item.sku}</span>
            ) : null}
            {item.status === 'archived' ? <Badge tone="neutral">arquivado</Badge> : null}
            {state === 'negative' ? (
              <Badge tone="danger">saldo negativo — investigue</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-bos-text tabular">
            Saldo{' '}
            <span className={state === 'negative' ? 'text-bos-danger' : undefined}>
              {balance.toLocaleString('pt-BR')} {item.unit}
            </span>{' '}
            · {movementCount} movimento(s)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/estoque/${item.id}`}
            className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:bg-bos-surface"
          >
            Extrato
          </Link>
          {canManage && canArchive(item.status) ? (
            confirmArchive ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-danger"
                  onClick={() => run('archived')}
                >
                  Confirmar arquivar
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1.5 text-sm text-bos-muted"
                  onClick={() => setConfirmArchive(false)}
                >
                  Voltar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
                onClick={() => setConfirmArchive(true)}
              >
                Arquivar
              </button>
            )
          ) : null}
          {canManage && canReactivate(item.status) ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:bg-bos-surface"
              onClick={() => run('active')}
            >
              Reativar
            </button>
          ) : null}
        </div>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
