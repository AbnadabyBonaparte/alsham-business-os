import { Suspense } from 'react';

import { PERMISSIONS } from '@alsham/investments';

import { getInvestPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { InvestHoldingForm } from '@/components/invest-forms';
import { InvestBoard } from '@/components/invest-board';

export const dynamic = 'force-dynamic';

export default function InvestimentosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Investimentos" subtitle="Abrindo as posições…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getInvestPort();
  try {
    const [permissions, holdings, positions] = await Promise.all([
      port.listPermissions(),
      port.loadHoldings(),
      port.loadPositions(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manageHolding);
    const canRegister = permissions.has(PERMISSIONS.registerMovement);

    const ativos = holdings.filter((h) => h.status === 'active').length;
    const total = positions.reduce((n, p) => n + p.positionCents, 0);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Investimentos · o Bloco Financeiro"
          title="A posição é o que está no papel — não o que o mercado promete."
          accent="A soma dos atos; sem cotação inventada."
          subtitle="O investimento é seu e volta do arquivo; o livro de atos (aplicação, rendimento, resgate) é imutável; a posição é a soma dos atos, nunca marcação a mercado; e não se resgata mais do que está lá."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ativos > 0 ? 'success' : 'neutral'}>{ativos} ativo(s)</Badge>
              {total > 0 ? <Badge tone="info">posição total {(total / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">{canManage ? <InvestHoldingForm /> : null}</div>
        <InvestBoard holdings={holdings} positions={positions} canManage={canManage} canRegister={canRegister} />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Investimentos" subtitle="Os investimentos do tenant." />
        <ErrorState title="Não foi possível abrir os investimentos." detail={detail} />
      </>
    );
  }
}
