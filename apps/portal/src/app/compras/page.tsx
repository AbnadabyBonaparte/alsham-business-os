import { Suspense } from 'react';

import { PERMISSIONS, sumItems } from '@alsham/purchase-orders';

import { getPoPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { OrderList } from '@/components/order-list';
import { OrderForm } from '@/components/order-form';

export const dynamic = 'force-dynamic';

export default function ComprasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Compras" subtitle="Carregando os pedidos…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getPoPort();

  try {
    const [permissions, orders] = await Promise.all([
      port.listPermissions(),
      port.loadOrders(),
    ]);

    const canManage = permissions.has(PERMISSIONS.orderManage);
    const canCancelOrders = permissions.has(PERMISSIONS.orderCancel);
    const canReceiveOrders = permissions.has(PERMISSIONS.orderReceive);

    const abertos = orders.filter(
      (o) => o.status === 'draft' || o.status === 'submitted' || o.status === 'partially_received',
    );
    const porMoeda = new Map<string, number>();
    for (const o of abertos) {
      porMoeda.set(o.currency, (porMoeda.get(o.currency) ?? 0) + (o.totalCents || sumItems(o.items)));
    }

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          title="Compras"
          subtitle="Pedidos de compra com itens em texto livre. Enviar e receber são atos separados."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={abertos.length > 0 ? 'info' : 'neutral'}>
                {abertos.length} em curso
              </Badge>
              {[...porMoeda.entries()].map(([moeda, cents]) => (
                <Badge key={moeda} tone="neutral">
                  {(cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: moeda })}
                </Badge>
              ))}
              {!canReceiveOrders ? <Badge tone="neutral">sem po.order.receive</Badge> : null}
            </div>
          }
        />

        <div className="mb-6">
          <OrderForm canManage={canManage} />
        </div>

        <OrderList
          rows={orders}
          canCancelOrders={canCancelOrders}
          canSubmitOrders={canManage}
          canReceiveOrders={canReceiveOrders}
        />
      </>
    );
  } catch (err) {
    const detail =
      err instanceof DataPortError
        ? err.message
        : 'Falha ao carregar pedidos. Se o schema po não estiver exposto na Data API, a tela fica vazia sem erro claro.';
    return (
      <>
        <SectionHeader title="Compras" subtitle="Não foi possível carregar." />
        <ErrorState title="Erro ao carregar" detail={detail} />
      </>
    );
  }
}
