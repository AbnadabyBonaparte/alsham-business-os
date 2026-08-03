'use client';

import { useState, useTransition } from 'react';

import {
  buildPreventiveQueue,
  canCancel,
  canComplete,
  canReopen,
  canStart,
  orderBoard,
} from '@alsham/maintenance';
import type { MntPriority } from '@alsham/maintenance';

import { completeOrder, moveOrder } from '@/app/mnt-actions';
import type { MntOrderRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  open: 'aberta',
  in_progress: 'em execução',
  done: 'concluída',
  cancelled: 'cancelada',
};

/** A fila da preventiva devida — calculada pelo PACOTE. */
export function PreventiveQueue({
  orders,
  today,
}: {
  orders: readonly MntOrderRow[];
  today: string;
}) {
  const fila = buildPreventiveQueue(orders, today, 30);
  if (fila.length === 0) return null;

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Preventivas devidas (30 dias)</h2>
      <p className="mt-1 text-xs text-bos-muted">
        A fila é calculada — gerar a ordem por relógio é futuro declarado: quem abre a próxima é você.
      </p>
      <div className="mt-3 flex flex-col gap-1">
        {fila.map((d) => (
          <p key={d.order.id} className="text-sm text-bos-text">
            <Badge tone={d.daysUntilDue < 0 ? 'danger' : 'warning'}>
              {d.daysUntilDue < 0 ? `atrasada há ${-d.daysUntilDue} dia(s)` : `em ${d.daysUntilDue} dia(s)`}
            </Badge>{' '}
            {d.order.title} — {d.order.target}
            <span className="text-xs text-bos-muted"> · devida em {shortDate(d.nextDueOn)}</span>
          </p>
        ))}
      </div>
    </Panel>
  );
}

/**
 * O quadro — ordenado pela prioridade DO TENANT, pelo pacote — agora TABELA DE
 * VERDADE (Mandato de Beleza). Cada ordem é uma LINHA de resumo: identidade,
 * tipo (corretiva/preventiva), situação e o alvo/data. As transições de status
 * — INCLUSIVE `done → in_progress` (a ordem concluída volta a andar: trabalho
 * tem identidade por serviço), a conclusão com relato e o histórico da ordem —
 * vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **Este componente não decide nada.** Se pode iniciar, concluir, reabrir ou
 * cancelar são perguntas feitas a `@alsham/maintenance`.
 */
export function MntBoard({
  orders,
  priorities,
  canManage,
  canCompletePerm,
}: {
  orders: readonly MntOrderRow[];
  priorities: readonly MntPriority[];
  canManage: boolean;
  canCompletePerm: boolean;
}) {
  if (orders.length === 0) {
    return (
      <EmptyState
        title="Nenhuma ordem no quadro"
        hint="Abra a primeira — corretiva responde à falha; preventiva antecipa, com recorrência."
      />
    );
  }

  const quadro = orderBoard(orders, priorities) as readonly MntOrderRow[];

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Ordem</TH>
            <TH>Tipo</TH>
            <TH>Situação</TH>
            <TH>Alvo</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {quadro.map((o) => (
            <MntRowItem
              key={o.id}
              order={o}
              priorities={priorities}
              canManage={canManage}
              canCompletePerm={canCompletePerm}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function MntRowItem({
  order: o,
  priorities,
  canManage,
  canCompletePerm,
}: {
  order: MntOrderRow;
  priorities: readonly MntPriority[];
  canManage: boolean;
  canCompletePerm: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [relato, setRelato] = useState('');
  const [custo, setCusto] = useState('');
  const [moeda, setMoeda] = useState('BRL');
  const [concluindo, setConcluindo] = useState(false);
  const [pending, startTransition] = useTransition();
  const painelId = `mnt-${o.id}`;

  const prioridade = priorities.find((p) => p.id === o.priorityId)?.name ?? null;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Falhou.');
      else {
        setConcluindo(false);
        setRelato('');
        setCusto('');
      }
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{o.title}</span>
          <span className="mt-0.5 block text-xs text-bos-muted">
            {prioridade ? prioridade : 'sem prioridade'}
            {o.recurrenceDays !== null ? ` · a cada ${o.recurrenceDays} dias` : ''}
          </span>
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone="neutral">{o.kind === 'corrective' ? 'corretiva' : 'preventiva'}</Badge>
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={o.status === 'done' ? 'success' : o.status === 'cancelled' ? 'neutral' : 'warning'}>
            {ROTULOS[o.status]}
          </Badge>
        </TD>
        <TD className="text-bos-muted">
          {o.target}
          <span className="mt-0.5 block text-[11px] text-bos-muted">aberta em {shortDate(o.createdAt)}</span>
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
          <TD colSpan={5} className="bg-bos-elevated/20">
            <div id={painelId} className="flex flex-col gap-3 px-1 py-1">
              <p className="text-sm text-bos-text">alvo: {o.target}</p>
              {o.description ? <p className="text-xs text-bos-muted">{o.description}</p> : null}
              {o.status === 'done' ? (
                <p className="text-xs text-bos-muted">
                  feito: {o.completionNote}
                  {o.costCents !== null && o.currency ? ` · custo ${money(o.costCents, o.currency)}` : ''}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {canManage && canStart(o.status) ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text"
                    onClick={() => run(() => moveOrder({ orderId: o.id, to: 'in_progress' }))}
                  >
                    Iniciar
                  </button>
                ) : null}
                {canManage && o.status === 'in_progress' ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text"
                    onClick={() => run(() => moveOrder({ orderId: o.id, to: 'open' }))}
                  >
                    Devolver à fila
                  </button>
                ) : null}
                {canCompletePerm && canComplete(o.status) ? (
                  <button
                    type="button"
                    className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
                    onClick={() => setConcluindo((v) => !v)}
                  >
                    Concluir…
                  </button>
                ) : null}
                {canManage && canReopen(o.status) ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-text"
                    onClick={() => run(() => moveOrder({ orderId: o.id, to: 'in_progress' }))}
                  >
                    Reabrir (o mesmo serviço)
                  </button>
                ) : null}
                {canCompletePerm && canCancel(o.status) ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md border border-bos-danger px-3 py-1.5 text-sm text-bos-danger"
                    onClick={() => run(() => moveOrder({ orderId: o.id, to: 'cancelled' }))}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>

              {concluindo ? (
                <div className="flex flex-wrap items-end gap-2 border-t border-bos-border pt-4">
                  <label className="grow text-xs text-bos-muted">
                    O que foi feito* (fica carimbado)
                    <input className={`${campo} w-full`} value={relato} onChange={(e) => setRelato(e.target.value)} />
                  </label>
                  <label className="text-xs text-bos-muted">
                    Custo (opcional)
                    <span className="flex gap-2">
                      <input className={campo} inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="180,00" />
                      <input className="w-16 rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text" value={moeda} onChange={(e) => setMoeda(e.target.value.toUpperCase())} />
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60"
                    onClick={() =>
                      run(() =>
                        completeOrder({
                          orderId: o.id,
                          completionNote: relato,
                          costCents: custo.trim() === '' ? null : Math.round(Number(custo.replace(',', '.')) * 100),
                          currency: custo.trim() === '' ? null : moeda,
                        }),
                      )
                    }
                  >
                    Confirmar conclusão
                  </button>
                </div>
              ) : null}

              {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}
