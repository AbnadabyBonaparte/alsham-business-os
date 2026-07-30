import { Suspense } from 'react';

import { latePieces, PERMISSIONS, summarizePieces } from '@alsham/editorial';

import { getEdcalPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { EdcalDesign, EdcalPieceForm } from '@/components/edcal-forms';
import { EdcalBoard } from '@/components/edcal-board';

export const dynamic = 'force-dynamic';

export default function CalendarioPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Calendário Editorial" subtitle="Abrindo o calendário…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getEdcalPort();
  try {
    const [permissions, channels, stages, pieces] = await Promise.all([
      port.listPermissions(),
      port.loadChannels(),
      port.loadStages(),
      port.loadPieces(),
    ]);

    const canDesign = permissions.has(PERMISSIONS.design);
    const canManage = permissions.has(PERMISSIONS.manage);
    const canDecide = permissions.has(PERMISSIONS.decide);

    // ⭐ O resumo e o atraso são do PACOTE — o "hoje" vem da tela.
    const resumo = summarizePieces(pieces);
    const atrasadas = latePieces(pieces, new Date().toISOString().slice(0, 10));

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Calendário Editorial · a produção de conteúdo"
          title="O plano muda. O fato fica."
          accent="E a data real se carimba ao lado da planejada."
          subtitle="Canal e fluxo são desenho do tenant; a pauta reagenda livre enquanto é plano; registrar a publicação carimba a data real pelo servidor — e o fim, publicada ou descartada, é terminal: a pauta que revive é pauta nova."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.planned > 0 ? 'info' : 'neutral'}>{resumo.planned} no plano</Badge>
              {atrasadas.length > 0 ? <Badge tone="danger">{atrasadas.length} atrasada(s)</Badge> : null}
              <Badge tone="success">{resumo.published} no ar</Badge>
              {resumo.dropped > 0 ? <Badge tone="neutral">{resumo.dropped} descartada(s)</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <EdcalPieceForm channels={channels} stages={stages} /> : null}
          {canDesign ? <EdcalDesign channels={channels} stages={stages} /> : null}
        </div>
        <EdcalBoard
          pieces={pieces}
          channels={channels}
          stages={stages}
          canManage={canManage}
          canDecide={canDecide}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Calendário Editorial" subtitle="O calendário do tenant." />
        <ErrorState title="Não foi possível abrir o calendário." detail={detail} />
      </>
    );
  }
}
