'use client';

import { useState, useTransition } from 'react';

import { canActivate, canCancel, canClose, canReport, currentValue, orderGoals } from '@alsham/goals';
import type { GoalCheckin } from '@alsham/goals';

import { activateGoal, cancelGoal, closeGoal, reportCheckin } from '@/app/goal-actions';
import type { GoalRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  draft: 'rascunho',
  active: 'correndo',
  achieved: 'batida',
  missed: 'perdida',
  cancelled: 'cancelada',
};

function numero(v: number, currency: string | null): string {
  if (currency !== null) return money(Math.round(v * 100), currency);
  return v.toLocaleString('pt-BR');
}

/** O placar — ordenado pelo PACOTE: ativas que vencem primeiro. */
export function GoalBoard({
  goals,
  checkins,
  canManage,
  canReportPerm,
  canDecide,
}: {
  goals: readonly GoalRow[];
  checkins: readonly GoalCheckin[];
  canManage: boolean;
  canReportPerm: boolean;
  canDecide: boolean;
}) {
  if (goals.length === 0) {
    return (
      <EmptyState
        title="Nenhuma ambição declarada"
        hint="Declare a primeira meta — métrica em texto livre, alvo opcional. O placar começa no rascunho."
      />
    );
  }

  const placar = orderGoals(goals) as readonly GoalRow[];

  return (
    <div className="flex flex-col gap-3">
      {placar.map((g) => (
        <GoalCard
          key={g.id}
          goal={g}
          checkins={checkins}
          canManage={canManage}
          canReportPerm={canReportPerm}
          canDecide={canDecide}
        />
      ))}
    </div>
  );
}

function GoalCard({
  goal: g,
  checkins,
  canManage,
  canReportPerm,
  canDecide,
}: {
  goal: GoalRow;
  checkins: readonly GoalCheckin[];
  canManage: boolean;
  canReportPerm: boolean;
  canDecide: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');
  const [razao, setRazao] = useState('');
  const [fechando, setFechando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [pending, startTransition] = useTransition();

  // ⭐ O progresso é do PACOTE — o último check-in do livro.
  const ultimo = currentValue(g, checkins);
  const doLivro = checkins.filter((c) => c.goalId === g.id);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setFechando(false);
        setCancelando(false);
        setValor('');
        setNota('');
        setRazao('');
      }
    });
  }

  const viva = g.status === 'active';

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-bos-text">
            {g.title} <span className="text-xs text-bos-muted">· {g.metric}</span>
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            {shortDate(g.startsOn)} → {shortDate(g.endsOn)}
            {g.targetValue !== null ? <> · alvo {numero(g.targetValue, g.currency)}</> : <> · sem alvo declarado</>}
            {ultimo !== null ? (
              <> · último <span className="text-bos-text">{numero(ultimo, g.currency)}</span> ({doLivro.length} check-in(s))</>
            ) : (
              <> · sem check-in — e sem check-in não se fecha época</>
            )}
            {g.status === 'cancelled' ? <> · razão: {g.cancelReason}</> : null}
          </p>
        </div>
        <Badge
          tone={
            g.status === 'active' ? 'info'
            : g.status === 'achieved' ? 'success'
            : g.status === 'missed' ? 'danger'
            : g.status === 'draft' ? 'warning'
            : 'neutral'
          }
        >
          {ROTULOS[g.status]}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canManage && canActivate(g.status) ? (
          <button type="button" disabled={pending} className={botao} onClick={() => run(() => activateGoal({ goalId: g.id }))}>
            Ativar — a trave congela
          </button>
        ) : null}

        {canReportPerm && viva && canReport(g.status) ? (
          <span className="flex flex-wrap items-center gap-2">
            <input className={campo} placeholder="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            <input className={campo} placeholder="nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
            <button
              type="button"
              disabled={pending}
              className={botao}
              onClick={() => run(() => reportCheckin({ goalId: g.id, reportedValue: Number(valor.replace(',', '.')), note: nota }))}
            >
              Check-in
            </button>
          </span>
        ) : null}

        {canDecide && canClose(g.status) && !fechando && !cancelando ? (
          <button type="button" className={botaoNeutro} onClick={() => setFechando(true)}>
            Fechar a época…
          </button>
        ) : null}
        {canDecide && canCancel(g.status) && !cancelando && !fechando ? (
          <button type="button" className={botaoNeutro} onClick={() => setCancelando(true)}>
            Cancelar…
          </button>
        ) : null}

        {fechando ? (
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending} className={botao} onClick={() => run(() => closeGoal({ goalId: g.id, outcome: 'achieved' }))}>
              Batida — decisão sua, com número na mesa
            </button>
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg"
              onClick={() => run(() => closeGoal({ goalId: g.id, outcome: 'missed' }))}
            >
              Perdida
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setFechando(false)}>
              A época continua
            </button>
          </span>
        ) : null}

        {cancelando ? (
          <span className="flex flex-wrap items-center gap-2">
            <input
              className={campo}
              placeholder="a razão — a ambição desistida também é história"
              value={razao}
              onChange={(e) => setRazao(e.target.value)}
            />
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg"
              onClick={() => run(() => cancelGoal({ goalId: g.id, reason: razao }))}
            >
              Cancelar de vez
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setCancelando(false)}>
              Manter
            </button>
          </span>
        ) : null}
      </div>

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
