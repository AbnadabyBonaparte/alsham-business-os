'use client';

import { useState } from 'react';

import type {
  ClassifiedDivergence,
  DivergenceReason,
  MesaSuggestion,
  NearestCandidate,
  Payable,
  Receivable,
  SourcedStatementLine,
} from '@alsham/finance-reconciliation';

import { decideMatchAction } from '@/app/actions';
import { confidence, money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';
import { DecideButtons } from '@/components/decide-buttons';

/**
 * A mesa de conciliação — o que substitui régua e caneta.
 *
 * Recebe sugestões prontas (`composeMesa`, no pacote): casamentos GRAVADOS com
 * seu score/estratégia de origem, e o que o motor propôs por cima do que sobrou.
 * A tela **não** pontua nem decide — só mostra e delega a decisão.
 *
 * ⭐ Cada linha ABRE (padrão do Mandato de Beleza) para o extrato original e o
 * histórico do casamento: de qual conta veio, com qual força, por qual regra.
 */

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function ReconciliationTable({
  suggestions,
  lines,
  payables,
  receivables,
  canManage,
}: {
  suggestions: readonly MesaSuggestion[];
  lines: readonly SourcedStatementLine[];
  payables: readonly Payable[];
  receivables: readonly Receivable[];
  canManage: boolean;
}) {
  if (suggestions.length === 0) {
    return (
      <EmptyState
        title="Nenhuma sugestão de baixa"
        hint="O motor não encontrou nenhum par dentro da tolerância configurada para este tenant, e não há casamento gravado pendente. Confira as divergências abaixo ou ajuste a política de conciliação."
      />
    );
  }

  const lineById = new Map(lines.map((l) => [l.id, l]));
  const payableById = new Map(payables.map((p) => [p.id, p]));
  const receivableById = new Map(receivables.map((r) => [r.id, r]));

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Lançamento no extrato</TH>
            <TH>Título</TH>
            <TH num>Valor casado</TH>
            <TH>Confiança</TH>
            <TH>Decisão</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {suggestions.map((ms) => {
            const s = ms.suggestion;
            const line = lineById.get(s.statementLineId);
            if (!line) return null;

            if (s.kind === 'payable') {
              const payable = payableById.get(s.payableId);
              if (!payable) return null;
              return (
                <MatchRow
                  key={`p:${s.statementLineId}:${s.payableId}`}
                  mesa={ms}
                  line={line}
                  titleLabel="a pagar"
                  titleDescription={payable.description}
                  titleDue={payable.dueDate}
                  titleAmount={payable.amountCents}
                  titleCurrency={payable.currency}
                  titleParty={payable.supplierName}
                  titleRef={payable.externalRef}
                  canManage={canManage}
                />
              );
            }

            const receivable = receivableById.get(s.receivableId);
            if (!receivable) return null;
            return (
              <MatchRow
                key={`r:${s.statementLineId}:${s.receivableId}`}
                mesa={ms}
                line={line}
                titleLabel="a receber"
                titleDescription={receivable.description}
                titleDue={receivable.dueDate}
                titleAmount={receivable.amountCents}
                titleCurrency={receivable.currency}
                titleParty={receivable.counterpartyName}
                titleRef={receivable.externalRef}
                canManage={canManage}
              />
            );
          })}
        </TBody>
      </Table>
    </Panel>
  );
}

