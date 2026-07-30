import { Suspense } from 'react';

import { PERMISSIONS, summarizeReservations } from '@alsham/spaces';

import { getSpcPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { SpcBookForm, SpcSetup } from '@/components/spc-forms';
import { SpcAgenda } from '@/components/spc-agenda';

export const dynamic = 'force-dynamic';

export default function EspacosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Espaços" subtitle="Abrindo a agenda…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getSpcPort();
  try {
    const [permissions, spaces, reservations] = await Promise.all([
      port.listPermissions(),
      port.loadSpaces(),
      port.loadReservations(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canSetup = permissions.has(PERMISSIONS.setup);

    // ⭐ O resumo é do PACOTE — o relógio entra por parâmetro.
    const resumo = summarizeReservations(reservations, new Date().toISOString());

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Reserva de Espaços · operações"
          title="Um espaço, um uso por vez."
          accent="Quem garante é o banco, não a sorte."
          subtitle="O conflito é recusado por constraint — o if da tela perde a corrida; a constraint não perde nunca. A cancelada libera o período sozinha, e o passado entra: fato consumado."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.upcoming > 0 ? 'info' : 'neutral'}>{resumo.upcoming} por vir</Badge>
              <Badge tone="neutral">{resumo.booked} reservada(s)</Badge>
              {!canManage ? <Badge tone="neutral">sem spc.reservation.manage</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <SpcBookForm spaces={spaces} /> : null}
          <SpcSetup spaces={spaces} canSetup={canSetup} />
        </div>
        <SpcAgenda reservations={reservations} spaces={spaces} canManage={canManage} />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Espaços" subtitle="A agenda de espaços do tenant." />
        <ErrorState title="Não foi possível abrir a agenda." detail={detail} />
      </>
    );
  }
}
