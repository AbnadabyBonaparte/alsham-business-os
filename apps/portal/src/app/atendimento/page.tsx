import { Suspense } from 'react';

import { PERMISSIONS, summarizeTickets } from '@alsham/care';

import { getCarePort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { CareSetup, TicketForm } from '@/components/care-forms';
import { CareQueue } from '@/components/care-queue';

export const dynamic = 'force-dynamic';

export default function AtendimentoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Atendimento" subtitle="Carregando o balcão…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getCarePort();
  try {
    const [permissions, tickets, categories, priorities, interactions] = await Promise.all([
      port.listPermissions(),
      port.loadTickets(),
      port.loadCategories(),
      port.loadPriorities(),
      port.loadInteractions(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canResolvePerm = permissions.has(PERMISSIONS.resolve);
    const canSetup = permissions.has(PERMISSIONS.setup);

    const now = new Date().toISOString();
    // ⭐ O resumo é do PACOTE — a tela não conta nem compara data.
    const resumo = summarizeTickets(tickets, now);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          title="Atendimento"
          subtitle="O caso que volta é o mesmo caso; o fechado é o fim. A conversa é eterna."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{resumo.openish} vivo(s)</Badge>
              <Badge tone={resumo.overdue > 0 ? 'danger' : 'success'}>
                {resumo.overdue} atrasado(s)
              </Badge>
              {!canResolvePerm ? <Badge tone="neutral">sem care.ticket.resolve</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <TicketForm categories={categories} priorities={priorities} /> : null}
          <CareSetup categories={categories} priorities={priorities} canSetup={canSetup} />
        </div>
        <CareQueue
          tickets={tickets}
          categories={categories}
          priorities={priorities}
          interactions={interactions}
          now={now}
          canManage={canManage}
          canResolvePerm={canResolvePerm}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Atendimento" subtitle="O balcão do tenant." />
        <ErrorState title="Não foi possível carregar o balcão." detail={detail} />
      </>
    );
  }
}
