import { Suspense } from 'react';

import { PERMISSIONS, summarizeOrders } from '@alsham/ops';

import { getOpsPort, DataPortError } from '@/lib/data';
import {
  Badge,
  DemoNotice,
  EmptyState,
  ErrorState,
  PageHero,
  SectionHeader,
  TableSkeleton,
} from '@/components/states';
import { ContextBanner } from '@/components/context-banner';
import { WorkOrderForm } from '@/components/work-order-form';
import { FinishedOrders, PipelineBoard } from '@/components/pipeline-board';

export const dynamic = 'force-dynamic';

export default function EsteiraPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Esteira de produção" subtitle="Carregando o quadro…" />
      <TableSkeleton rows={4} />
    </>
  );
}

/**
 * O QUADRO da esteira — o rosto do Módulo 7.
 *
 * ⭐ **As colunas são as etapas do tenant**, não um quadro fixo do produto. Ver
 * `PipelineBoard`.
 *
 * ⚠️ O "hoje" é resolvido UMA vez, aqui, e desce por parâmetro — componente que
 * lê o relógio sozinho renderiza diferente no servidor e no cliente.
 */
async function Conteudo() {
  const port = await getOpsPort();

  try {
    const [permissions, esteiras, ordens] = await Promise.all([
      port.listPermissions(),
      port.loadPipelines(),
      port.loadOrders(),
    ]);

    const canManage = permissions.has(PERMISSIONS.orderManage);
    const canDecide = permissions.has(PERMISSIONS.orderDecide);
    const hoje = new Date().toISOString().slice(0, 10);
    const resumo = summarizeOrders(ordens, hoje);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <PageHero
          eyebrow="Esteira de Produção · operações"
          title="O trabalho anda à vista."
          accent="Pelas etapas que a sua empresa desenhou."
          subtitle="Cada ordem de serviço percorre a esteira do tenant — e todo movimento fica na trilha, inclusive o pulo, com razão."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.onTheLine > 0 ? 'info' : 'neutral'}>
                {resumo.onTheLine} na esteira
              </Badge>
              {resumo.overdue > 0 ? <Badge tone="danger">{resumo.overdue} vencida(s)</Badge> : null}
              <Badge tone="success">{resumo.done} concluída(s)</Badge>
              {canDecide ? null : <Badge tone="neutral">sem ops.order.decide</Badge>}
            </div>
          }
        />

        <ContextBanner banner="esteira" />

        <div className="mb-6">
          <WorkOrderForm pipelines={esteiras} canManage={canManage} />
        </div>

        {esteiras.length === 0 ? (
          <EmptyState
            title="Nenhuma esteira desenhada ainda"
            hint="Vá a Esteiras e desenhe a primeira. Nenhuma vem pronta de propósito — o processo é da sua empresa."
          />
        ) : (
          <div className="flex flex-col gap-8">
            {esteiras.map(({ pipeline, stages }) => (
              <PipelineBoard
                key={pipeline.id}
                pipelineName={pipeline.name}
                stages={stages}
                orders={ordens.filter((o) => o.pipelineId === pipeline.id)}
                today={hoje}
              />
            ))}
          </div>
        )}

        <FinishedOrders orders={ordens} />

        <p className="mt-6 max-w-3xl text-xs text-bos-muted">
          Abrir, avançar, pular, devolver, concluir e cancelar põem{' '}
          <code className="font-mono">ops.*</code> na caixa de saída do Core, na mesma transação — e
          cada um deixa uma linha na trilha da OS, que{' '}
          <strong className="text-bos-text">não se edita nem se apaga</strong>. Uma etapa pulada
          fica registrada com a razão: pular é ato, nunca omissão.
        </p>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Esteira de produção" />
        <ErrorState
          title="Não foi possível carregar o quadro"
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
