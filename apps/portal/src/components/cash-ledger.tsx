'use client';

import { summarizeEntries } from '@alsham/cashflow';
import type { Category } from '@alsham/cashflow';

import type { EntryRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

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
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-bos-muted">
              <th className="py-1 pr-3">Dia</th>
              <th className="py-1 pr-3">Tipo</th>
              <th className="py-1 pr-3">Descrição</th>
              <th className="py-1 pr-3">Categoria</th>
              <th className="py-1 pr-3">Conta</th>
              <th className="py-1 pr-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-bos-border text-bos-text">
                <td className="py-1.5 pr-3 whitespace-nowrap">{shortDate(e.occurredOn)}</td>
                <td className="py-1.5 pr-3">
                  <Badge tone={e.kind === 'in' ? 'success' : e.kind === 'out' ? 'neutral' : 'warning'}>
                    {ROTULOS[e.kind]}
                  </Badge>
                </td>
                <td className="py-1.5 pr-3">
                  {e.description || <span className="text-bos-muted">—</span>}
                  {e.kind === 'adjustment' && e.reason ? (
                    <span className="block text-[11px] text-bos-muted">razão: {e.reason}</span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-3">
                  {e.categoryId ? (
                    (nomes.get(e.categoryId) ?? '—')
                  ) : (
                    <span className="text-bos-muted">sem categoria</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-bos-muted">{e.account ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right tabular">
                  {money(e.amountCents, e.currency)}
                  {e.kind === 'out' ? <span className="text-bos-muted"> (−)</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
