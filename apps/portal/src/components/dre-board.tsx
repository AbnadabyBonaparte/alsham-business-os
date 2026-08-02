'use client';

import { useTransition } from 'react';

import { orderLines } from '@alsham/dre';

import { setLineStatus } from '@/app/dre-actions';
import type { DreLineRow, DreResultRow, DreStatementRow } from '@/lib/data';
import { money } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

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
          <Table>
            <THead>
              <TR>
                <TH>Competência</TH>
                <TH num>Receita</TH>
                <TH num>Custos</TH>
                <TH num>Despesas</TH>
                <TH num>Resultado</TH>
              </TR>
            </THead>
            <TBody>
              {result.map((r) => (
                <TR key={`${r.competenceMonth}-${r.currency}`} className="transition-colors hover:bg-bos-elevated/30">
                  <TD>{r.competenceMonth} <span className="text-bos-muted">· {r.currency}</span></TD>
                  <TD num className={r.revenueCents < 0 ? 'text-bos-danger' : 'text-bos-text'}>{money(r.revenueCents, r.currency)}</TD>
                  <TD num className={r.costCents < 0 ? 'text-bos-danger' : 'text-bos-text'}>{money(r.costCents, r.currency)}</TD>
                  <TD num className={r.expenseCents < 0 ? 'text-bos-danger' : 'text-bos-text'}>{money(r.expenseCents, r.currency)}</TD>
                  <TD num className={`font-medium ${r.resultCents < 0 ? 'text-bos-danger' : 'text-bos-text'}`}>{money(r.resultCents, r.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-medium text-bos-text">Demonstrativo</h3>
        {statement.length === 0 ? (
          <EmptyState title="Sem lançamentos ainda" hint="As linhas com valor aparecem aqui quando o caixa e os rateios registram." />
        ) : (
          <Panel className="px-5 py-4">
            <Table>
              <THead>
                <TR>
                  <TH>Linha</TH>
                  <TH num>Valor</TH>
                </TR>
              </THead>
              <TBody>
                {statement.map((s) => (
                  <TR key={`${s.lineId}-${s.competenceMonth}`} className="transition-colors hover:bg-bos-elevated/30">
                    <TD>{s.lineName} <span className="text-bos-muted">· {NATUREZA[s.kind]}</span></TD>
                    <TD num className={s.amountCents < 0 ? 'text-bos-danger' : 'text-bos-text'}>{money(s.amountCents, s.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
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
