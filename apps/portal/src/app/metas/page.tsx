import { Suspense } from 'react';

import { PERMISSIONS, summarizeGoals } from '@alsham/goals';

import { getGoalPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { GoalForm } from '@/components/goal-forms';
import { GoalBoard } from '@/components/goal-board';

export const dynamic = 'force-dynamic';

export default function MetasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Metas" subtitle="Abrindo o placar…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getGoalPort();
  try {
    const [permissions, goals, checkins] = await Promise.all([
      port.listPermissions(),
      port.loadGoals(),
      port.loadCheckins(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canReportPerm = permissions.has(PERMISSIONS.report);
    const canDecide = permissions.has(PERMISSIONS.decide);

    // ⭐ O resumo é do PACOTE.
    const resumo = summarizeGoals(goals);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Metas · leitura do negócio"
          title="O alvo informa. Você decide."
          accent="E o placar é o último número na mesa."
          subtitle="A trave congela na ativação; o andamento é um livro de check-ins que não se rasura; bater ou perder é decisão de gente — fechada com número na mesa, nunca por achismo."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.active > 0 ? 'info' : 'neutral'}>{resumo.active} correndo</Badge>
              <Badge tone="success">{resumo.achieved} batida(s)</Badge>
              {resumo.missed > 0 ? <Badge tone="danger">{resumo.missed} perdida(s)</Badge> : null}
              {!canDecide ? <Badge tone="neutral">sem goal.goal.decide</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <GoalForm /> : null}
        </div>
        <GoalBoard
          goals={goals}
          checkins={checkins}
          canManage={canManage}
          canReportPerm={canReportPerm}
          canDecide={canDecide}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Metas" subtitle="O placar do tenant." />
        <ErrorState title="Não foi possível abrir o placar." detail={detail} />
      </>
    );
  }
}
