import { Suspense } from 'react';

import { PERMISSIONS, summarizeOrders } from '@alsham/maintenance';

import { getMntPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { ContextBanner } from '@/components/context-banner';
import { MntOrderForm, MntSetup } from '@/components/mnt-forms';
import { MntBoard, PreventiveQueue } from '@/components/mnt-board';

export const dynamic = 'force-dynamic';

export default function ManutencaoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Manutenção" subtitle="Carregando o quadro…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getMntPort();
  try {
    const [permissions, orders, priorities] = await Promise.all([
      port.listPermissions(),
      port.loadOrders(),
      port.loadPriorities(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canCompletePerm = permissions.has(PERMISSIONS.complete);
    const canSetup = permissions.has(PERMISSIONS.setup);

    const today = new Date().toISOString().slice(0, 10);
    // ⭐ O resumo e a fila da preventiva são do PACOTE.
    const resumo = summarizeOrders(orders, today);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          title="Manutenção"
          subtitle="Corretiva responde à falha; preventiva antecipa. Concluir exige o relato — e o serviço reprovado volta."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{resumo.openish} viva(s)</Badge>
              <Badge tone={resumo.preventiveDue > 0 ? 'danger' : 'success'}>
                {resumo.preventiveDue} preventiva(s) devida(s)
              </Badge>
              {!canCompletePerm ? <Badge tone="neutral">sem mnt.order.complete</Badge> : null}
            </div>
          }
        />
        <ContextBanner banner="manutencao" />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <MntOrderForm priorities={priorities} /> : null}
          <PreventiveQueue orders={orders} today={today} />
          <MntSetup priorities={priorities} canSetup={canSetup} />
        </div>
        <MntBoard
          orders={orders}
          priorities={priorities}
          canManage={canManage}
          canCompletePerm={canCompletePerm}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Manutenção" subtitle="O quadro do tenant." />
        <ErrorState title="Não foi possível carregar o quadro." detail={detail} />
      </>
    );
  }
}
