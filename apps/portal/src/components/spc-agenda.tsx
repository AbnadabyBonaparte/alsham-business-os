'use client';

import { useState, useTransition } from 'react';

import { canCancel, orderAgenda } from '@alsham/spaces';
import type { Space } from '@alsham/spaces';

import { cancelReservation } from '@/app/spc-actions';
import type { ReservationRow } from '@/lib/data';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A agenda de reservas — agora TABELA DE VERDADE (Mandato de Beleza). É uma
 * LISTA ORDENADA de reservas, não uma grade espacial de calendário: cada
 * reserva é uma linha (espaço, período, finalidade, situação). O detalhe da
 * reserva e a ação de **cancelar — em dois passos, com razão obrigatória** —
 * vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **Este componente não decide nada.** A ordem é do PACOTE (`orderAgenda`),
 * quem pode cancelar é `canCancel`, e o conflito de período é recusado pela
 * constraint — nunca por um `if` de tela. ⭐⭐ Cancelar é DESTRUTIVO e LIBERA o
 * período SOZINHO: por isso a confirmação explícita, com a consequência escrita.
 * Reserva no PASSADO é permitida — a agenda não esconde o que já passou.
 */
export function SpcAgenda({
  reservations,
  spaces,
  canManage,
}: {
  reservations: readonly ReservationRow[];
  spaces: readonly Space[];
  canManage: boolean;
}) {
  if (reservations.length === 0) {
    return (
      <EmptyState
        title="Agenda vazia"
        hint="Reserve o primeiro período — o conflito é recusado pelo banco, nunca por sorte."
      />
    );
  }

  const agenda = orderAgenda(reservations) as readonly ReservationRow[];

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Espaço</TH>
            <TH>Período</TH>
            <TH>Finalidade</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {agenda.map((r) => (
            <ReservaRow key={r.id} reservation={r} spaces={spaces} canManage={canManage} />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function periodo(startsAt: string, endsAt: string): string {
  const f = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${f(startsAt)} → ${f(endsAt)}`;
}

function ReservaRow({
  reservation: r,
  spaces,
  canManage,
}: {
  reservation: ReservationRow;
  spaces: readonly Space[];
  canManage: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const painelId = `reserva-${r.id}`;

  const espaco = spaces.find((s) => s.id === r.spaceId)?.name ?? '—';
  const cancelada = r.status === 'cancelled';

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{espaco}</span>
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">{periodo(r.startsAt, r.endsAt)}</TD>
        <TD className="text-bos-muted">
          {r.purpose || 'sem finalidade — e sem finalidade também vale'}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={cancelada ? 'neutral' : 'info'}>{cancelada ? 'cancelada' : 'reservada'}</Badge>
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
              <div className="text-sm text-bos-muted">
                <p>
                  <span className="text-bos-text">{espaco}</span> · {periodo(r.startsAt, r.endsAt)}
                </p>
                <p className="mt-0.5">
                  {r.purpose || 'sem finalidade — e sem finalidade também vale'}
                </p>
                {cancelada ? (
                  <p className="mt-0.5">Cancelada: {r.cancelReason}</p>
                ) : null}
              </div>

              {canManage && canCancel(r.status) ? <CancelButton reservation={r} /> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

/**
 * O cancelamento — DESTRUTIVO, em dois passos, com razão obrigatória. Quem
 * IMPEDE de verdade é o pacote/banco; a tela só confirma com a consequência à
 * vista, no padrão CRIVO (armar → confirmar → não fazer nada).
 */
function CancelButton({ reservation: r }: { reservation: ReservationRow }) {
  const [armado, setArmado] = useState(false);
  const [razao, setRazao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!armado) {
    return (
      <button
        type="button"
        onClick={() => setArmado(true)}
        className="self-start rounded-md border border-bos-danger/50 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-danger/15"
      >
        Cancelar reserva…
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <p className="max-w-2xl text-xs text-bos-muted">
        A reserva é cancelada e o período que ela ocupava LIBERA sozinho — outra reserva pode entrar
        ali na hora. A reserva NÃO é apagada: continua na agenda como cancelada, com a razão à vista.
        Desmarcar sem porquê é agenda que se apaga; por isso a razão é obrigatória.
      </p>

      {erro ? (
        <p role="alert" className="text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}

      <input
        className="max-w-xl rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
        placeholder="a razão — desmarcar sem porquê é agenda que se apaga"
        value={razao}
        onChange={(e) => setRazao(e.target.value)}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErro(null);
            startTransition(async () => {
              const res = await cancelReservation({ reservationId: r.id, reason: razao });
              if (!res.ok) {
                setErro(res.message);
                return;
              }
              setArmado(false);
              setRazao('');
            });
          }}
          className="rounded-md border border-bos-danger px-3 py-1.5 text-xs text-bos-danger transition-colors hover:bg-bos-danger hover:text-bos-bg disabled:opacity-50"
        >
          {pending ? 'Cancelando…' : 'Cancelar de vez — o período libera sozinho'}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmado(false);
            setErro(null);
          }}
          className="text-xs text-bos-muted transition-colors hover:text-bos-text"
        >
          Não fazer nada
        </button>
      </div>
    </div>
  );
}
