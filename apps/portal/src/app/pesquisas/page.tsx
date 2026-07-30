import { Suspense } from 'react';

import { PERMISSIONS, summarizeSurveys } from '@alsham/nps';

import { getNpsPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { NpsSurveyForm } from '@/components/nps-forms';
import { NpsBoard } from '@/components/nps-board';

export const dynamic = 'force-dynamic';

export default function PesquisasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Pesquisas" subtitle="Abrindo o quadro…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getNpsPort();
  try {
    const [permissions, surveys, responses] = await Promise.all([
      port.listPermissions(),
      port.loadSurveys(),
      port.loadResponses(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canRecord = permissions.has(PERMISSIONS.record);

    // ⭐ O resumo é do PACOTE.
    const resumo = summarizeSurveys(surveys, responses);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Pesquisas · a voz do cliente"
          title="A régua é do método. A pergunta é sua."
          accent="E o placar se calcula do livro — nunca se guarda."
          subtitle="Cada rodada abre, colhe e encerra: abrir congela a pergunta; a resposta é ato que não se rasura; o placar (%promotores − %detratores) sai do livro — e a rodada fechada não reabre, porque misturar medições mentiria as duas."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.open > 0 ? 'info' : 'neutral'}>{resumo.open} colhendo</Badge>
              {resumo.drafts > 0 ? <Badge tone="warning">{resumo.drafts} rascunho(s)</Badge> : null}
              <Badge tone="success">{resumo.responses} voz(es) no livro</Badge>
              {!canManage ? <Badge tone="neutral">sem nps.survey.manage</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <NpsSurveyForm /> : null}
        </div>
        <NpsBoard
          surveys={surveys}
          responses={responses}
          canManage={canManage}
          canRecord={canRecord}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Pesquisas" subtitle="A voz do cliente, medida." />
        <ErrorState title="Não foi possível abrir o quadro." detail={detail} />
      </>
    );
  }
}
