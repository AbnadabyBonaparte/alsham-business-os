import { Suspense } from 'react';

import { PERMISSIONS, composeMesa } from '@alsham/finance-reconciliation';

import { getDataPort, DataPortError } from '@/lib/data';
import { confidence, money } from '@/lib/format';
import {
  Badge,
  DemoNotice,
  ErrorState,
  PageHero,
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
 * ⭐ **O CORAÇÃO DESTA PÁGINA É UMA LINHA — E ELA NÃO É DAQUI.**
 *
 * ```
 * const { suggestions, divergences } = composeMesa(lines, matches, payables, settings, receivables);
 * ```
 *
 * `composeMesa` vem de `@alsham/finance-reconciliation`: usa os casamentos JÁ
 * GRAVADOS (com o score/estratégia de origem) como verdade, roda o motor só no
 * que sobrou e classifica a divergência com MOTIVO. Esta página busca os dados,
 * repassa a política do tenant e desenha o resultado. Ela **não** sabe como se
 * pontua um casamento, qual sinal pesa mais, qual o limiar nem por que uma linha
 * não casou — e é isso que permite jogar `apps/` fora em 2028 sem perder uma
 * regra sequer (CLAUDE.md §5.3).
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

    // Os casamentos já gravados para estas linhas — o histórico que a mesa usa
    // em vez de recalcular. Depende das linhas, então vem depois delas.
    const matches = await port.loadReconciliationMatches(lines.map((l) => l.id));

    // ── a única "lógica" desta página: delegar ──────────────────────────────
    const { suggestions, divergences } = composeMesa(
      lines,
      matches,
      payables,
      settings,
      receivables,
    );
    // ───────────────────────────────────────────────────────────────────────

    const canManage = permissions.has(PERMISSIONS.matchManage);
    const currency = lines[0]?.currency ?? 'BRL';
    const totalCasado = suggestions.reduce((sum, s) => sum + s.suggestion.matchedAmountCents, 0);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <PageHero
          eyebrow="Conciliação &amp; Aprovações · finanças"
          title="A mesa de conciliação."
          accent="O sistema sugere; o humano visa."
          subtitle="Débito casa com a pagar; crédito, com a receber. Nada se baixa sem decisão de gente."
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
          <DivergenceList divergences={divergences} />
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
