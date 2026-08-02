'use client';

import { useState, useTransition } from 'react';

import { canCancel, isOverdue, outstandingCents } from '@alsham/accounts-payable';
import type { PayableStatus } from '@alsham/accounts-payable';

import { cancelPayable } from '@/app/ap-actions';
import type { PayableRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A lista de títulos a pagar — o rosto do Módulo 3, agora TABELA DE VERDADE
 * (Mandato de Beleza, Bloco Financeiro): valor e saldo à direita com tabular
 * figures, colunas alinhadas linha a linha. O detalhe e a ação destrutiva
 * (cancelar, em dois passos — padrão CRIVO) vivem numa LINHA EXPANSÍVEL, para a
 * densidade da tabela conviver com a prosa que a decisão exige.
 *
 * ⭐ **Este componente não decide nada.** Vencido, saldo e se pode cancelar são
 * perguntas a `@alsham/accounts-payable`. Se alguém escrever `t.dueDate < hoje`
 * aqui, a regra passa a existir em dois lugares que vão divergir.
 */

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ROTULO: Record<PayableStatus, string> = {
  open: 'em aberto',
  partially_settled: 'liquidado em parte',
  settled: 'liquidado',
  cancelled: 'cancelado',
};

const TOM: Record<PayableStatus, Tone> = {
  open: 'info',
  partially_settled: 'warning',
  settled: 'success',
  cancelled: 'neutral',
};

export function PayableList({
  rows,
  canCancelPayables,
  today,
}: {
  rows: readonly PayableRow[];
  canCancelPayables: boolean;
  /** `AAAA-MM-DD`, resolvido UMA vez na página. Componente não lê relógio. */
  today: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhum título registrado"
        hint="Registre o primeiro acima. Cada título registrado é contado ao resto da plataforma — se o módulo de conciliação estiver instalado, ele aparece lá sozinho, sem ninguém redigitar."
      />
    );
  }

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Fornecedor</TH>
            <TH>Vence</TH>
            <TH num>Valor</TH>
            <TH num>Saldo</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {rows.map((t) => (
            <PayableRowItem
              key={t.id}
              titulo={t}
              canCancelPayables={canCancelPayables}
              today={today}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function PayableRowItem({
  titulo,
  canCancelPayables,
  today,
}: {
  titulo: PayableRow;
  canCancelPayables: boolean;
  today: string;
}) {
  const [aberto, setAberto] = useState(false);
  const vencido = isOverdue(titulo, today);
  const saldo = outstandingCents(titulo);
  const podeCancelar = canCancel(titulo.status);
  const painelId = `pay-${titulo.id}`;

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{titulo.supplierName ?? 'Sem fornecedor nomeado'}</span>
          <span className="ml-2 font-mono text-[11px] text-bos-muted">{titulo.externalRef}</span>
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">{shortDate(titulo.dueDate)}</TD>
        <TD num className="whitespace-nowrap text-bos-text">
          {money(titulo.amountCents, titulo.currency)}
        </TD>
        <TD num className="whitespace-nowrap text-bos-muted">
          {money(saldo, titulo.currency)}
        </TD>
        <TD className="whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <Badge tone={TOM[titulo.status]}>{ROTULO[titulo.status]}</Badge>
            {vencido ? <Badge tone="danger">vencido</Badge> : null}
          </span>
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
            <div id={painelId} className="flex flex-col gap-3 px-1 py-1">
              {titulo.description ? (
                <p className="max-w-2xl text-sm text-bos-muted">{titulo.description}</p>
              ) : null}
              <p className="text-xs text-bos-muted">
                {money(titulo.amountCents, titulo.currency)} devido
                {titulo.settledAmountCents > 0 ? (
                  <> · {money(titulo.settledAmountCents, titulo.currency)} liquidado</>
                ) : null}
                {titulo.paymentMethod ? <> · por {titulo.paymentMethod}</> : null}
              </p>
              {titulo.counterpartyTaxId ? (
                <p className="font-mono text-[11px] text-bos-muted">{titulo.counterpartyTaxId}</p>
              ) : null}

              <div className="border-t border-bos-border pt-3">
                {podeCancelar ? (
                  <CancelButton payableId={titulo.id} canCancelPayables={canCancelPayables} />
                ) : (
                  <p className="max-w-2xl text-xs text-bos-muted">
                    {titulo.status === 'cancelled'
                      ? 'Título cancelado. Ele continua aqui e continua no banco — cancelar é estado, nunca apagar. Se voltarmos a dever, é documento novo, com referência nova.'
                      : 'Título liquidado não se cancela: apagaria a fronteira entre "não devíamos isso" e "pagamos isso". Estorne o pagamento primeiro, e cancele depois.'}
                  </p>
                )}
              </div>
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

function CancelButton({
  payableId,
  canCancelPayables,
}: {
  payableId: string;
  canCancelPayables: boolean;
}) {
  const [armado, setArmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cortesia de interface. Quem IMPEDE de verdade é o trigger
  // `ap.guard_status_transition()` no banco, provado no CI.
  if (!canCancelPayables) {
    return (
      <span className="text-xs text-bos-muted" title="Falta ap.payable.cancel">
        Cancelar exige a permissão <code className="font-mono">ap.payable.cancel</code>.
      </span>
    );
  }

  if (!armado) {
    return (
      <button
        type="button"
        onClick={() => setArmado(true)}
        className="rounded-md border border-bos-danger/50 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-danger/15"
      >
        Cancelar título
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-2xl text-xs text-bos-muted">
        O título passa a <strong className="text-bos-text">cancelado</strong> e o Core registra{' '}
        <code className="font-mono">ap.payable.cancelled</code>. Ele{' '}
        <strong className="text-bos-text">não é apagado</strong>: continua na lista e no banco,
        e quem o projetou em outro módulo recebe o novo estado. Cancelado não volta.
      </p>

      {erro ? (
        <p role="alert" className="text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErro(null);
            startTransition(async () => {
              const r = await cancelPayable({ payableId });
              if (!r.ok) {
                setErro(r.message);
                return;
              }
              setArmado(false);
            });
          }}
          className="rounded-md border border-bos-danger bg-bos-danger/20 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-danger/30 disabled:opacity-50"
        >
          {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmado(false);
            setErro(null);
          }}
          className="text-xs text-bos-muted transition-colors hover:text-bos-text"
        >
          Não cancelar
        </button>
      </div>
    </div>
  );
}
