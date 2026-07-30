import { Suspense } from 'react';

import { PERMISSIONS } from '@alsham/cost-centers';

import { getCcPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { CcCenterForm, CcRuleForm } from '@/components/cc-forms';
import { CcBoard } from '@/components/cc-board';

export const dynamic = 'force-dynamic';

export default function CentrosDeCustoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Centros de Custo" subtitle="Abrindo o rateio…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getCcPort();
  try {
    const [permissions, centers, rules, executions, byCenter] = await Promise.all([
      port.listPermissions(),
      port.loadCenters(),
      port.loadRules(),
      port.loadExecutions(),
      port.loadByCenter(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canDesign = permissions.has(PERMISSIONS.design);
    const canExecute = permissions.has(PERMISSIONS.execute);

    const ativos = centers.filter((c) => c.status === 'active').length;
    const ativas = rules.filter((r) => r.status === 'active').length;

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Centros de Custo & Rateio · o Bloco Financeiro"
          title="O custo se divide — e nenhum centavo se perde."
          accent="A regra fecha 100%, ou não rateia."
          subtitle="Os centros são seus e voltam do arquivo; a regra de rateio só ativa quando fecha 100%; executar é ato de gente, e o livro de rateio não se rasura — corrigir é executar de novo."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ativos > 0 ? 'info' : 'neutral'}>{ativos} centro(s) ativo(s)</Badge>
              <Badge tone={ativas > 0 ? 'success' : 'neutral'}>{ativas} regra(s) ativa(s)</Badge>
              {executions.length > 0 ? <Badge tone="neutral">{executions.length} execução(ões)</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <CcCenterForm /> : null}
          {canDesign ? <CcRuleForm /> : null}
        </div>
        <CcBoard
          centers={centers}
          rules={rules}
          executions={executions}
          byCenter={byCenter}
          canManage={canManage}
          canDesign={canDesign}
          canExecute={canExecute}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Centros de Custo" subtitle="O rateio do tenant." />
        <ErrorState title="Não foi possível abrir o rateio." detail={detail} />
      </>
    );
  }
}
