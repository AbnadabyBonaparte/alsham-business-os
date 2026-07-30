import { Suspense } from 'react';

import { PERMISSIONS } from '@alsham/dre';

import { getDrePort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { DreLineForm } from '@/components/dre-forms';
import { DreBoard } from '@/components/dre-board';

export const dynamic = 'force-dynamic';

export default function DrePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="DRE Gerencial" subtitle="Abrindo o demonstrativo…" />
      <TableSkeleton rows={5} />
    </>
  );
}

async function Conteudo() {
  const port = await getDrePort();
  try {
    const [permissions, lines, statement, result] = await Promise.all([
      port.listPermissions(),
      port.loadLines(),
      port.loadStatement(),
      port.loadResult(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manageLine);

    const ativas = lines.filter((l) => l.status === 'active').length;

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="DRE Gerencial · o Bloco Financeiro"
          title="O resultado que você lê — não o que o Fisco cobra."
          accent="As linhas são suas; os valores nascem dos livros."
          subtitle="Gerencial, não fiscal: você desenha as linhas (receita, custo, despesa); os valores vêm do Fluxo de Caixa e dos Rateios, projetados; linha sem lançamento não aparece; os totais são calculados na leitura."
          aside={<Badge tone={ativas > 0 ? 'success' : 'neutral'}>{ativas} linha(s) no plano</Badge>}
        />
        <div className="mb-6 flex flex-col gap-4">{canManage ? <DreLineForm /> : null}</div>
        <DreBoard lines={lines} statement={statement} result={result} canManage={canManage} />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="DRE Gerencial" subtitle="O resultado do tenant." />
        <ErrorState title="Não foi possível abrir a DRE." detail={detail} />
      </>
    );
  }
}
