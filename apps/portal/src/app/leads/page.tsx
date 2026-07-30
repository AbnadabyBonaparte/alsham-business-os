import { Suspense } from 'react';

import { PERMISSIONS, summarizeLeads } from '@alsham/leads';

import { getLeadPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { LeadForm, LeadSources } from '@/components/lead-forms';
import { LeadQueue } from '@/components/lead-queue';

export const dynamic = 'force-dynamic';

export default function LeadsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Leads" subtitle="Abrindo a fila…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getLeadPort();
  try {
    const [permissions, leads] = await Promise.all([
      port.listPermissions(),
      port.loadLeads(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canDecide = permissions.has(PERMISSIONS.decide);

    // ⭐ O resumo é do PACOTE.
    const resumo = summarizeLeads(leads);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Leads · comercial"
          title="Todo interesse tem origem."
          accent="E quem volta é lead novo — com origem nova."
          subtitle="A fila de entrada do comercial: de onde veio é texto livre e é o dado que importa. Qualificar carimba os vínculos; descartar exige o porquê — a fila que apaga em silêncio esconde o próprio funil."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.waiting > 0 ? 'warning' : 'neutral'}>{resumo.waiting} esperando</Badge>
              <Badge tone="neutral">{resumo.inContact} em contato</Badge>
              <Badge tone="success">{resumo.qualified} qualificado(s)</Badge>
              {!canDecide ? <Badge tone="neutral">sem lead.lead.decide</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <LeadForm /> : null}
          <LeadSources leads={leads} />
        </div>
        <LeadQueue leads={leads} canManage={canManage} canDecide={canDecide} />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Leads" subtitle="A fila de entrada do comercial." />
        <ErrorState title="Não foi possível abrir a fila." detail={detail} />
      </>
    );
  }
}
