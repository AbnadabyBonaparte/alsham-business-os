import { Suspense } from 'react';

import { PERMISSIONS, buildBalances, summarizeInventory } from '@alsham/inventory';

import { getInvPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { InventoryList } from '@/components/inventory-list';
import { ItemForm } from '@/components/item-form';
import { MovementForm } from '@/components/movement-form';

export const dynamic = 'force-dynamic';

export default function EstoquePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Estoque" subtitle="Carregando o livro…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getInvPort();
  try {
    const [permissions, items, movements] = await Promise.all([
      port.listPermissions(),
      port.loadItems(),
      port.loadMovements(),
    ]);

    const canManage = permissions.has(PERMISSIONS.itemManage);
    const canRegister = permissions.has(PERMISSIONS.movementRegister);
    const canAdjust = permissions.has(PERMISSIONS.movementAdjust);

    // O saldo vem do PACOTE, nunca de uma soma feita na tela.
    const balances = buildBalances(items, movements);
    const resumo = summarizeInventory(items, movements);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          eyebrow="Estoque · operações"
          title="Estoque"
          subtitle="O livro de movimentos imutável. O saldo é a soma do livro — corrigir é lançar ajuste com razão."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.active > 0 ? 'info' : 'neutral'}>{resumo.active} ativo(s)</Badge>
              <Badge tone="neutral">{resumo.movements} movimento(s)</Badge>
              {resumo.negative > 0 ? (
                <Badge tone="danger">{resumo.negative} saldo(s) negativo(s)</Badge>
              ) : null}
              {!canAdjust ? <Badge tone="neutral">sem inv.movement.adjust</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          <ItemForm canManage={canManage} />
          <MovementForm items={items} canRegister={canRegister} canAdjust={canAdjust} />
        </div>
        <InventoryList rows={balances} canManage={canManage} />
      </>
    );
  } catch (err) {
    const detail =
      err instanceof DataPortError
        ? err.message
        : 'Falha ao carregar o estoque. Se o schema inv não estiver exposto na Data API, a tela fica vazia sem erro claro.';
    return (
      <>
        <SectionHeader title="Estoque" subtitle="Não foi possível carregar." />
        <ErrorState title="Erro ao carregar" detail={detail} />
      </>
    );
  }
}
