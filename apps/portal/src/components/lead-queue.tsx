'use client';

import { useState, useTransition } from 'react';

import { canDiscard, canQualify, canReturnToQueue, canTake, orderQueue } from '@alsham/leads';

import { discardLead, moveLead, qualifyLead } from '@/app/lead-actions';
import type { LeadRow } from '@/lib/data';
import { shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A fila de leads — agora TABELA DE VERDADE (Mandato de Beleza, Bloco Comercial
 * & CRM). Cada lead é uma linha, **na ordem que o PACOTE decide** (`orderQueue`:
 * quem chegou primeiro, primeiro). Nome, origem, interesse e chegada à mostra;
 * as ações da fila viva (atender, devolver, qualificar com os vínculos soltos,
 * descartar com razão) vivem na LINHA EXPANSÍVEL.
 *
 * ⭐ **A tela não decide nada:** atender, qualificar e descartar são perguntas
 * a `@alsham/leads`; qualificar é TERMINAL e carimba os vínculos pela tela.
 */

const campo = 'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';
const botao = 'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';

const ROTULOS: Record<string, string> = {
  new: 'na fila',
  in_contact: 'em contato',
  qualified: 'qualificado',
  discarded: 'descartado',
};

function tom(status: string): 'warning' | 'info' | 'success' | 'neutral' {
  return status === 'new' ? 'warning' : status === 'in_contact' ? 'info' : status === 'qualified' ? 'success' : 'neutral';
}

export function LeadQueue({
  leads,
  canManage,
  canDecide,
}: {
  leads: readonly LeadRow[];
  canManage: boolean;
  canDecide: boolean;
}) {
  if (leads.length === 0) {
    return (
      <EmptyState
        title="A fila está vazia"
        hint="Registre o primeiro interesse — e a origem dele: é o dado que a fila existe para guardar."
      />
    );
  }

  const fila = orderQueue(leads) as readonly LeadRow[];

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Lead</TH>
            <TH>Interesse</TH>
            <TH>Chegou</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {fila.map((l) => (
            <LeadRowItem key={l.id} lead={l} canManage={canManage} canDecide={canDecide} />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function LeadRowItem({
  lead: l,
  canManage,
  canDecide,
}: {
  lead: LeadRow;
  canManage: boolean;
  canDecide: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [razao, setRazao] = useState('');
  const [descartando, setDescartando] = useState(false);
  const [qualificando, setQualificando] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [oppId, setOppId] = useState('');
  const [oppTitle, setOppTitle] = useState('');
  const [pending, startTransition] = useTransition();

  const painelId = `lead-${l.id}`;
  const vivo = l.status === 'new' || l.status === 'in_contact';

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setDescartando(false);
        setQualificando(false);
        setRazao('');
      }
    });
  }

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{l.name}</span>
          {l.source ? (
            <span className="mt-0.5 block text-xs text-bos-muted">veio de: {l.source}</span>
          ) : null}
        </TD>
        <TD className="text-bos-muted">
          {l.interest || 'interesse não anotado'}
          {l.contact ? <span className="block text-[11px]">{l.contact}</span> : null}
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">{shortDate(l.createdAt)}</TD>
        <TD className="whitespace-nowrap">
          <Badge tone={tom(l.status)}>{ROTULOS[l.status]}</Badge>
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
              {l.status === 'discarded' ? (
                <p className="text-xs text-bos-danger">razão do descarte: {l.discardReason}</p>
              ) : null}
              {l.status === 'qualified' ? (
                <p className="text-xs text-bos-muted">
                  {l.partyName ? `virou: ${l.partyName}` : 'qualificado'}
                  {l.opportunityTitle ? ` · negócio: ${l.opportunityTitle}` : ''}
                </p>
              ) : null}

              {vivo ? (
                <div className="flex flex-wrap items-center gap-2">
                  {canManage && canTake(l.status) ? (
                    <button type="button" disabled={pending} className={botao} onClick={() => run(() => moveLead({ leadId: l.id, to: 'in_contact' }))}>
                      Atender
                    </button>
                  ) : null}
                  {canManage && canReturnToQueue(l.status) ? (
                    <button type="button" disabled={pending} className={botaoNeutro} onClick={() => run(() => moveLead({ leadId: l.id, to: 'new' }))}>
                      Devolver à fila
                    </button>
                  ) : null}
                  {canDecide && canQualify(l.status) && !qualificando && !descartando ? (
                    <button type="button" className={botao} onClick={() => setQualificando(true)}>
                      Qualificar…
                    </button>
                  ) : null}
                  {canDecide && canDiscard(l.status) && !descartando && !qualificando ? (
                    <button type="button" className={botaoNeutro} onClick={() => setDescartando(true)}>
                      Descartar…
                    </button>
                  ) : null}

                  {qualificando ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <input className={campo} placeholder="id da contraparte (crm)" value={partyId} onChange={(e) => setPartyId(e.target.value)} />
                      <input className={campo} placeholder="nome carimbado" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
                      <input className={campo} placeholder="id do negócio (funil)" value={oppId} onChange={(e) => setOppId(e.target.value)} />
                      <input className={campo} placeholder="título carimbado" value={oppTitle} onChange={(e) => setOppTitle(e.target.value)} />
                      <button
                        type="button"
                        disabled={pending}
                        className={botao}
                        onClick={() =>
                          run(() =>
                            qualifyLead({
                              leadId: l.id,
                              partyId,
                              partyName,
                              opportunityId: oppId,
                              opportunityTitle: oppTitle,
                            }),
                          )
                        }
                      >
                        Qualificar — terminal
                      </button>
                      <button type="button" className={botaoNeutro} onClick={() => setQualificando(false)}>
                        Ainda não
                      </button>
                    </span>
                  ) : null}

                  {descartando ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <input
                        className={campo}
                        placeholder="a razão — a fila que apaga em silêncio esconde o funil"
                        value={razao}
                        onChange={(e) => setRazao(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg"
                        onClick={() => run(() => discardLead({ leadId: l.id, reason: razao }))}
                      >
                        Descartar de vez
                      </button>
                      <button type="button" className={botaoNeutro} onClick={() => setDescartando(false)}>
                        Manter na fila
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : null}

              {erro ? <p className="text-xs text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}
