import { Suspense } from 'react';

import { PERMISSIONS } from '@alsham/finance-reconciliation';

import { getDataPort, DataPortError } from '@/lib/data';
import { DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { ImportForm } from '@/components/import-form';

export const dynamic = 'force-dynamic';

export default function ImportarPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Importar extrato" subtitle="Carregando…" />
      <TableSkeleton rows={3} />
    </>
  );
}

async function Conteudo() {
  const port = await getDataPort();

  try {
    const [permissions, mapping] = await Promise.all([
      port.listPermissions(),
      port.loadCsvMapping(),
    ]);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          eyebrow="Conciliação &amp; Aprovações · finanças"
          title="Importar extrato"
          subtitle="OFX ou CSV. O arquivo é lido, você confere o que vai entrar, e só então grava."
        />

        <ImportForm
          canImport={permissions.has(PERMISSIONS.statementImport)}
          temMapeamentoCsv={mapping !== null}
        />

        <p className="mt-6 max-w-2xl text-xs text-bos-muted">
          O mesmo arquivo não entra duas vezes: a impressão digital dele é gravada com o extrato, e
          o banco recusa a repetição. Reimportar por engano é rotina — duplicar lançamento não pode
          ser.
        </p>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Importar extrato" />
        <ErrorState
          title="Não foi possível preparar a importação"
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
