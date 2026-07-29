import { Suspense } from 'react';

import { PERMISSIONS, orderedStages } from '@alsham/ops';

import { getOpsPort, DataPortError } from '@/lib/data';
import {
  Badge,
  DemoNotice,
  EmptyState,
  ErrorState,
  Panel,
  SectionHeader,
  TableSkeleton,
} from '@/components/states';
import { PipelineDesigner } from '@/components/pipeline-designer';

export const dynamic = 'force-dynamic';

export default function EsteirasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Esteiras" subtitle="Carregando as esteiras…" />
      <TableSkeleton rows={3} />
    </>
  );
}

/**
 * ⭐ **A tela do DESENHO — onde a Lei das Etapas é visível.**
 *
 * Não há esteira padrão nem sugestão de etapas: a lista nasce vazia e o
 * primeiro desenho é do cliente. Semear uma esteira "de marketing" faria o
 * produto chegar já opinando sobre o processo de quem o comprou.
 */
async function Conteudo() {
  const port = await getOpsPort();

  try {
    const [permissions, esteiras] = await Promise.all([
      port.listPermissions(),
      port.loadPipelines(),
    ]);

    const canDesign = permissions.has(PERMISSIONS.pipelineDesign);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          eyebrow="Esteira de Produção · operações"
          title="Esteiras"
          subtitle="O desenho do trabalho na sua empresa. As etapas são suas — nome, ordem e regras."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={esteiras.length > 0 ? 'info' : 'neutral'}>
                {esteiras.length} esteira(s)
              </Badge>
              {canDesign ? null : <Badge tone="neutral">sem ops.pipeline.design</Badge>}
            </div>
          }
        />

        <div className="mb-6">
          <PipelineDesigner canDesign={canDesign} />
        </div>

        {esteiras.length === 0 ? (
          <EmptyState
            title="Nenhuma esteira desenhada ainda"
            hint="Desenhe a primeira acima. Não semeamos nenhuma de propósito: o processo é da sua empresa, e sugerir um seria opinar sobre como você trabalha."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {esteiras.map(({ pipeline, stages }) => (
              <Panel key={pipeline.id} className="px-6 py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="font-display text-lg text-bos-text">{pipeline.name}</h2>
                  <Badge tone="neutral">{stages.length} etapa(s)</Badge>
                </div>
                {pipeline.description ? (
                  <p className="mt-1 max-w-2xl text-sm text-bos-muted">{pipeline.description}</p>
                ) : null}

                <ol className="mt-4 flex flex-wrap items-center gap-2">
                  {orderedStages(stages).map((etapa, idx) => (
                    <li key={etapa.id} className="flex items-center gap-2">
                      {idx > 0 ? <span className="text-bos-muted">→</span> : null}
                      <span className="rounded-md border border-bos-border bg-bos-bg px-3 py-1.5 text-sm text-bos-text">
                        {etapa.name}
                        {etapa.requiresApproval ? (
                          <span className="ml-2 text-[11px] text-bos-accent">aprovação</span>
                        ) : null}
                        {etapa.skippable ? (
                          <span className="ml-2 text-[11px] text-bos-muted">pulável</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>

                {stages.length === 0 ? (
                  <p className="mt-3 text-xs text-bos-warning">
                    Esta esteira não tem etapas e ainda não aceita ordens de serviço.
                  </p>
                ) : null}
              </Panel>
            ))}
          </div>
        )}

        <p className="mt-6 max-w-3xl text-xs text-bos-muted">
          As etapas são <strong className="text-bos-text">dado da sua empresa</strong>, não uma
          lista fixa do produto — por isso uma agência desenha{' '}
          <em>abertura → briefing → criação → revisão → aprovação → veiculação</em> e uma equipe de
          manutenção desenha <em>chamado → vistoria → execução</em>, no mesmo sistema. Passar de uma
          etapa marcada como <em>aprovação</em> exige a permissão{' '}
          <code className="font-mono">ops.order.decide</code>; pular uma etapa{' '}
          <em>pulável</em> exige a mesma permissão e a razão — que fica na trilha.
        </p>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Esteiras" />
        <ErrorState
          title="Não foi possível carregar as esteiras"
          detail={
            err instanceof DataPortError
              ? err.message
              : 'Erro inesperado ao falar com a fonte de dados.'
          }
        />
      </>
    );
  }
}
