import { Suspense } from 'react';

import { PERMISSIONS, summarizeEvents } from '@alsham/event-management';

import { getEvtPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { EventList } from '@/components/event-list';
import { EventForm } from '@/components/event-form';

export const dynamic = 'force-dynamic';

export default function EventosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Eventos" subtitle="Carregando a agenda…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getEvtPort();
  try {
    const [permissions, events, registrations] = await Promise.all([
      port.listPermissions(),
      port.loadEvents(),
      port.loadRegistrations(),
    ]);

    const canManage = permissions.has(PERMISSIONS.eventManage);
    const canDecide = permissions.has(PERMISSIONS.eventDecide);
    const canManageRegistrations = permissions.has(PERMISSIONS.registrationManage);

    const now = new Date().toISOString();
    // O resumo vem do PACOTE — a tela não conta nada.
    const resumo = summarizeEvents(events, registrations, now);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          eyebrow="Eventos · marketing"
          title="Eventos"
          subtitle="O evento universal: publique para abrir a lista, registre presença como ato. Ingresso e QR são o ofício do vertical — não estão aqui."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.upcoming > 0 ? 'info' : 'neutral'}>
                {resumo.upcoming} por vir
              </Badge>
              <Badge tone="neutral">{resumo.activeRegistrations} inscrição(ões)</Badge>
              <Badge tone={resumo.attended > 0 ? 'success' : 'neutral'}>
                {resumo.attended} presença(s)
              </Badge>
              {!canDecide ? <Badge tone="neutral">sem evt.event.decide</Badge> : null}
            </div>
          }
        />
        <div className="mb-6">
          <EventForm canManage={canManage} />
        </div>
        <EventList
          events={events}
          registrations={registrations}
          now={now}
          canDecide={canDecide}
          canManageRegistrations={canManageRegistrations}
        />
      </>
    );
  } catch (err) {
    const detail =
      err instanceof DataPortError
        ? err.message
        : 'Falha ao carregar a agenda. Se o schema evt não estiver exposto na Data API, a tela fica vazia sem erro claro.';
    return (
      <>
        <SectionHeader title="Eventos" subtitle="Não foi possível carregar." />
        <ErrorState title="Erro ao carregar" detail={detail} />
      </>
    );
  }
}
