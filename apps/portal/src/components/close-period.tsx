'use client';

import type { BankStatement, StatementSummary } from '@alsham/finance-reconciliation';

import { closeStatementAction, discardStatementAction } from '@/app/actions';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { DecideButtons } from '@/components/decide-buttons';

/**
 * Fechar o período.
 *
 * ⭐ O resumo chega **pronto** de `summarizeStatement()`, do pacote. Este
 * componente não conta linha nem decide o que é divergência — só mostra.
 *
 * Fechar é ação relevante: dispara o trigger que põe
 * `recon.reconciliation.completed` na caixa de saída do Core. Por isso tem
 * confirmação explícita, e a confirmação **diz** o que vai acontecer,
 * inclusive quando há divergência em aberto.
 */
export function ClosePeriod({
  items,
  canOperate,
}: {
  items: readonly { statement: BankStatement; summary: StatementSummary }[];
  canOperate: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nenhum extrato aberto"
        hint="Quando você importar um extrato, ele aparece aqui até ser fechado. Fechar é o que registra o período como conciliado."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map(({ statement, summary }) => (
        <Panel key={statement.id} className="px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg text-bos-text">
                {shortDate(statement.periodStart)} – {shortDate(statement.periodEnd)}
              </h2>
              <p className="mt-1 text-xs text-bos-muted">
                conta <span className="font-mono">{statement.accountRef}</span> ·{' '}
                {statement.sourceFormat.toUpperCase()}
                {statement.originalFilename ? ` · ${statement.originalFilename}` : ''}
              </p>
            </div>

            {/* A divergência é o que decide a cor. Nunca o ouro. */}
            <Badge tone={summary.unmatchedLines > 0 ? 'danger' : 'success'}>
              {summary.unmatchedLines > 0
                ? `${summary.unmatchedLines} em aberto`
                : 'tudo conciliado'}
            </Badge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Cifra rotulo="Lançamentos" valor={String(summary.totalLines)} />
            <Cifra rotulo="Conciliados" valor={String(summary.matchedLines)} />
            <Cifra
              rotulo="Em aberto"
              valor={String(summary.unmatchedLines)}
              alerta={summary.unmatchedLines > 0}
            />
            <Cifra
              rotulo="Valor conciliado"
              valor={money(summary.matchedAmountCents, statement.currency)}
            />
          </div>

          {summary.unmatchedLines > 0 ? (
            <p className="mt-4 max-w-2xl text-xs text-bos-muted">
              Ainda há {summary.unmatchedLines} lançamento
              {summary.unmatchedLines === 1 ? '' : 's'} sem correspondência, somando{' '}
              <span className="tabular">
                {money(summary.unmatchedAmountCents, statement.currency)}
              </span>
              . Fechar assim é possível — se a sua empresa aceita — e a divergência fica registrada
              no evento de conclusão.
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <p className="max-w-md text-xs text-bos-muted">
              Fechar emite <code className="font-mono">recon.reconciliation.completed</code> na
              caixa de saída do Core, na mesma transação. O extrato sai da mesa de conciliação.
            </p>

            <div className="flex flex-col items-end gap-3">
              <DecideButtons
                confirmLabel="Fechar período"
                rejectLabel="Descartar extrato"
                disabled={!canOperate}
                disabledHint="Requer recon.statement.import"
                question={(choice) =>
                  choice === 'confirm'
                    ? summary.unmatchedLines > 0
                      ? `Fechar o período com ${summary.unmatchedLines} lançamento${summary.unmatchedLines === 1 ? '' : 's'} ainda em aberto (${money(summary.unmatchedAmountCents, statement.currency)})? A divergência fica registrada no evento de conclusão.`
                      : `Fechar o período ${shortDate(statement.periodStart)} – ${shortDate(statement.periodEnd)}? O extrato sai da mesa de conciliação e o evento de conclusão é emitido.`
                    : `Descartar este extrato inteiro, com ${summary.totalLines} lançamento${summary.totalLines === 1 ? '' : 's'}? Ele some da operação — mas não da trilha, e o arquivo continua não podendo ser reimportado.`
                }
                onDecide={(choice) =>
                  choice === 'confirm'
                    ? closeStatementAction(statement.id)
                    : discardStatementAction(statement.id)
                }
              />
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function Cifra({
  rotulo,
  valor,
  alerta = false,
}: {
  rotulo: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-lg border border-bos-border bg-bos-bg px-4 py-3">
      <p className="text-xs text-bos-muted">{rotulo}</p>
      <p
        className={`tabular mt-1 font-display text-xl ${alerta ? 'text-bos-danger' : 'text-bos-text'}`}
      >
        {valor}
      </p>
    </div>
  );
}
