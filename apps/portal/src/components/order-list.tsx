'use client';

import { useState, useTransition } from 'react';

import { canCancel, canSubmit, canReceive } from '@alsham/purchase-orders';
import type { OrderStatus } from '@alsham/purchase-orders';

import { cancelOrder, submitOrder, receiveOrderLine } from '@/app/po-actions';
import type { OrderRow } from '@/lib/data';
import { money } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

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

/**
 * A carteira de pedidos — agora TABELA DE VERDADE (Mandato de Beleza). Cada
 * pedido é uma LINHA de resumo: fornecedor, total, nº de itens e situação. As
 * linhas do pedido (com o receber por linha), enviar e cancelar vivem numa
 * LINHA EXPANSÍVEL.
 *
 * ⭐ **Enviar e receber são atos separados; cancelar é STATUS, nunca apagar**
 * (confirmação em dois passos). Quem autoriza cada ato é `@alsham/purchase-orders`.
 */
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
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Fornecedor</TH>
            <TH num>Total</TH>
            <TH num>Itens</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {rows.map((o) => (
            <OrderRowItem
              key={o.id}
              order={o}
              canCancelOrders={canCancelOrders}
              canSubmitOrders={canSubmitOrders}
              canReceiveOrders={canReceiveOrders}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function OrderRowItem({
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
  const [aberto, setAberto] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [recv, setRecv] = useState<Record<number, string>>({});

  const painelId = `po-${order.id}`;

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setErro(r.message ?? 'Falha');
      else setConfirmCancel(false);
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{order.supplierName ?? 'Sem fornecedor nomeado'}</span>
          <span className="mt-0.5 block font-mono text-[11px] text-bos-muted">{order.externalRef}</span>
        </TD>
        <TD num className="whitespace-nowrap text-bos-text">{money(order.totalCents, order.currency)}</TD>
        <TD num className="whitespace-nowrap text-bos-muted">{order.items.length}</TD>
        <TD className="whitespace-nowrap">
          <Badge tone={TOM[order.status]}>{ROTULO[order.status]}</Badge>
        </TD>
        <TD className="text-right">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={painelId}
            className="text-[11px] text-bos-muted transition-colors hover:text-bos-text"
          >
            {aberto ? 'fechar' : 'detalhes'}
          </button>
        </TD>
      </TR>

      {aberto ? (
        <TR>
          <TD colSpan={5} className="bg-bos-elevated/20">
            <div id={painelId} className="flex flex-col gap-3 px-1 py-1">
              {order.description ? <p className="max-w-2xl text-sm text-bos-muted">{order.description}</p> : null}

              <ul className="divide-y divide-bos-border/60 border-y border-bos-border">
                {order.items.map((i) => (
                  <li key={i.lineNo} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <span className="text-bos-text">{i.lineNo}. {i.description}</span>
                      <span className="ml-2 text-bos-muted">
                        {i.quantity} × {money(i.unitAmountCents, order.currency)} = {money(i.lineTotalCents, order.currency)}
                      </span>
                      <span className="ml-2 text-bos-muted">recebido: {i.qtyReceived}</span>
                    </div>
                    {canReceiveOrders && canReceive(order.status) ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="w-20 rounded-md border border-bos-border bg-bos-bg px-2 py-1 text-sm text-bos-text"
                          placeholder="qtd"
                          value={recv[i.lineNo] ?? ''}
                          onChange={(e) => setRecv((m) => ({ ...m, [i.lineNo]: e.target.value }))}
                        />
                        <button
                          type="button"
                          disabled={pending}
                          className="rounded-md border border-bos-border px-2 py-1 text-xs text-bos-text transition-colors hover:border-bos-accent"
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

              <div className="flex flex-wrap items-center gap-2">
                {canSubmitOrders && canSubmit(order.status) ? (
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => submitOrder({ orderId: order.id }))}>
                    Enviar
                  </button>
                ) : null}

                {canCancelOrders && canCancel(order.status) ? (
                  confirmCancel ? (
                    <>
                      <button type="button" disabled={pending} className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger transition-colors hover:bg-bos-danger hover:text-bos-bg" onClick={() => run(() => cancelOrder({ orderId: order.id }))}>
                        Confirmar cancelamento
                      </button>
                      <button type="button" className={botaoNeutro} onClick={() => setConfirmCancel(false)}>Desistir</button>
                    </>
                  ) : (
                    <button type="button" className={botaoNeutro} onClick={() => setConfirmCancel(true)}>Cancelar</button>
                  )
                ) : null}
              </div>

              {erro ? <p role="alert" className="text-sm text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text transition-colors hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted transition-colors hover:text-bos-text';
