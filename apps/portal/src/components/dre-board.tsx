'use client';

import { useTransition } from 'react';

import { orderLines } from '@alsham/dre';

import { setLineStatus } from '@/app/dre-actions';
import type { DreLineRow, DreResultRow, DreStatementRow } from '@/lib/data';
import { money } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const NATUREZA: Record<string, string> = { revenue: 'receita', cost: 'custo', expense: 'despesa' };

export function DreBoard({
  lines,
  statement,
  result,
  canManage,
}: {
  lines: readonly DreLineRow[];
  statement: readonly DreStatementRow[];
  result: readonly DreResultRow[];
  canManage: boolean;
}) {
  const ordenadas = orderLines(lines) as readonly DreLineRow[];
  const comLancamento = new Set(statement.map((s) => s.lineId));

  return (
    <div className="flex flex-col gap-6">
      {result.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium text-bos-text">Resultado</h3>
          <div className="flex flex-col gap-2">
            {result.map((r) => (
              <Panel key={`${r.competenceMonth}-${r.currency}`} className="px-5 py-4">
                <p className="text-xs text-bos-muted">{r.competenceMonth} · {r.currency}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <Linha rotulo="Receita" cents={r.revenueCents} moeda={r.currency} />
                  <Linha rotulo="Custos" cents={r.costCents} moeda={r.currency} />
                  <Linha rotulo="Despesas" cents={r.expenseCents} moeda={r.currency} />
                  <Linha rotulo="Resultado" cents={r.resultCents} moeda={r.currency} forte />
                </div>
              </Panel>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-medium text-bos-text">Demonstrativo</h3>
        {statement.length === 0 ? (
          <EmptyState title="Sem lançamentos ainda" hint="As linhas com valor aparecem aqui quando o caixa e os rateios registram." />
        ) : (
          <Panel className="px-5 py-4">
            <ul className="flex flex-col gap-1">
              {statement.map((s) => (
                <li key={`${s.lineId}-${s.competenceMonth}`} className="flex items-center justify-between text-sm">
                  <span className="text-bos-text">{s.lineName} <span className="text-bos-muted">· {NATUREZA[s.kind]}</span></span>
                  <span className={s.amountCents < 0 ? 'text-bos-danger' : 'text-bos-text'}>{money(s.amountCents, s.currency)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-bos-text">Plano de linhas</h3>
        {ordenadas.length === 0 ? (
          <EmptyState title="Nenhuma linha ainda" hint="Desenhe o plano — nome, natureza e a categoria que casa com os livros." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {ordenadas.map((l) => (
              <LineChip key={l.id} line={l} temValor={comLancamento.has(l.id)} canManage={canManage} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Linha({ rotulo, cents, moeda, forte }: { rotulo: string; cents: number; moeda: string; forte?: boolean }) {
  return (
    <div>
      <p className="text-xs text-bos-muted">{rotulo}</p>
      <p className={`${forte ? 'font-medium' : ''} ${cents < 0 ? 'text-bos-danger' : 'text-bos-text'}`}>{money(cents, moeda)}</p>
    </div>
  );
}

function LineChip({ line: l, temValor, canManage }: { line: DreLineRow; temValor: boolean; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const viva = l.status === 'active';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-bos-border px-3 py-1 text-xs text-bos-text">
      {l.name}
      <span className="text-bos-muted">· {NATUREZA[l.kind]}</span>
      {!viva ? <Badge tone="neutral">arquivada</Badge> : !temValor ? <Badge tone="neutral">sem lançamento</Badge> : null}
      {canManage ? (
        <button
          type="button"
          disabled={pending}
          className="text-bos-muted hover:text-bos-text"
          onClick={() => startTransition(async () => { await setLineStatus({ lineId: l.id, status: viva ? 'archived' : 'active' }); })}
        >
          {viva ? 'arquivar' : 'devolver'}
        </button>
      ) : null}
    </span>
  );
}
