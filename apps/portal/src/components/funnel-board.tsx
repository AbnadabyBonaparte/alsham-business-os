'use client';

import { useState, useTransition } from 'react';

import { buildFunnelBoard, canClose, isPastExpectedClose } from '@alsham/deals';
import type { FunnelStage, Opportunity } from '@alsham/deals';

import { closeOpportunity, moveOpportunity } from '@/app/deal-actions';
import { money } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

/**
 * O quadro do funil — as colunas são os estágios DO TENANT, montadas por
 * `buildFunnelBoard()` no pacote. A tela não filtra negociação por estágio à
 * mão: encerrada não entra em coluna nenhuma, e é o pacote quem sabe disso.
 */
export function FunnelBoard({
  stages,
  opportunities,
  today,
  canManage,
  canDecide,
}: {
  stages: readonly FunnelStage[];
  opportunities: readonly Opportunity[];
  today: string;
  canManage: boolean;
  canDecide: boolean;
}) {
  const colunas = buildFunnelBoard(stages, opportunities);

  if (stages.length === 0) {
    return (
      <EmptyState
        title="Este funil ainda não tem estágios"
        hint="Desenhe os estágios acima — eles são seus: nome livre, ordem livre."
      />
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {colunas.map((col) => (
        <div key={col.stage.id} className="w-72 shrink-0">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-sm font-medium text-bos-text">{col.stage.name}</h3>
            <span className="text-xs text-bos-muted tabular">{col.opportunities.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {col.opportunities.map((o) => (
              <OpportunityCard
                key={o.id}
                opportunity={o}
                stages={stages}
                today={today}
                canManage={canManage}
                canDecide={canDecide}
              />
            ))}
            {col.opportunities.length === 0 ? (
              <div className="rounded-md border border-dashed border-bos-border px-3 py-4 text-center text-xs text-bos-muted">
                vazio
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function OpportunityCard({
  opportunity,
  stages,
  today,
  canManage,
  canDecide,
}: {
  opportunity: Opportunity;
  stages: readonly FunnelStage[];
  today: string;
  canManage: boolean;
  canDecide: boolean;
}) {
  const [losing, setLosing] = useState(false);
  const [razao, setRazao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setErro(r.message ?? 'Falha');
      else {
        setLosing(false);
        setRazao('');
      }
    });
  }

  return (
    <Panel className="px-4 py-3">
      <p className="text-sm font-medium text-bos-text">{opportunity.title}</p>
      {opportunity.partyName ? (
        <p className="text-xs text-bos-muted">{opportunity.partyName}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {opportunity.valueCents !== null && opportunity.currency !== null ? (
          <span className="text-xs text-bos-text tabular">
            {money(opportunity.valueCents, opportunity.currency)}
          </span>
        ) : null}
        {opportunity.probability !== null ? (
          <Badge tone="info">{opportunity.probability}%</Badge>
        ) : null}
        {isPastExpectedClose(opportunity, today) ? (
          <Badge tone="warning">expectativa vencida</Badge>
        ) : null}
        {opportunity.tags.map((t) => (
          <Badge key={t} tone="neutral">
            {t}
          </Badge>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {canManage ? (
          <select
            className="rounded-md border border-bos-border bg-bos-bg px-2 py-1 text-xs text-bos-text"
            value=""
            disabled={pending}
            onChange={(e) => {
              const destino = e.target.value;
              if (destino.length > 0) {
                run(() =>
                  moveOpportunity({ opportunityId: opportunity.id, toStageId: destino }),
                );
              }
            }}
          >
            <option value="">mover para…</option>
            {stages
              .filter((s) => s.id !== opportunity.currentStageId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        ) : null}
        {canDecide && canClose(opportunity.status) ? (
          <>
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-border px-2 py-1 text-xs text-bos-text hover:bg-bos-surface"
              onClick={() =>
                run(() =>
                  closeOpportunity({ opportunityId: opportunity.id, outcome: 'won', reason: razao }),
                )
              }
            >
              Ganhou
            </button>
            {losing ? (
              <span className="flex items-center gap-1">
                <input
                  className="w-36 rounded-md border border-bos-border bg-bos-bg px-2 py-1 text-xs text-bos-text"
                  placeholder="a razão da perda"
                  value={razao}
                  onChange={(e) => setRazao(e.target.value)}
                />
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-bos-border px-2 py-1 text-xs text-bos-danger"
                  onClick={() =>
                    run(() =>
                      closeOpportunity({
                        opportunityId: opportunity.id,
                        outcome: 'lost',
                        reason: razao,
                      }),
                    )
                  }
                >
                  Confirmar
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="rounded-md border border-bos-border px-2 py-1 text-xs text-bos-muted hover:text-bos-text"
                onClick={() => setLosing(true)}
              >
                Perdeu…
              </button>
            )}
          </>
        ) : null}
      </div>
      {erro ? <p className="mt-1 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
