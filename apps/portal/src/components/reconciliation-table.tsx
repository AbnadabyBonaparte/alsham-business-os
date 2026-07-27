'use client';

import type {
  MatchSuggestion,
  Payable,
  StatementLine,
} from '@alsham/finance-reconciliation';

import { decideMatchAction } from '@/app/actions';
import { confidence, money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { DecideButtons } from '@/components/decide-buttons';

/**
 * A mesa de conciliação — o que substitui régua e caneta.
 *
 * ⭐ Este componente **recebe** as sugestões prontas. Ele não chama o motor,
 * não pontua e não ordena por confiança: quem faz isso é `suggestMatches()`,
 * em `@alsham/finance-reconciliation`, chamado pela página no servidor.
 *
 * O que ele faz é o ofício de tela: juntar a sugestão com a linha e o título
 * para exibir, formatar dinheiro e data, escolher a cor do selo e coletar o
 * clique.
 *
 * **`score` e `strategy` ficam visíveis**, por decisão de produto: o humano
 * precisa ver *por que* o sistema sugeriu, não só *que* sugeriu. Sugestão sem
 * justificativa vira carimbo automático — e carimbo automático é o oposto de
 * conciliação.
 */
export function ReconciliationTable({
  suggestions,
  lines,
  payables,
  canManage,
}: {
  suggestions: readonly MatchSuggestion[];
  lines: readonly StatementLine[];
  payables: readonly Payable[];
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
                Título a pagar
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
              const payable = payableById.get(s.payableId);
              if (!line || !payable) return null;

              return (
                <tr key={`${s.statementLineId}:${s.payableId}`} className="align-top">
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
                    <p className="text-bos-text">{payable.description || '—'}</p>
                    <p className="mt-1 text-xs text-bos-muted">
                      vence {shortDate(payable.dueDate)} ·{' '}
                      <span className="tabular">
                        {money(payable.amountCents, payable.currency)}
                      </span>
                      {payable.supplierName ? ` · ${payable.supplierName}` : ''}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-bos-muted">
                      {payable.externalRef}
                    </p>
                  </td>

                  <td className="tabular px-5 py-4 text-right text-bos-text">
                    {money(s.matchedAmountCents, payable.currency)}
                  </td>

                  <td className="px-5 py-4">
                    {/* Sugestão automática ainda não conferida = PENDENTE.
                        Warning, nunca ouro: o ouro é do sistema (§2). */}
                    <Badge tone={s.score >= 1 ? 'success' : 'warning'}>
                      <span className="tabular">{confidence(s.score)}</span>
                      <span className="ml-1 text-bos-muted">automática</span>
                    </Badge>
                    {/* O PORQUÊ da sugestão, em letra técnica. */}
                    <p className="mt-1.5 font-mono text-[11px] text-bos-muted">{s.strategy}</p>
                  </td>

                  <td className="px-5 py-4 text-right">
                    <DecideButtons
                      confirmLabel="Conferir"
                      rejectLabel="Rejeitar"
                      disabled={!canManage}
                      disabledHint="Requer recon.match.manage"
                      question={(choice) =>
                        choice === 'confirm'
                          ? `Confirmar a baixa de ${money(s.matchedAmountCents, payable.currency)} do título ${payable.externalRef}?`
                          : `Rejeitar esta sugestão? O lançamento volta para as divergências.`
                      }
                      onDecide={(choice) =>
                        decideMatchAction(
                          `${s.statementLineId}:${s.payableId}`,
                          choice === 'confirm' ? 'confirmed' : 'rejected',
                        )
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/**
 * As linhas que sobraram — **a divergência**.
 *
 * É o número que interessa depois de rodar o motor: não o que casou, e sim o
 * que não casou e vai precisar de olho e de caneta. Por isso tem seção
 * própria, e por isso é `--bos-danger`.
 */
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
