import { Suspense } from 'react';

import {
  PERMISSIONS,
  suggestMatches,
  unmatchedLines,
} from '@alsham/finance-reconciliation';

import { getDataPort, DataPortError } from '@/lib/data';
import { confidence, money } from '@/lib/format';
import {
  Badge,
  DemoNotice,
  ErrorState,
  SectionHeader,
  TableSkeleton,
} from '@/components/states';
import { DivergenceList, ReconciliationTable } from '@/components/reconciliation-table';

export const dynamic = 'force-dynamic';

export default function ConciliacaoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Mesa de conciliação" subtitle="Carregando o extrato…" />
      <TableSkeleton rows={4} />
    </>
  );
}

/**
 * ⭐ **O CORAÇÃO DESTA PÁGINA SÃO DUAS LINHAS — E NENHUMA DELAS É DAQUI.**
 *
 * ```
 * const sugestoes  = suggestMatches(linhas, titulos, settings);
 * const divergencias = unmatchedLines(linhas, sugestoes);
 * ```
 *
 * As duas vêm de `@alsham/finance-reconciliation`. Esta página busca os dados,
 * repassa a política do tenant e desenha o resultado. Ela **não** sabe como se
 * pontua um casamento, qual sinal pesa mais nem qual o limiar — e é isso que
 * permite jogar `apps/` fora em 2028 sem perder uma regra sequer
 * (CLAUDE.md §5.3).
 */
async function Conteudo() {
  const port = await getDataPort();

  try {
    // A política é do TENANT, não do app: vem de core.tenant_modules.settings.
    const [permissions, settings, lines, payables, receivables] = await Promise.all([
      port.listPermissions(),
      port.loadMatchingSettings(),
      port.loadStatementLines(),
      port.loadPayables(),
      port.loadReceivables(),
    ]);

    // ── a única "lógica" desta página: delegar ──────────────────────────────
    const suggestions = suggestMatches(lines, payables, settings, receivables);
    const divergences = unmatchedLines(lines, suggestions);
    // ───────────────────────────────────────────────────────────────────────

    const canManage = permissions.has(PERMISSIONS.matchManage);
    const currency = lines[0]?.currency ?? 'BRL';
    const totalCasado = suggestions.reduce((sum, s) => sum + s.matchedAmountCents, 0);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          title="Mesa de conciliação"
          subtitle="O sistema sugere; o humano confere e visa. Débito casa com a pagar; crédito, com a receber."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">
                limiar do tenant <span className="tabular">{confidence(settings.minScore)}</span>
              </Badge>
              <Badge tone={divergences.length > 0 ? 'danger' : 'success'}>
                {divergences.length} divergência{divergences.length === 1 ? '' : 's'}
              </Badge>
            </div>
          }
        />

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Sugestões de baixa" value={String(suggestions.length)} />
          <Stat label="Valor casado" value={money(totalCasado, currency)} />
          <Stat
            label="Lançamentos em aberto"
            value={String(lines.length)}
            hint="linhas ainda não conciliadas no período"
          />
        </div>

        <ReconciliationTable
          suggestions={suggestions}
          lines={lines}
          payables={payables}
          receivables={receivables}
          canManage={canManage}
        />

        <div className="mt-10">
          <SectionHeader
            title="Divergências"
            subtitle="O que sobrou — e é isto que interessa depois de rodar o motor."
          />
          <DivergenceList lines={divergences} />
        </div>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Mesa de conciliação" />
        <ErrorState
          title="Não foi possível carregar a conciliação"
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-bos-border bg-bos-surface px-5 py-4">
      <p className="text-xs text-bos-muted">{label}</p>
      <p className="tabular mt-1 font-display text-2xl text-bos-text">{value}</p>
      {hint ? <p className="mt-1 text-xs text-bos-muted">{hint}</p> : null}
    </div>
  );
}
