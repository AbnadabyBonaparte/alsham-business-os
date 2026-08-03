'use client';

import { useState, useTransition } from 'react';

import {
  canClose,
  canEditTicket,
  canInteract,
  canReopen,
  canResolve,
  canStart,
  isOverdue,
  orderTickets,
} from '@alsham/care';
import type { CareCategory, CarePriority, Interaction } from '@alsham/care';

import { moveTicket, recordInteraction } from '@/app/care-actions';
import type { TicketRow } from '@/lib/data';
import { stamp } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * O balcão — agora TABELA DE VERDADE (Mandato de Beleza). Ordenado pela
 * prioridade DO TENANT, pelo pacote (`orderTickets`). Cada caso é uma LINHA de
 * resumo: assunto/solicitante, prioridade, status e abertura. A conversa
 * (interações eternas) e as ações de ciclo — atender, resolver, reabrir e
 * fechar — vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **A TERCEIRA identidade.** `resolved → open` REABRE o MESMO caso (o pedido
 * é o mesmo), mas `closed` é TERMINAL. Quem decide isso é `@alsham/care`
 * (`canReopen`/`canClose`) — a tela só oferece o botão que o pacote autoriza.
 *
 * ⭐ **A conversa é imutável.** Não há "editar" interação: registrar é adicionar
 * uma linha eterna.
 */

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

const ROTULOS: Record<string, string> = {
  open: 'aberto',
  in_progress: 'em andamento',
  resolved: 'resolvido',
  closed: 'fechado',
};

export function CareQueue({
  tickets,
  categories,
  priorities,
  interactions,
  now,
  canManage,
  canResolvePerm,
}: {
  tickets: readonly TicketRow[];
  categories: readonly CareCategory[];
  priorities: readonly CarePriority[];
  interactions: readonly Interaction[];
  now: string;
  canManage: boolean;
  canResolvePerm: boolean;
}) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        title="Nenhum caso no balcão"
        hint="Abra o primeiro caso — a fila se ordena pela prioridade que o tenant desenhou."
      />
    );
  }

  // ⭐ A ORDEM é do pacote — prioridade do tenant, prazo, chegada.
  const fila = orderTickets(tickets, priorities) as readonly TicketRow[];

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Caso</TH>
            <TH>Prioridade</TH>
            <TH>Status</TH>
            <TH>Aberto</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {fila.map((t) => (
            <TicketRowItem
              key={t.id}
              ticket={t}
              categories={categories}
              priorities={priorities}
              interactions={interactions.filter((i) => i.ticketId === t.id)}
              now={now}
              canManage={canManage}
              canResolvePerm={canResolvePerm}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function TicketRowItem({
  ticket: t,
  categories,
  priorities,
  interactions,
  now,
  canManage,
  canResolvePerm,
}: {
  ticket: TicketRow;
  categories: readonly CareCategory[];
  priorities: readonly CarePriority[];
  interactions: readonly Interaction[];
  now: string;
  canManage: boolean;
  canResolvePerm: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [fala, setFala] = useState('');
  const [canal, setCanal] = useState('');
  const [resolvendo, setResolvendo] = useState(false);
  const [pending, startTransition] = useTransition();

  const categoria = categories.find((c) => c.id === t.categoryId)?.name ?? null;
  const prioridade = priorities.find((p) => p.id === t.priorityId)?.name ?? null;
  const atrasado = isOverdue(t, now);
  const painelId = `care-${t.id}`;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Falhou.');
      else {
        setResolvendo(false);
        setNota('');
        setFala('');
        setCanal('');
      }
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{t.subject}</span>
          <span className="mt-0.5 block text-xs text-bos-muted">
            {t.requesterName}
            {t.requesterContact ? ` · ${t.requesterContact}` : ''}
            {categoria ? ` · ${categoria}` : ''}
          </span>
        </TD>
        <TD className="whitespace-nowrap">
          {prioridade ? <Badge tone="danger">{prioridade}</Badge> : <span className="text-bos-muted">—</span>}
          {atrasado ? <span className="ml-1"><Badge tone="danger">atrasado</Badge></span> : null}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={t.status === 'resolved' ? 'success' : t.status === 'closed' ? 'neutral' : 'warning'}>
            {ROTULOS[t.status]}
          </Badge>
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">{stamp(t.createdAt)}</TD>
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
              {t.description ? <p className="max-w-2xl text-sm text-bos-text">{t.description}</p> : null}

              {t.status === 'resolved' && t.resolutionNote ? (
                <p className="text-xs text-bos-muted">resolução: {t.resolutionNote}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {canManage && canStart(t.status) ? (
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'in_progress' }))}>
                    Atender
                  </button>
                ) : null}
                {canManage && t.status === 'in_progress' ? (
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'open' }))}>
                    Devolver à fila
                  </button>
                ) : null}
                {canResolvePerm && canResolve(t.status) ? (
                  <button type="button" className={botao} onClick={() => setResolvendo((v) => !v)}>
                    Resolver…
                  </button>
                ) : null}
                {canManage && canReopen(t.status) ? (
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'open' }))}>
                    Reabrir (o mesmo caso)
                  </button>
                ) : null}
                {canResolvePerm && canClose(t.status) ? (
                  <button type="button" disabled={pending} className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger transition-colors hover:bg-bos-danger hover:text-bos-bg" onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'closed' }))}>
                    Fechar de vez
                  </button>
                ) : null}
              </div>

              {resolvendo ? (
                <div className="flex flex-wrap items-end gap-2 border-t border-bos-border pt-2">
                  <label className="grow text-xs text-bos-muted">
                    Nota de resolução (fica carimbada)
                    <input className={`${campo} w-full`} value={nota} onChange={(e) => setNota(e.target.value)} />
                  </label>
                  <button type="button" disabled={pending} className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg disabled:opacity-60" onClick={() => run(() => moveTicket({ ticketId: t.id, to: 'resolved', resolutionNote: nota }))}>
                    Confirmar resolução
                  </button>
                </div>
              ) : null}

              {interactions.length > 0 ? (
                <div className="border-t border-bos-border pt-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-bos-muted">Conversa (eterna)</p>
                  {interactions.map((i) => (
                    <p key={i.id} className="mt-1 text-xs text-bos-text">
                      <span className="text-bos-muted">{stamp(i.occurredAt)}{i.channel ? ` · ${i.channel}` : ''} — </span>
                      {i.body}
                    </p>
                  ))}
                </div>
              ) : null}

              {canManage && canInteract(t.status) && canEditTicket(t.status) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input className={`${campo} grow`} placeholder="registrar interação (eterna)" value={fala} onChange={(e) => setFala(e.target.value)} />
                  <input className={`${campo} w-28`} placeholder="canal" value={canal} onChange={(e) => setCanal(e.target.value)} />
                  <button type="button" disabled={pending} className={botao} onClick={() => run(() => recordInteraction({ ticketId: t.id, body: fala, channel: canal }))}>
                    Registrar
                  </button>
                </div>
              ) : null}

              {erro ? <p role="alert" className="text-sm text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text transition-colors hover:border-bos-accent';
