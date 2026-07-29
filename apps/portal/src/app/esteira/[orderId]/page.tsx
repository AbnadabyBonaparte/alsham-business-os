import { Suspense } from 'react';
import Link from 'next/link';

import { PERMISSIONS, isOverdue, orderedStages } from '@alsham/ops';

import { getOpsPort, DataPortError } from '@/lib/data';
import {
  Badge,
  DemoNotice,
  ErrorState,
  Panel,
  SectionHeader,
  TableSkeleton,
} from '@/components/states';
import { WorkOrderDetail } from '@/components/work-order-detail';
import { ForgePanel } from '@/components/forge-panel';
import { readForgeState } from '@/app/forge-actions';
import { shortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ROTULO_STATUS = {
  open: 'aberta',
  in_progress: 'em andamento',
  done: 'concluída',
  cancelled: 'cancelada',
} as const;

const TOM_STATUS = {
  open: 'info',
  in_progress: 'warning',
  done: 'success',
  cancelled: 'neutral',
} as const;

export default async function OrdemPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo orderId={orderId} />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Ordem de serviço" subtitle="Carregando…" />
      <TableSkeleton rows={5} />
    </>
  );
}

/**
 * O INTERIOR DA OS.
 *
 * ⚠️ O `orderId` vem da URL — e é o único dado que vem de lá. O `tenant_id`
 * continua sendo resolvido da sessão, dentro da porta; a RLS não deixaria uma
 * OS de outro tenant aparecer nem que o id fosse adivinhado.
 */
async function Conteudo({ orderId }: { orderId: string }) {
  const port = await getOpsPort();

  try {
    const [permissions, ordens, esteiras, detalhe, estadoTexto, estadoImagem] = await Promise.all([
      port.listPermissions(),
      port.loadOrders(),
      port.loadPipelines(),
      port.loadOrderDetail(orderId),
      // ⭐ O estado da forja é lido no SERVIDOR, uma vez, e desce por
      // parâmetro. O componente não pergunta ao motor — ele desenha o que já
      // foi decidido.
      readForgeState('text'),
      readForgeState('image'),
    ]);

    const os = ordens.find((o) => o.id === orderId);

    if (os === undefined) {
      return (
        <>
          <SectionHeader title="Ordem de serviço" />
          <ErrorState
            title="Esta OS não existe, ou não é do seu tenant"
            detail="Volte ao quadro e escolha uma ordem de serviço da lista."
          />
        </>
      );
    }

    const esteira = esteiras.find((e) => e.pipeline.id === os.pipelineId);
    const etapas = orderedStages(esteira?.stages ?? []);
    const hoje = new Date().toISOString().slice(0, 10);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <div className="mb-4">
          <Link href="/esteira" className="text-xs text-bos-muted transition-colors hover:text-bos-text">
            ← voltar ao quadro
          </Link>
        </div>

        <SectionHeader
          eyebrow="Esteira de Produção · ordem de serviço"
          title={os.title}
          subtitle={esteira ? `Esteira: ${esteira.pipeline.name}` : undefined}
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TOM_STATUS[os.status]}>{ROTULO_STATUS[os.status]}</Badge>
              {isOverdue(os, hoje) ? <Badge tone="danger">vencida</Badge> : null}
              {os.dueDate ? (
                <Badge tone="neutral">vence {shortDate(os.dueDate)}</Badge>
              ) : (
                <Badge tone="neutral">sem prazo</Badge>
              )}
            </div>
          }
        />

        {os.description ? (
          <Panel className="mb-6 px-6 py-5">
            <h2 className="font-display text-sm text-bos-text">Descrição do trabalho</h2>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-bos-muted">
              {os.description}
            </p>
          </Panel>
        ) : null}

        {/* ⭐ A Etapa 14 encaixando na 13: o motor só existe DENTRO de uma OS
            que está numa etapa, e o resultado dele é uma versão de entregável
            como qualquer outra. */}
        {os.status === 'open' || os.status === 'in_progress' ? (
          <div className="mb-6">
            <ForgePanel
              orderId={os.id}
              estadoTexto={estadoTexto}
              estadoImagem={estadoImagem}
              canManage={permissions.has(PERMISSIONS.orderManage)}
            />
          </div>
        ) : null}

        <WorkOrderDetail
          order={os}
          stages={etapas}
          movements={detalhe.movements}
          deliverables={detalhe.deliverables}
          canManage={permissions.has(PERMISSIONS.orderManage)}
          canDecide={permissions.has(PERMISSIONS.orderDecide)}
        />
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Ordem de serviço" />
        <ErrorState
          title="Não foi possível carregar a ordem de serviço"
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
