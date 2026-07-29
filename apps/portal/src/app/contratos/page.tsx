import { Suspense } from 'react';

import { PERMISSIONS, buildExpiryQueue, summarizeContracts } from '@alsham/contracts';
import type { Renewal } from '@alsham/contracts';

import { getCtrPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { ContractForm } from '@/components/contract-form';
import { ContractList } from '@/components/contract-list';

export const dynamic = 'force-dynamic';

export default function ContratosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Contratos" subtitle="Carregando a carteira…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getCtrPort();
  try {
    const [permissions, contracts, adjustments, renewals] = await Promise.all([
      port.listPermissions(),
      port.loadContracts(),
      port.loadAdjustments(),
      port.loadRenewals(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canAmend = permissions.has(PERMISSIONS.amend);
    const canDecide = permissions.has(PERMISSIONS.decide);

    const today = new Date().toISOString().slice(0, 10);

    // ⭐ Resumo e fila de vencimento vêm do PACOTE — a tela não conta nada.
    const resumo = summarizeContracts(contracts);
    const porContrato = new Map<string, readonly Renewal[]>();
    for (const c of contracts) {
      porContrato.set(
        c.externalRef,
        renewals.filter((r) => r.contractId === c.id),
      );
    }
    const vencendo = buildExpiryQueue(contracts, porContrato, today, 30);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          title="Contratos"
          subtitle="Termos originais congelam em vigor: valor muda por reajuste, prazo por renovação — e o vigente é calculado dos atos."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{resumo.active} em vigor</Badge>
              <Badge tone={vencendo.length > 0 ? 'warning' : 'success'}>
                {vencendo.length} vencendo em 30 dias
              </Badge>
              {!canDecide ? <Badge tone="neutral">sem ctr.contract.decide</Badge> : null}
            </div>
          }
        />
        {canManage ? (
          <div className="mb-6">
            <ContractForm />
          </div>
        ) : null}
        <ContractList
          contracts={contracts}
          adjustments={adjustments}
          renewals={renewals}
          today={today}
          canManage={canManage}
          canAmend={canAmend}
          canDecide={canDecide}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Contratos" subtitle="A carteira do tenant." />
        <ErrorState title="Não foi possível carregar os contratos." detail={detail} />
      </>
    );
  }
}
