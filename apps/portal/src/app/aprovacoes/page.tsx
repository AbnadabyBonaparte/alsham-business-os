import { Suspense } from 'react';

import { PERMISSIONS } from '@alsham/finance-reconciliation';

import { getDataPort, DataPortError } from '@/lib/data';
import {
  Badge,
  DemoNotice,
  ErrorState,
  SectionHeader,
  TableSkeleton,
} from '@/components/states';
import { ApprovalQueue } from '@/components/approval-queue';

export const dynamic = 'force-dynamic';

export default function AprovacoesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Fila de aprovação" subtitle="Carregando a fila…" />
      <TableSkeleton rows={3} />
    </>
  );
}

/**
 * A fila que substitui a mesa do diretor.
 *
 * A permissão `recon.approval.decide` decide se os botões aparecem — cortesia
 * de interface. Quem **impede** de verdade é a policy `approval_update` em
 * `0002_recon.sql`, provada no CI: sem a permissão, o UPDATE afeta zero linhas
 * mesmo que alguém forje o clique.
 *
 * As duas camadas existem de propósito. Esconder o botão sem a policy seria
 * teatro; ter a policy sem esconder o botão seria frustração.
 */
async function Conteudo() {
  const port = getDataPort();

  try {
    const [permissions, items] = await Promise.all([
      port.listPermissions(),
      port.loadApprovalQueue(),
    ]);

    const canDecide = permissions.has(PERMISSIONS.approvalDecide);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          title="Fila de aprovação"
          subtitle="Cada item tem dono, valor, idade e trilha. Nada fica embaixo de outra pilha."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={items.length > 0 ? 'warning' : 'success'}>
                {items.length} aguardando visto
              </Badge>
              {canDecide ? null : (
                <Badge tone="neutral">somente leitura — sem recon.approval.decide</Badge>
              )}
            </div>
          }
        />

        <ApprovalQueue items={items} canDecide={canDecide} nowMs={Date.now()} />

        <p className="mt-6 max-w-2xl text-xs text-bos-muted">
          Toda decisão emite <code className="font-mono">recon.approval.decided</code> na caixa de
          saída do Core, na mesma transação — e o Core escreve a trilha em{' '}
          <code className="font-mono">core.audit_log</code>, que é append-only. Uma decisão não se
          apaga: corrige-se com outra.
        </p>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Fila de aprovação" />
        <ErrorState
          title="Não foi possível carregar a fila"
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
