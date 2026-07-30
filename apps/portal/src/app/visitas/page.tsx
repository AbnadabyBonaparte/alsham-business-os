import { Suspense } from 'react';

import { PERMISSIONS, summarizeVisits } from '@alsham/visits';

import { getVisPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { VisForm } from '@/components/vis-forms';
import { VisGate } from '@/components/vis-gate';

export const dynamic = 'force-dynamic';

export default function VisitasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Visitas" subtitle="Abrindo o livro da portaria…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getVisPort();
  try {
    const [permissions, visits] = await Promise.all([
      port.listPermissions(),
      port.loadVisits(),
    ]);

    const canRegister = permissions.has(PERMISSIONS.register);
    const canSchedule = permissions.has(PERMISSIONS.schedule);

    // ⭐ O resumo é do PACOTE.
    const resumo = summarizeVisits(visits);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Visitas · operações"
          title="O livro da portaria não se rasura."
          accent="Quem volta amanhã é visita nova."
          subtitle="Entrada e saída carimbadas pelo servidor; corrigir é registrar de novo, apontando o errado. O documento fica aqui — ele não passeia pelo correio."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.inside > 0 ? 'info' : 'neutral'}>{resumo.inside} no pátio</Badge>
              <Badge tone="neutral">{resumo.scheduled} agendada(s)</Badge>
              {!canRegister ? <Badge tone="neutral">sem vis.visit.register</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canRegister || canSchedule ? (
            <VisForm canRegister={canRegister} canSchedule={canSchedule} />
          ) : null}
        </div>
        <VisGate visits={visits} canRegister={canRegister} canSchedule={canSchedule} />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Visitas" subtitle="O livro da portaria do tenant." />
        <ErrorState title="Não foi possível abrir o livro." detail={detail} />
      </>
    );
  }
}
