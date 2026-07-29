import { Suspense } from 'react';

import { PERMISSIONS, activeFunnels, summarizeFunnel } from '@alsham/deals';

import { getDealPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, EmptyState, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { FunnelBoard } from '@/components/funnel-board';
import { FunnelForm, OpportunityForm } from '@/components/funnel-forms';

export const dynamic = 'force-dynamic';

export default function FunilPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Funil" subtitle="Carregando o mapa…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getDealPort();
  try {
    const [permissions, funnels, opportunities] = await Promise.all([
      port.listPermissions(),
      port.loadFunnels(),
      port.loadOpportunities(),
    ]);

    const canDesign = permissions.has(PERMISSIONS.funnelDesign);
    const canManage = permissions.has(PERMISSIONS.opportunityManage);
    const canDecide = permissions.has(PERMISSIONS.opportunityDecide);

    // Resumo e recorte vêm do PACOTE — a tela não conta nem pondera nada.
    const resumo = summarizeFunnel(opportunities);
    const ativos = activeFunnels(funnels.map((f) => f.funnel));
    const today = new Date().toISOString().slice(0, 10);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          eyebrow="Funil Comercial · CRM"
          title="Funil"
          subtitle="Os estágios são seus. O movimento é livre — e cada movimento vira trilha. Perder exige a razão."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.open > 0 ? 'info' : 'neutral'}>{resumo.open} aberta(s)</Badge>
              <Badge tone={resumo.won > 0 ? 'success' : 'neutral'}>{resumo.won} ganha(s)</Badge>
              <Badge tone="neutral">{resumo.lost} perdida(s)</Badge>
              {[...resumo.weightedCentsByCurrency.entries()].map(([moeda, cents]) => (
                <Badge key={moeda} tone="neutral">
                  ponderado{' '}
                  {(cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: moeda })}
                </Badge>
              ))}
              {!canDecide ? <Badge tone="neutral">sem deal.opportunity.decide</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-wrap gap-3">
          <FunnelForm canDesign={canDesign} />
          <OpportunityForm funnels={funnels} canManage={canManage} />
        </div>

        {ativos.length === 0 ? (
          <EmptyState
            title="Nenhum funil desenhado"
            hint="Desenhe o primeiro acima. Nenhum funil vem de fábrica — semear um seria escolher o seu processo por você."
          />
        ) : (
          ativos.map((funil) => {
            const comEstagios = funnels.find((f) => f.funnel.id === funil.id);
            const doFunil = opportunities.filter((o) => o.funnelId === funil.id);
            return (
              <section key={funil.id} className="mb-8">
                <h2 className="mb-3 font-display text-lg text-bos-text">{funil.name}</h2>
                <FunnelBoard
                  stages={comEstagios?.stages ?? []}
                  opportunities={doFunil}
                  today={today}
                  canManage={canManage}
                  canDecide={canDecide}
                />
              </section>
            );
          })
        )}
      </>
    );
  } catch (err) {
    const detail =
      err instanceof DataPortError
        ? err.message
        : 'Falha ao carregar o funil. Se o schema deal não estiver exposto na Data API, a tela fica vazia sem erro claro.';
    return (
      <>
        <SectionHeader title="Funil" subtitle="Não foi possível carregar." />
        <ErrorState title="Erro ao carregar" detail={detail} />
      </>
    );
  }
}
