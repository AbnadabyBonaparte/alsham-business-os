'use client';

import { useState, useTransition } from 'react';

import { canCancel, canSubmit, canReceive } from '@alsham/purchase-orders';
import type { OrderStatus } from '@alsham/purchase-orders';

import { cancelOrder, submitOrder, receiveOrderLine } from '@/app/po-actions';
import type { OrderRow } from '@/lib/data';
import { money } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ROTULO: Record<OrderStatus, string> = {
  draft: 'rascunho',
  submitted: 'enviado',
  partially_received: 'recebido em parte',
  received: 'recebido',
  cancelled: 'cancelado',
};

const TOM: Record<OrderStatus, Tone> = {
  draft: 'neutral',
  submitted: 'info',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'neutral',
};

export function OrderList({
  rows,
  canCancelOrders,
  canSubmitOrders,
  canReceiveOrders,
}: {
  rows: readonly OrderRow[];
  canCancelOrders: boolean;
  canSubmitOrders: boolean;
  canReceiveOrders: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhum pedido registrado"
        hint="Registre o primeiro acima, com itens. Enviar e receber são atos separados — e cancelar é status, nunca apagar."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((o) => (
        <OrderCard
          key={o.id}
          order={o}
          canCancelOrders={canCancelOrders}
          canSubmitOrders={canSubmitOrders}
          canReceiveOrders={canReceiveOrders}
        />
      ))}
    </div>
  );
}

function OrderCard({
  order,
  canCancelOrders,
  canSubmitOrders,
  canReceiveOrders,
}: {
  order: OrderRow;
  canCancelOrders: boolean;
  canSubmitOrders: boolean;
  canReceiveOrders: boolean;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [recv, setRecv] = useState<Record<number, string>>({});

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setErro(r.message ?? 'Falha');
      else setConfirmCancel(false);
    });
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-lg text-bos-text">
              {order.supplierName ?? 'Sem fornecedor nomeado'}
            </h2>
            <span className="font-mono text-[11px] text-bos-muted">{order.externalRef}</span>
            <Badge tone={TOM[order.status]}>{ROTULO[order.status]}</Badge>
          </div>
          {order.description ? (
            <p className="mt-1 max-w-2xl text-sm text-bos-muted">{order.description}</p>
          ) : null}
          <p className="mt-2 text-sm text-bos-text">
            Total {money(order.totalCents, order.currency)} · {order.items.length} item(ns)
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canSubmitOrders && canSubmit(order.status) ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text hover:bg-bos-surface"
              onClick={() => run(() => submitOrder({ orderId: order.id }))}
            >
              Enviar
            </button>
          ) : null}

          {canCancelOrders && canCancel(order.status) ? (
            confirmCancel ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-bos-danger px-3 py-1.5 text-sm text-bos-danger"
                  onClick={() => run(() => cancelOrder({ orderId: order.id }))}
                >
                  Confirmar cancelamento
                </button>
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-sm text-bos-muted"
                  onClick={() => setConfirmCancel(false)}
                >
                  Desistir
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-muted hover:text-bos-danger"
                onClick={() => setConfirmCancel(true)}
              >
                Cancelar
              </button>
            )
          ) : null}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-bos-border border-t border-bos-border">
        {order.items.map((i) => (
          <li key={i.lineNo} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              <span className="text-bos-text">
                {i.lineNo}. {i.description}
              </span>
              <span className="ml-2 text-bos-muted">
                {i.quantity} × {money(i.unitAmountCents, order.currency)} ={' '}
                {money(i.lineTotalCents, order.currency)}
              </span>
              <span className="ml-2 text-bos-muted">
                recebido: {i.qtyReceived}
              </span>
            </div>
            {canReceiveOrders && canReceive(order.status) ? (
              <div className="flex items-center gap-2">
                <input
                  className="w-20 rounded-md border border-bos-border bg-bos-bg px-2 py-1 text-sm"
                  placeholder="qtd"
                  value={recv[i.lineNo] ?? ''}
                  onChange={(e) => setRecv((m) => ({ ...m, [i.lineNo]: e.target.value }))}
                />
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-bos-border px-2 py-1 text-xs"
                  onClick={() =>
                    run(() =>
                      receiveOrderLine({
                        orderId: order.id,
                        lineNo: i.lineNo,
                        qtyReceived: Number(recv[i.lineNo] ?? i.qtyReceived),
                      }),
                    )
                  }
                >
                  Receber
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {erro ? <p className="mt-3 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
