'use client';

import { useState, useTransition } from 'react';

import { canActivate, canCancel, canClose, canReport, currentValue, orderGoals } from '@alsham/goals';
import type { GoalCheckin } from '@alsham/goals';

import { activateGoal, cancelGoal, closeGoal, reportCheckin } from '@/app/goal-actions';
import type { GoalRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * O placar — agora TABELA DE VERDADE (Mandato de Beleza). Ordenado pelo PACOTE
 * (`orderGoals`): ativas que vencem primeiro. Cada meta é uma LINHA de resumo:
 * ambição/métrica, último valor, situação e prazo. Os check-ins, ativar, fechar
 * a época e cancelar vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **O progresso é VIEW** — `currentValue` devolve o ÚLTIMO check-in do livro,
 * nunca uma coluna. ⭐ **Fechar a época EXIGE ≥1 check-in** — sem número na mesa
 * é achismo, e quem barra é o pacote/o banco.
 */

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
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Meta</TH>
            <TH num>Último</TH>
            <TH>Situação</TH>
            <TH>Prazo</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {placar.map((g) => (
            <GoalRowItem
              key={g.id}
              goal={g}
              checkins={checkins.filter((c) => c.goalId === g.id)}
              canManage={canManage}
              canReportPerm={canReportPerm}
              canDecide={canDecide}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function GoalRowItem({
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
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');
  const [razao, setRazao] = useState('');
  const [fechando, setFechando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [pending, startTransition] = useTransition();

  // ⭐ O progresso é do PACOTE — o último check-in do livro.
  const ultimo = currentValue(g, checkins);
  const viva = g.status === 'active';
  const painelId = `goal-${g.id}`;

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

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{g.title}</span>
          <span className="mt-0.5 block text-xs text-bos-muted">{g.metric}</span>
        </TD>
        <TD num className="whitespace-nowrap">
          {ultimo !== null ? <span className="text-bos-text">{numero(ultimo, g.currency)}</span> : <span className="text-bos-muted">—</span>}
        </TD>
        <TD className="whitespace-nowrap">
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
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">{shortDate(g.endsOn)}</TD>
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
          <TD colSpan={5} className="bg-bos-elevated/20">
            <div id={painelId} className="flex flex-col gap-3 px-1 py-1">
              <p className="text-xs text-bos-muted">
                {shortDate(g.startsOn)} → {shortDate(g.endsOn)}
                {g.targetValue !== null ? <> · alvo {numero(g.targetValue, g.currency)}</> : <> · sem alvo declarado</>}
                {ultimo !== null ? (
                  <> · último <span className="text-bos-text">{numero(ultimo, g.currency)}</span> ({checkins.length} check-in(s))</>
                ) : (
                  <> · sem check-in — e sem check-in não se fecha época</>
                )}
                {g.status === 'cancelled' ? <> · razão: {g.cancelReason}</> : null}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {canManage && canActivate(g.status) ? (
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => activateGoal({ goalId: g.id }))}>
                    Ativar — a trave congela
                  </button>
                ) : null}

                {canReportPerm && viva && canReport(g.status) ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <input className={campo} placeholder="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                    <input className={campo} placeholder="nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
                    <button type="button" disabled={pending} className={botao} onClick={() => run(() => reportCheckin({ goalId: g.id, reportedValue: Number(valor.replace(',', '.')), note: nota }))}>
                      Check-in
                    </button>
                  </span>
                ) : null}

                {canDecide && canClose(g.status) && !fechando && !cancelando ? (
                  <button type="button" className={botaoNeutro} onClick={() => setFechando(true)}>Fechar a época…</button>
                ) : null}
                {canDecide && canCancel(g.status) && !cancelando && !fechando ? (
                  <button type="button" className={botaoNeutro} onClick={() => setCancelando(true)}>Cancelar…</button>
                ) : null}
              </div>

              {fechando ? (
                <span className="flex flex-wrap items-center gap-2 border-t border-bos-border pt-2">
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => closeGoal({ goalId: g.id, outcome: 'achieved' }))}>
                    Batida — decisão sua, com número na mesa
                  </button>
                  <button type="button" disabled={pending} className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger transition-colors hover:bg-bos-danger hover:text-bos-bg" onClick={() => run(() => closeGoal({ goalId: g.id, outcome: 'missed' }))}>
                    Perdida
                  </button>
                  <button type="button" className={botaoNeutro} onClick={() => setFechando(false)}>A época continua</button>
                </span>
              ) : null}

              {cancelando ? (
                <span className="flex flex-wrap items-center gap-2 border-t border-bos-border pt-2">
                  <input className={campo} placeholder="a razão — a ambição desistida também é história" value={razao} onChange={(e) => setRazao(e.target.value)} />
                  <button type="button" disabled={pending} className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger transition-colors hover:bg-bos-danger hover:text-bos-bg" onClick={() => run(() => cancelGoal({ goalId: g.id, reason: razao }))}>
                    Cancelar de vez
                  </button>
                  <button type="button" className={botaoNeutro} onClick={() => setCancelando(false)}>Manter</button>
                </span>
              ) : null}

              {erro ? <p role="alert" className="text-xs text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text transition-colors hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted transition-colors hover:text-bos-text';
