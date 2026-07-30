import { Suspense } from 'react';

import { PERMISSIONS, summarizeNotices } from '@alsham/comms';

import { getCommPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { CommForm } from '@/components/comm-forms';
import { CommBoard } from '@/components/comm-board';

export const dynamic = 'force-dynamic';

export default function ComunicadosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Comunicados" subtitle="Abrindo o mural…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getCommPort();
  try {
    const [permissions, notices, acks, userId] = await Promise.all([
      port.listPermissions(),
      port.loadNotices(),
      port.loadAcks(),
      port.currentUserId(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canAckPerm = permissions.has(PERMISSIONS.ack);

    // ⭐ O resumo é do PACOTE.
    const resumo = summarizeNotices(notices);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Comunicados · o mural do tenant"
          title="A palavra dada não se edita."
          accent="E o que foi lido, foi lido."
          subtitle="Publicar congela título, corpo e audiência; corrigir é publicar comunicado novo apontando o antigo; a ciência é ato próprio, único e eterno — a cobertura conta quem leu enquanto a palavra esteve de pé."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.onBoard > 0 ? 'info' : 'neutral'}>{resumo.onBoard} no mural</Badge>
              {resumo.drafts > 0 ? <Badge tone="warning">{resumo.drafts} rascunho(s)</Badge> : null}
              {resumo.archived > 0 ? <Badge tone="neutral">{resumo.archived} no arquivo</Badge> : null}
              {!canManage ? <Badge tone="neutral">sem comm.notice.manage</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <CommForm /> : null}
        </div>
        <CommBoard
          notices={notices}
          acks={acks}
          userId={userId}
          canManage={canManage}
          canAckPerm={canAckPerm}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Comunicados" subtitle="O mural do tenant." />
        <ErrorState title="Não foi possível abrir o mural." detail={detail} />
      </>
    );
  }
}
