'use client';

import type {
  MatchSuggestion,
  Payable,
  Receivable,
  StatementLine,
} from '@alsham/finance-reconciliation';

import { decideMatchAction } from '@/app/actions';
import { confidence, money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { DecideButtons } from '@/components/decide-buttons';

/**
 * A mesa de conciliação — o que substitui régua e caneta.
 *
 * Recebe sugestões prontas (débito↔payable e crédito↔receivable). Não pontua:
 * quem faz isso é `suggestMatches()` no pacote.
 */
export function ReconciliationTable({
  suggestions,
  lines,
  payables,
  receivables,
  canManage,
}: {
  suggestions: readonly MatchSuggestion[];
  lines: readonly StatementLine[];
  payables: readonly Payable[];
  receivables: readonly Receivable[];
  canManage: boolean;
}) {
  if (suggestions.length === 0) {
    return (
      <EmptyState
        title="Nenhuma sugestão de baixa"
        hint="O motor não encontrou nenhum par dentro da tolerância configurada para este tenant. Confira as divergências abaixo ou ajuste a política de conciliação."
      />
    );
  }

  const lineById = new Map(lines.map((l) => [l.id, l]));
  const payableById = new Map(payables.map((p) => [p.id, p]));
  const receivableById = new Map(receivables.map((r) => [r.id, r]));

  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-bos-border text-left text-xs text-bos-muted">
              <th scope="col" className="px-5 py-3 font-medium">
                Lançamento no extrato
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Título
              </th>
              <th scope="col" className="px-5 py-3 text-right font-medium">
                Valor casado
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Confiança
              </th>
              <th scope="col" className="px-5 py-3 text-right font-medium">
                Decisão
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bos-border">
            {suggestions.map((s) => {
              const line = lineById.get(s.statementLineId);
              if (!line) return null;

              if (s.kind === 'payable') {
                const payable = payableById.get(s.payableId);
                if (!payable) return null;
                return (
                  <MatchRow
                    key={`p:${s.statementLineId}:${s.payableId}`}
                    line={line}
                    titleLabel="a pagar"
                    titleDescription={payable.description}
                    titleDue={payable.dueDate}
                    titleAmount={payable.amountCents}
                    titleCurrency={payable.currency}
                    titleParty={payable.supplierName}
                    titleRef={payable.externalRef}
                    matchedAmountCents={s.matchedAmountCents}
                    score={s.score}
                    strategy={s.strategy}
                    matchKey={`${s.statementLineId}:${s.payableId}`}
                    canManage={canManage}
                  />
                );
              }

              const receivable = receivableById.get(s.receivableId);
              if (!receivable) return null;
              return (
                <MatchRow
                  key={`r:${s.statementLineId}:${s.receivableId}`}
                  line={line}
                  titleLabel="a receber"
                  titleDescription={receivable.description}
                  titleDue={receivable.dueDate}
                  titleAmount={receivable.amountCents}
                  titleCurrency={receivable.currency}
                  titleParty={receivable.counterpartyName}
                  titleRef={receivable.externalRef}
                  matchedAmountCents={s.matchedAmountCents}
                  score={s.score}
                  strategy={s.strategy}
                  matchKey={`${s.statementLineId}:r:${s.receivableId}`}
                  canManage={canManage}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MatchRow({
  line,
  titleLabel,
  titleDescription,
  titleDue,
  titleAmount,
  titleCurrency,
  titleParty,
  titleRef,
  matchedAmountCents,
  score,
  strategy,
  matchKey,
  canManage,
}: {
  line: StatementLine;
  titleLabel: string;
  titleDescription: string;
  titleDue: string;
  titleAmount: number;
  titleCurrency: string;
  titleParty?: string | null;
  titleRef: string;
  matchedAmountCents: number;
  score: number;
  strategy: string;
  matchKey: string;
  canManage: boolean;
}) {
  return (
    <tr className="align-top">
      <td className="px-5 py-4">
        <p className="text-bos-text">{line.description || '—'}</p>
        <p className="mt-1 text-xs text-bos-muted">
          {shortDate(line.postedAt)} ·{' '}
          <span className="tabular">{money(line.amountCents, line.currency)}</span>
          {line.counterpartyName ? ` · ${line.counterpartyName}` : ''}
        </p>
        {line.externalId ? (
          <p className="mt-1 font-mono text-[11px] text-bos-muted">{line.externalId}</p>
        ) : null}
      </td>

      <td className="px-5 py-4">
        <p className="text-xs text-bos-muted">título {titleLabel}</p>
        <p className="text-bos-text">{titleDescription || '—'}</p>
        <p className="mt-1 text-xs text-bos-muted">
          vence {shortDate(titleDue)} ·{' '}
          <span className="tabular">{money(titleAmount, titleCurrency)}</span>
          {titleParty ? ` · ${titleParty}` : ''}
        </p>
        <p className="mt-1 font-mono text-[11px] text-bos-muted">{titleRef}</p>
      </td>

      <td className="tabular px-5 py-4 text-right text-bos-text">
        {money(matchedAmountCents, titleCurrency)}
      </td>

      <td className="px-5 py-4">
        <Badge tone={score >= 1 ? 'success' : 'warning'}>
          <span className="tabular">{confidence(score)}</span>
          <span className="ml-1 text-bos-muted">automática</span>
        </Badge>
        <p className="mt-1.5 font-mono text-[11px] text-bos-muted">{strategy}</p>
      </td>

      <td className="px-5 py-4 text-right">
        <DecideButtons
          confirmLabel="Conferir"
          rejectLabel="Rejeitar"
          disabled={!canManage}
          disabledHint="Requer recon.match.manage"
          question={(choice) =>
            choice === 'confirm'
              ? `Confirmar a baixa de ${money(matchedAmountCents, titleCurrency)} do título ${titleRef}?`
              : `Rejeitar esta sugestão? O lançamento volta para as divergências.`
          }
          onDecide={(choice) =>
            decideMatchAction(matchKey, choice === 'confirm' ? 'confirmed' : 'rejected')
          }
        />
      </td>
    </tr>
  );
}

export function DivergenceList({ lines }: { lines: readonly StatementLine[] }) {
  if (lines.length === 0) {
    return (
      <EmptyState
        title="Nenhuma divergência"
        hint="Todo lançamento do período encontrou um título correspondente."
      />
    );
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-bos-border">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-bos-text">{l.description || '—'}</p>
              <p className="mt-1 text-xs text-bos-muted">
                {shortDate(l.postedAt)}
                {l.counterpartyName ? ` · ${l.counterpartyName}` : ''}
                {l.externalId ? (
                  <span className="ml-2 font-mono text-[11px]">{l.externalId}</span>
                ) : null}
              </p>
            </div>
            <span className="tabular text-sm text-bos-text">
              {money(l.amountCents, l.currency)}
            </span>
            <Badge tone="danger">sem correspondência</Badge>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
