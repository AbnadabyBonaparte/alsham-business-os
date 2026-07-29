import { Suspense } from 'react';

import { PERMISSIONS, summarizeProposals } from '@alsham/quotes';

import { getQuotePort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { ProposalList } from '@/components/proposal-list';
import { ProposalForm } from '@/components/proposal-form';

export const dynamic = 'force-dynamic';

export default function PropostasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Propostas" subtitle="Carregando a mesa…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getQuotePort();
  try {
    const [permissions, proposals] = await Promise.all([
      port.listPermissions(),
      port.loadProposals(),
    ]);

    const canManage = permissions.has(PERMISSIONS.proposalManage);
    const canDecideProposals = permissions.has(PERMISSIONS.proposalDecide);
    const canCancelProposals = permissions.has(PERMISSIONS.proposalCancel);

    // Resumo do PACOTE — a tela não conta nem soma nada sozinha.
    const resumo = summarizeProposals(proposals);
    const today = new Date().toISOString().slice(0, 10);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          title="Propostas"
          subtitle="Propostas e orçamentos com itens em texto livre. Aceite e recusa ficam carimbados — e renegociar é documento novo."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.onTheTable > 0 ? 'info' : 'neutral'}>
                {resumo.onTheTable} na mesa
              </Badge>
              <Badge tone={resumo.accepted > 0 ? 'success' : 'neutral'}>
                {resumo.accepted} aceita(s)
              </Badge>
              {[...resumo.acceptedCentsByCurrency.entries()].map(([moeda, cents]) => (
                <Badge key={moeda} tone="neutral">
                  {(cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: moeda })}
                </Badge>
              ))}
              {!canDecideProposals ? <Badge tone="neutral">sem quote.proposal.decide</Badge> : null}
            </div>
          }
        />
        <div className="mb-6">
          <ProposalForm canManage={canManage} />
        </div>
        <ProposalList
          rows={proposals}
          today={today}
          canManageProposals={canManage}
          canDecideProposals={canDecideProposals}
          canCancelProposals={canCancelProposals}
        />
      </>
    );
  } catch (err) {
    const detail =
      err instanceof DataPortError
        ? err.message
        : 'Falha ao carregar propostas. Se o schema quote não estiver exposto na Data API, a tela fica vazia sem erro claro.';
    return (
      <>
        <SectionHeader title="Propostas" subtitle="Não foi possível carregar." />
        <ErrorState title="Erro ao carregar" detail={detail} />
      </>
    );
  }
}
