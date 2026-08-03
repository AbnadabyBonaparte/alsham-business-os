'use client';

import { useState, useTransition } from 'react';

import { canCancel, canCheckIn, canCheckOut, canMarkNoShow, orderGate } from '@alsham/visits';

import { cancelVisit, checkInVisit, checkOutVisit, markNoShow } from '@/app/vis-actions';
import type { VisitRow } from '@/lib/data';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * O livro da portaria — agora TABELA DE VERDADE (Mandato de Beleza). Cada visita
 * é uma LINHA: quem veio, para quem, o carimbo de entrada e a situação. O detalhe
 * (razão, horários, documento) e TODAS as ações — chegar, sair, não veio,
 * desmarcar — vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **A visita é EVENTO DE PRESENÇA de MÃO ÚNICA:** não volta de fim nenhum —
 * não há "reabrir" nem "editar". Corrigir é registrar de novo, apontando o
 * errado. Este componente não decide nada: se pode chegar, sair, marcar não-veio
 * ou desmarcar são perguntas feitas a `@alsham/visits`. A ordem é do PACOTE
 * (`orderGate`): dentro, agendados, história.
 */

const ROTULOS: Record<string, string> = {
  scheduled: 'agendada',
  checked_in: 'no pátio',
  checked_out: 'saiu',
  no_show: 'não veio',
  cancelled: 'desmarcada',
};

function hora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VisGate({
  visits,
  canRegister,
  canSchedule,
}: {
  visits: readonly VisitRow[];
  canRegister: boolean;
  canSchedule: boolean;
}) {
  if (visits.length === 0) {
    return (
      <EmptyState
        title="O livro está em branco"
        hint="Registre a primeira entrada — o carimbo é do servidor, nunca do relógio da parede."
      />
    );
  }

  const livro = orderGate(visits) as readonly VisitRow[];

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Visitante</TH>
            <TH>Destino</TH>
            <TH>Entrada</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {livro.map((v) => (
            <VisitaRow key={v.id} visit={v} canRegister={canRegister} canSchedule={canSchedule} />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function VisitaRow({
  visit: v,
  canRegister,
  canSchedule,
}: {
  visit: VisitRow;
  canRegister: boolean;
  canSchedule: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [razao, setRazao] = useState('');
  const [desmarcando, setDesmarcando] = useState(false);
  const [pending, startTransition] = useTransition();
  const painelId = `vis-${v.id}`;

  const dentro = v.status === 'checked_in';

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setDesmarcando(false);
        setRazao('');
      }
    });
  }

  const tone = dentro
    ? 'info'
    : v.status === 'scheduled'
      ? 'warning'
      : v.status === 'checked_out'
        ? 'success'
        : 'neutral';

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{v.visitorName}</span>
          {v.reason ? (
            <span className="mt-0.5 block text-xs text-bos-muted">{v.reason}</span>
          ) : null}
        </TD>
        <TD className="text-bos-muted">{v.host}</TD>
        <TD className="whitespace-nowrap text-bos-muted">
          {v.checkedInAt
            ? hora(v.checkedInAt)
            : v.status === 'scheduled'
              ? `esperada ${hora(v.expectedAt)}`
              : '—'}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={tone}>{ROTULOS[v.status]}</Badge>
        </TD>
        <TD className="text-right">
          <button
            type="button"
            onClick={() => setAberto((x) => !x)}
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
                {v.status === 'scheduled' ? <>esperada {hora(v.expectedAt)}</> : null}
                {v.checkedInAt ? <>entrou {hora(v.checkedInAt)}</> : null}
                {v.checkedOutAt ? <> · saiu {hora(v.checkedOutAt)}</> : null}
                {v.status === 'cancelled' ? <>desmarcada: {v.cancelReason}</> : null}
                {v.visitorDocument ? <> · doc. {v.visitorDocument}</> : null}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {canRegister && canCheckIn(v.status) ? (
                  <button
                    type="button"
                    disabled={pending}
                    className={botao}
                    onClick={() => run(() => checkInVisit({ visitId: v.id }))}
                  >
                    Chegou — carimbar entrada
                  </button>
                ) : null}
                {canRegister && canCheckOut(v.status) ? (
                  <button
                    type="button"
                    disabled={pending}
                    className={botao}
                    onClick={() => run(() => checkOutVisit({ visitId: v.id }))}
                  >
                    Saiu — carimbar saída
                  </button>
                ) : null}
                {canRegister && canMarkNoShow(v.status) ? (
                  <button
                    type="button"
                    disabled={pending}
                    className={botaoNeutro}
                    onClick={() => run(() => markNoShow({ visitId: v.id }))}
                  >
                    Não veio
                  </button>
                ) : null}
                {canSchedule && canCancel(v.status) && !desmarcando ? (
                  <button type="button" className={botaoNeutro} onClick={() => setDesmarcando(true)}>
                    Desmarcar…
                  </button>
                ) : null}

                {desmarcando ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <input
                      className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
                      placeholder="a razão — agenda que se apaga em silêncio mente"
                      value={razao}
                      onChange={(e) => setRazao(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg"
                      onClick={() => run(() => cancelVisit({ visitId: v.id, reason: razao }))}
                    >
                      Desmarcar de vez
                    </button>
                    <button type="button" className={botaoNeutro} onClick={() => setDesmarcando(false)}>
                      Manter
                    </button>
                  </span>
                ) : null}
              </div>

              {erro ? <p className="text-xs text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
