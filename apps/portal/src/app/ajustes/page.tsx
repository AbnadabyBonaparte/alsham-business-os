import { Suspense } from 'react';

import { getBrandPort, DataPortError } from '@/lib/data';
import { DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { BrandForm } from '@/components/brand-form';

export const dynamic = 'force-dynamic';

export default function AjustesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Ajustes" subtitle="Carregando…" />
      <TableSkeleton rows={2} />
    </>
  );
}

async function Conteudo() {
  const port = await getBrandPort();
  try {
    const [atual, canEdit] = await Promise.all([port.load(), port.canEdit()]);
    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          title="Ajustes"
          subtitle="O que a plataforma precisa saber sobre a sua empresa."
        />
        <BrandForm atual={atual} canEdit={canEdit} />
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Ajustes" />
        <ErrorState
          title="Não foi possível carregar os ajustes"
          detail={err instanceof DataPortError ? err.message : 'Erro inesperado.'}
        />
      </>
    );
  }
}
