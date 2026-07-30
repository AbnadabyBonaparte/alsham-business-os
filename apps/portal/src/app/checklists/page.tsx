import { Suspense } from 'react';

import { PERMISSIONS, summarizeRuns } from '@alsham/checklists';

import { getChkPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { ChkSetup, ChkStartForm } from '@/components/chk-forms';
import { ChkBoard } from '@/components/chk-board';

export const dynamic = 'force-dynamic';

export default function ChecklistsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Checklists" subtitle="Abrindo o livro…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getChkPort();
  try {
    const [permissions, templates, templateItems, runs, runItems] = await Promise.all([
      port.listPermissions(),
      port.loadTemplates(),
      port.loadTemplateItems(),
      port.loadRuns(),
      port.loadRunItems(),
    ]);

    const canExecute = permissions.has(PERMISSIONS.execute);
    const canSetup = permissions.has(PERMISSIONS.setup);

    // ⭐ O resumo é do PACOTE.
    const resumo = summarizeRuns(runs);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Checklists · operações"
          title="A prancheta congela na abertura."
          accent="E a resposta dada não se rasura."
          subtitle="O modelo é desenho seu; a execução é documento. Cada resposta é ato carimbado — e concluir exige tudo respondido: checklist pela metade é decoração."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.running > 0 ? 'info' : 'neutral'}>{resumo.running} em execução</Badge>
              <Badge tone="neutral">{resumo.completed} concluída(s)</Badge>
              {!canExecute ? <Badge tone="neutral">sem chk.run.execute</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canExecute ? <ChkStartForm templates={templates} items={templateItems} /> : null}
          <ChkSetup templates={templates} items={templateItems} canSetup={canSetup} />
        </div>
        <ChkBoard runs={runs} items={runItems} canExecute={canExecute} />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Checklists" subtitle="O livro de inspeções do tenant." />
        <ErrorState title="Não foi possível abrir o livro." detail={detail} />
      </>
    );
  }
}
