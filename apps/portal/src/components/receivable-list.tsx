'use client';

import { useState, useTransition } from 'react';

import { canCancel, isOverdue, outstandingCents, overpaidCents } from '@alsham/accounts-receivable';
import type { ReceivableStatus } from '@alsham/accounts-receivable';

import { cancelReceivable } from '@/app/ar-actions';
import type { ReceivableRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A lista de títulos a receber — o rosto do Módulo 5, agora TABELA DE VERDADE
 * (Mandato de Beleza, Bloco Financeiro): valor e saldo à direita com tabular
 * figures; o detalhe e a ação de cancelar (dois passos — CRIVO) numa linha
 * expansível.
 *
 * ⭐ **Este componente não decide nada.** Vencido, saldo e excedente são
 * perguntas a `@alsham/accounts-receivable`. Se alguém calcular
 * `amount - received` aqui, o excedente (recebimento a maior) voltaria NEGATIVO
 * — justo o que o pacote evita.
 */

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ROTULO: Record<ReceivableStatus, string> = {
  open: 'em aberto',
  partially_received: 'recebido em parte',
  received: 'recebido',
  cancelled: 'cancelado',
};

const TOM: Record<ReceivableStatus, Tone> = {
  open: 'info',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'neutral',
};

export function ReceivableList({
  rows,
  canCancelReceivables,
  today,
}: {
  rows: readonly ReceivableRow[];
  canCancelReceivables: boolean;
  /** `AAAA-MM-DD`, resolvido UMA vez na página. Componente não lê relógio. */
  today: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhum título a receber registrado"
        hint="Registre o primeiro acima. Cada título registrado é contado ao resto da plataforma — este módulo não escuta ninguém e funciona inteiro sozinho."
      />
    );
  }

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Pagador</TH>
            <TH>Vence</TH>
            <TH num>Valor</TH>
            <TH num>Saldo</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {rows.map((t) => (
            <ReceivableRowItem
              key={t.id}
              titulo={t}
              canCancelReceivables={canCancelReceivables}
              today={today}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function ReceivableRowItem({
  titulo,
  canCancelReceivables,
  today,
}: {
  titulo: ReceivableRow;
  canCancelReceivables: boolean;
  today: string;
}) {
  const [aberto, setAberto] = useState(false);
  const vencido = isOverdue(titulo, today);
  const saldo = outstandingCents(titulo);
  const excedente = overpaidCents(titulo);
  const podeCancelar = canCancel(titulo.status);
  const painelId = `rec-${titulo.id}`;

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{titulo.payerName ?? 'Sem pagador nomeado'}</span>
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
            {excedente > 0 ? <Badge tone="warning">recebido a maior</Badge> : null}
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
                {money(titulo.amountCents, titulo.currency)} a receber
                {titulo.receivedAmountCents > 0 ? (
                  <> · {money(titulo.receivedAmountCents, titulo.currency)} recebido</>
                ) : null}
                {titulo.settlementMethod ? <> · por {titulo.settlementMethod}</> : null}
              </p>
              {titulo.counterpartyTaxId ? (
                <p className="font-mono text-[11px] text-bos-muted">{titulo.counterpartyTaxId}</p>
              ) : null}

              {/* ⭐ O excedente aparece EM VOZ ALTA — a divergência do módulo
                  chegando à tela. Um excedente invisível é um número que não bate
                  e ninguém sabe por quê. */}
              {excedente > 0 ? (
                <p className="max-w-2xl text-xs text-bos-muted">
                  Entrou{' '}
                  <strong className="text-bos-text">{money(excedente, titulo.currency)}</strong> a
                  mais do que o devido. Não é erro: o pagador pode ter arredondado, incluído
                  encargos ou quitado mais de um documento numa transferência só. O excedente é
                  crédito dele — e o que fazer com ele é a capacidade <em>Cobrança</em>, que não
                  está construída.
                </p>
              ) : null}

              <div className="border-t border-bos-border pt-3">
                {podeCancelar ? (
                  <CancelButton
                    receivableId={titulo.id}
                    canCancelReceivables={canCancelReceivables}
                  />
                ) : (
                  <p className="max-w-2xl text-xs text-bos-muted">
                    {titulo.status === 'cancelled'
                      ? 'Título cancelado. Ele continua aqui e continua no banco — cancelar é estado, nunca apagar. Se voltarem a dever, é documento novo, com referência nova.'
                      : 'Título recebido não se cancela: o dinheiro entrou na conta, e cancelar apagaria a fronteira entre "não tínhamos a receber" e "recebemos". Estorne o recebimento primeiro, e cancele depois.'}
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
  receivableId,
  canCancelReceivables,
}: {
  receivableId: string;
  canCancelReceivables: boolean;
}) {
  const [armado, setArmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cortesia de interface. Quem IMPEDE de verdade é o trigger
  // `ar.guard_status_transition()` no banco, provado no CI.
  if (!canCancelReceivables) {
    return (
      <span className="text-xs text-bos-muted" title="Falta ar.receivable.cancel">
        Cancelar exige a permissão <code className="font-mono">ar.receivable.cancel</code>.
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
        <code className="font-mono">ar.receivable.cancelled</code>. Ele{' '}
        <strong className="text-bos-text">não é apagado</strong>: continua na lista e no banco.
        Cancelado não volta.
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
              const r = await cancelReceivable({ receivableId });
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