function MatchRow({
  mesa,
  line,
  titleLabel,
  titleDescription,
  titleDue,
  titleAmount,
  titleCurrency,
  titleParty,
  titleRef,
  canManage,
}: {
  mesa: MesaSuggestion;
  line: SourcedStatementLine;
  titleLabel: string;
  titleDescription: string;
  titleDue: string;
  titleAmount: number;
  titleCurrency: string;
  titleParty?: string | null;
  titleRef: string;
  canManage: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const s = mesa.suggestion;
  const painelId = `match-${s.statementLineId}`;
  const gravada = mesa.source === 'stored';
  const manual = gravada && mesa.matchOrigin === 'manual';

  return (
    <>
      <TR className="align-top transition-colors hover:bg-bos-elevated/30">
        <TD>
          <p className="text-bos-text">{line.description || '—'}</p>
          <p className="mt-1 text-xs text-bos-muted">
            {shortDate(line.postedAt)} ·{' '}
            <span className="tabular">{money(line.amountCents, line.currency)}</span>
            {line.counterpartyName ? ` · ${line.counterpartyName}` : ''}
          </p>
          <SourceChip line={line} />
        </TD>

        <TD>
          <p className="text-xs text-bos-muted">título {titleLabel}</p>
          <p className="text-bos-text">{titleDescription || '—'}</p>
          <p className="mt-1 text-xs text-bos-muted">
            vence {shortDate(titleDue)} ·{' '}
            <span className="tabular">{money(titleAmount, titleCurrency)}</span>
            {titleParty ? ` · ${titleParty}` : ''}
          </p>
          <p className="mt-1 font-mono text-[11px] text-bos-muted">{titleRef}</p>
        </TD>

        <TD num className="whitespace-nowrap text-bos-text">
          {money(s.matchedAmountCents, titleCurrency)}
        </TD>

        <TD className="whitespace-nowrap">
          <Badge tone={manual ? 'info' : s.score >= 1 ? 'success' : 'warning'}>
            {manual ? 'manual' : <span className="tabular">{confidence(s.score)}</span>}
            <span className="ml-1 text-bos-muted">{gravada ? 'gravada' : 'automática'}</span>
          </Badge>
          <p className="mt-1.5 font-mono text-[11px] text-bos-muted">{s.strategy}</p>
        </TD>

        <TD className="whitespace-nowrap">
          <DecideButtons
            confirmLabel="Conferir"
            rejectLabel="Rejeitar"
            disabled={!canManage}
            disabledHint="Requer recon.match.manage"
            question={(choice) =>
              choice === 'confirm'
                ? `Confirmar a baixa de ${money(s.matchedAmountCents, titleCurrency)} do título ${titleRef}?`
                : `Rejeitar esta sugestão? O lançamento volta para as divergências.`
            }
            onDecide={(choice) =>
              decideMatchAction(s, choice === 'confirm' ? 'confirmed' : 'rejected')
            }
          />
        </TD>

        <TD className="text-right">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={painelId}
            className="text-[11px] text-bos-muted transition-colors hover:text-bos-text"
          >
            {aberto ? 'fechar' : 'detalhes'}
          </button>
        </TD>
      </TR>

      {aberto ? (
        <TR>
          <TD colSpan={6} className="bg-bos-elevated/20">
            <div id={painelId} className="grid gap-6 px-1 py-1 sm:grid-cols-2">
              <OriginalLine line={line} />
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-bos-text">O casamento</p>
                <p className="text-xs text-bos-muted">
                  {gravada
                    ? manual
                      ? 'Casamento gravado por decisão manual — sem score, com responsabilidade de quem o fez.'
                      : 'Casamento gravado pelo motor (status sugerido). O score e a regra abaixo são os do momento em que foi feito — a mesa mostra o gravado, não um recálculo.'
                    : 'Sugestão do motor agora, para uma linha que ainda não tinha casamento gravado.'}
                </p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-bos-muted">valor casado</dt>
                  <dd className="tabular text-bos-text">
                    {money(s.matchedAmountCents, titleCurrency)}
                  </dd>
                  <dt className="text-bos-muted">confiança</dt>
                  <dd className="tabular text-bos-text">
                    {manual ? 'manual (sem score)' : confidence(s.score)}
                  </dd>
                  <dt className="text-bos-muted">regra</dt>
                  <dd className="font-mono text-[11px] text-bos-text">{s.strategy}</dd>
                  <dt className="text-bos-muted">procedência</dt>
                  <dd className="text-bos-text">
                    {gravada ? `gravada · ${mesa.matchOrigin ?? 'auto'}` : 'calculada agora'}
                  </dd>
                </dl>
              </div>
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// DIVERGÊNCIAS — com MOTIVO, não "sem correspondência"
// -----------------------------------------------------------------------------

const REASON: Record<
  DivergenceReason,
  { label: string; tone: Tone; explain: (n: NearestCandidate | null) => string }
> = {
  orphan: {
    label: 'órfã',
    tone: 'danger',
    explain: () =>
      'Não há título da direção certa (débito casa com a pagar; crédito, com a receber) na mesma moeda e em aberto. Provável tarifa, imposto ou lançamento sem contrapartida — não vai casar sem um título novo.',
  },
  'amount-mismatch': {
    label: 'valor diverge',
    tone: 'warning',
    explain: (n) =>
      n
        ? `Há um título próximo, mas o valor diverge além da tolerância (Δ ${money(n.amountDeltaCents, n.currency)}).`
        : 'O valor diverge além da tolerância.',
  },
  'date-out-of-window': {
    label: 'data fora da janela',
    tone: 'warning',
    explain: (n) =>
      n
        ? `Há um título com o valor compatível, mas a data está fora da janela (${n.dateDeltaDays} dia${n.dateDeltaDays === 1 ? '' : 's'} de distância).`
        : 'A data está fora da janela tolerada.',
  },
  'below-threshold': {
    label: 'quase casou',
    tone: 'info',
    explain: (n) =>
      n
        ? `Um candidato passou nas tolerâncias de valor e data, mas o score (${confidence(n.score)}) ficou abaixo do limiar do tenant. A um ajuste de política ou a uma conferência humana.`
        : 'Um candidato ficou logo abaixo do limiar do tenant.',
  },
};

export function DivergenceList({
  divergences,
}: {
  divergences: readonly ClassifiedDivergence[];
}) {
  if (divergences.length === 0) {
    return (
      <EmptyState
        title="Nenhuma divergência"
        hint="Todo lançamento do período encontrou um título correspondente."
      />
    );
  }

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Lançamento no extrato</TH>
            <TH num>Valor</TH>
            <TH>Motivo</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {divergences.map((d) => (
            <DivergenceRow key={d.line.id} divergence={d} />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function DivergenceRow({ divergence }: { divergence: ClassifiedDivergence }) {
  const [aberto, setAberto] = useState(false);
  const { line, explanation } = divergence;
  const meta = REASON[explanation.reason];
  const painelId = `div-${line.id}`;

  return (
    <>
      <TR className="align-top transition-colors hover:bg-bos-elevated/30">
        <TD>
          <p className="text-bos-text">{line.description || '—'}</p>
          <p className="mt-1 text-xs text-bos-muted">
            {shortDate(line.postedAt)}
            {line.counterpartyName ? ` · ${line.counterpartyName}` : ''}
          </p>
          <SourceChip line={line} />
        </TD>
        <TD num className="whitespace-nowrap text-bos-text">
          {money(line.amountCents, line.currency)}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </TD>
        <TD className="text-right">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={painelId}
            className="text-[11px] text-bos-muted transition-colors hover:text-bos-text"
          >
            {aberto ? 'fechar' : 'detalhes'}
          </button>
        </TD>
      </TR>

      {aberto ? (
        <TR>
          <TD colSpan={4} className="bg-bos-elevated/20">
            <div id={painelId} className="grid gap-6 px-1 py-1 sm:grid-cols-2">
              <OriginalLine line={line} />
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-bos-text">Por que não casou</p>
                <p className="max-w-prose text-xs text-bos-muted">
                  {meta.explain(explanation.nearest)}
                </p>
                {explanation.nearest ? (
                  <div className="mt-1 rounded-md border border-bos-border p-2.5">
                    <p className="text-[11px] text-bos-muted">
                      título mais próximo · {explanation.nearest.kind === 'payable' ? 'a pagar' : 'a receber'}
                    </p>
                    <p className="text-sm text-bos-text">
                      {explanation.nearest.counterpartyName ?? 'Sem contraparte nomeada'}
                    </p>
                    <p className="font-mono text-[11px] text-bos-muted">
                      {explanation.nearest.externalRef}
                    </p>
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-bos-muted">valor do título</dt>
                      <dd className="tabular text-bos-text">
                        {money(explanation.nearest.amountCents, explanation.nearest.currency)}
                      </dd>
                      <dt className="text-bos-muted">Δ valor</dt>
                      <dd className="tabular text-bos-text">
                        {money(explanation.nearest.amountDeltaCents, explanation.nearest.currency)}
                      </dd>
                      <dt className="text-bos-muted">Δ data</dt>
                      <dd className="tabular text-bos-text">
                        {explanation.nearest.dateDeltaDays} dia
                        {explanation.nearest.dateDeltaDays === 1 ? '' : 's'}
                      </dd>
                      <dt className="text-bos-muted">score pela régua</dt>
                      <dd className="tabular text-bos-text">
                        {confidence(explanation.nearest.score)}
                      </dd>
                    </dl>
                  </div>
                ) : null}
              </div>
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// pedaços compartilhados
// -----------------------------------------------------------------------------

/** A conta bancária de origem da linha — o gap 1: em qual conta procurar. */
function SourceChip({ line }: { line: SourcedStatementLine }) {
  return (
    <p className="mt-1 text-[11px] text-bos-muted">
      conta:{' '}
      {line.source ? (
        <span className="text-bos-text">{line.source.accountRef}</span>
      ) : (
        <span className="italic">não identificada</span>
      )}
      {line.externalId ? <span className="ml-2 font-mono">{line.externalId}</span> : null}
    </p>
  );
}

/** O extrato original da linha — o que se abre para conferir. */
function OriginalLine({ line }: { line: SourcedStatementLine }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-bos-text">O extrato original</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-bos-muted">lançado em</dt>
        <dd className="text-bos-text">{shortDate(line.postedAt)}</dd>
        {line.valueDate ? (
          <>
            <dt className="text-bos-muted">data valor</dt>
            <dd className="text-bos-text">{shortDate(line.valueDate)}</dd>
          </>
        ) : null}
        <dt className="text-bos-muted">valor</dt>
        <dd className="tabular text-bos-text">{money(line.amountCents, line.currency)}</dd>
        <dt className="text-bos-muted">contraparte</dt>
        <dd className="text-bos-text">{line.counterpartyName ?? '—'}</dd>
        {line.counterpartyTaxId ? (
          <>
            <dt className="text-bos-muted">id fiscal</dt>
            <dd className="font-mono text-[11px] text-bos-text">{line.counterpartyTaxId}</dd>
          </>
        ) : null}
        <dt className="text-bos-muted">conta</dt>
        <dd className="text-bos-text">
          {line.source ? line.source.accountRef : 'não identificada'}
        </dd>
        {line.source ? (
          <>
            <dt className="text-bos-muted">período</dt>
            <dd className="text-bos-text">
              {shortDate(line.source.periodStart)} – {shortDate(line.source.periodEnd)}
            </dd>
          </>
        ) : null}
        {line.externalId ? (
          <>
            <dt className="text-bos-muted">id na origem</dt>
            <dd className="font-mono text-[11px] text-bos-text">{line.externalId}</dd>
          </>
        ) : null}
        {line.balanceAfterCents !== null && line.balanceAfterCents !== undefined ? (
          <>
            <dt className="text-bos-muted">saldo após</dt>
            <dd className="tabular text-bos-text">
              {money(line.balanceAfterCents, line.currency)}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
