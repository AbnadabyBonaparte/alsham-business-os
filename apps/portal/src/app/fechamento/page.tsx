import { Suspense } from 'react';

import { PERMISSIONS, summarizeStatement } from '@alsham/finance-reconciliation';

import { getDataPort, DataPortError } from '@/lib/data';
import { DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { ClosePeriod } from '@/components/close-period';

export const dynamic = 'force-dynamic';

export default function FechamentoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Fechar período" subtitle="Carregando os extratos abertos…" />
      <TableSkeleton rows={2} />
    </>
  );
}

/**
 * ⭐ A única "lógica" desta página é uma chamada ao pacote:
 *
 * ```
 * const summary = summarizeStatement(lines);
 * ```
 *
 * O que conta como conciliado, o que entra na divergência e o que é linha
 * ignorada — tudo isso é regra de negócio, e mora em
 * `@alsham/finance-reconciliation`. A página busca as linhas e desenha o
 * resultado.
 */
async function Conteudo() {
  const port = await getDataPort();

  try {
    const [permissions, statements] = await Promise.all([
      port.listPermissions(),
      port.loadOpenStatements(),
    ]);

    const items = await Promise.all(
      statements.map(async (statement) => ({
        statement,
        summary: summarizeStatement(await port.loadLinesOfStatement(statement.id)),
      })),
    );

    const totalDivergencias = items.reduce((n, i) => n + i.summary.unmatchedLines, 0);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          title="Fechar período"
          subtitle="O resumo antes do carimbo: o que casou, e o que sobrou."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-bos-border px-2.5 py-0.5 text-xs text-bos-muted">
                {items.length} extrato{items.length === 1 ? '' : 's'} aberto
                {items.length === 1 ? '' : 's'}
              </span>
              {totalDivergencias > 0 ? (
                <span className="rounded-full border border-bos-danger/50 bg-bos-danger/20 px-2.5 py-0.5 text-xs text-bos-text">
                  {totalDivergencias} em aberto no total
                </span>
              ) : null}
            </div>
          }
        />

        <ClosePeriod items={items} canOperate={permissions.has(PERMISSIONS.statementImport)} />
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Fechar período" />
        <ErrorState
          title="Não foi possível carregar os extratos"
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
