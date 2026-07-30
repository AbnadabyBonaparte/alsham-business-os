import { Suspense } from 'react';

import { PERMISSIONS, summarizeOccurrences } from '@alsham/occurrences';

import { getOccPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { OccForm, SeveritySetup } from '@/components/occ-forms';
import { OccBook } from '@/components/occ-book';

export const dynamic = 'force-dynamic';

export default function OcorrenciasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Ocorrências" subtitle="Carregando o livro…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getOccPort();
  try {
    const [permissions, occurrences, severities, treatments] = await Promise.all([
      port.listPermissions(),
      port.loadOccurrences(),
      port.loadSeverities(),
      port.loadTreatments(),
    ]);

    const canRegister = permissions.has(PERMISSIONS.register);
    const canTreatPerm = permissions.has(PERMISSIONS.treat);
    const canClosePerm = permissions.has(PERMISSIONS.close);
    const canSetup = permissions.has(PERMISSIONS.setup);

    // ⭐ O resumo é do PACOTE — a tela não conta nada.
    const resumo = summarizeOccurrences(occurrences);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          title="Ocorrências"
          subtitle="O livro do que aconteceu: registro imutável, tratativa eterna, desfecho escrito."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.open > 0 ? 'warning' : 'success'}>{resumo.open} aberta(s)</Badge>
              <Badge tone="neutral">{resumo.closed} encerrada(s)</Badge>
              {!canClosePerm ? <Badge tone="neutral">sem occ.occurrence.close</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canRegister ? <OccForm severities={severities} /> : null}
          <SeveritySetup severities={severities} canSetup={canSetup} />
        </div>
        <OccBook
          occurrences={occurrences}
          severities={severities}
          treatments={treatments}
          canTreatPerm={canTreatPerm}
          canClosePerm={canClosePerm}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Ocorrências" subtitle="O livro do que aconteceu." />
        <ErrorState title="Não foi possível carregar o livro." detail={detail} />
      </>
    );
  }
}
