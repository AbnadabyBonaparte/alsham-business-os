'use client';

import { summarizeEntries } from '@alsham/cashflow';
import type { Category } from '@alsham/cashflow';

import type { EntryRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

const ROTULOS: Record<string, string> = {
  in: 'entrada',
  out: 'saída',
  adjustment: 'ajuste',
};

/** O livro — cada linha é eterna. A tela mostra; nunca soma nem edita. */
export function CashLedger({
  entries,
  categories,
}: {
  entries: readonly EntryRow[];
  categories: readonly Category[];
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Livro vazio"
        hint="Lance a primeira entrada ou saída — cada linha do livro é eterna: corrigir é ajuste, reclassificar é estornar e relançar."
      />
    );
  }

  const nomes = new Map(categories.map((c) => [c.id, c.name]));
  // ⭐ O resumo é do PACOTE — a tela não conta nada.
  const resumo = summarizeEntries(entries);

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg text-bos-text">O livro</h2>
        <p className="text-xs text-bos-muted">
          {resumo.total} lançamento(s) · {resumo.uncategorized} sem categoria ·{' '}
          {resumo.adjustments} ajuste(s)
        </p>
      </div>
      <div className="mt-3">
        <Table>
          <THead>
            <TR>
              <TH>Dia</TH>
              <TH>Tipo</TH>
              <TH>Descrição</TH>
              <TH>Categoria</TH>
              <TH>Conta</TH>
              <TH num>Valor</TH>
            </TR>
          </THead>
          <TBody>
            {entries.map((e) => (
              <TR key={e.id} className="transition-colors hover:bg-bos-elevated/30">
                <TD className="whitespace-nowrap text-bos-text">{shortDate(e.occurredOn)}</TD>
                <TD>
                  <Badge tone={e.kind === 'in' ? 'success' : e.kind === 'out' ? 'neutral' : 'warning'}>
                    {ROTULOS[e.kind]}
                  </Badge>
                </TD>
                <TD className="text-bos-text">
                  {e.description || <span className="text-bos-muted">—</span>}
                  {e.kind === 'adjustment' && e.reason ? (
                    <span className="block text-[11px] text-bos-muted">razão: {e.reason}</span>
                  ) : null}
                </TD>
                <TD>
                  {e.categoryId ? (
                    (nomes.get(e.categoryId) ?? '—')
                  ) : (
                    <span className="text-bos-muted">sem categoria</span>
                  )}
                </TD>
                <TD className="text-bos-muted">{e.account ?? '—'}</TD>
                <TD num className="whitespace-nowrap text-bos-text">
                  {money(e.amountCents, e.currency)}
                  {e.kind === 'out' ? <span className="text-bos-muted"> (−)</span> : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </Panel>
  );
}
