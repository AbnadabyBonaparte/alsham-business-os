'use client';

import { useState } from 'react';

import type { ApprovalItem } from '@alsham/finance-reconciliation';

import { decideApprovalAction } from '@/app/actions';
import { ageInDays, money, stamp } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { DecideButtons } from '@/components/decide-buttons';

/**
 * A fila de aprovação — a mesa do diretor, agora digital.
 *
 * O que muda em relação à pilha de papel: cada item tem **estado, dono, idade
 * e trilha**. Nada fica embaixo de outra coisa, e a decisão emite
 * `recon.approval.decided` na caixa de saída do Core, na mesma transação
 * (trigger em `0002_recon.sql`).
 *
 * ⭐ Este componente **não tem alçada**. Não existe aqui "acima de X exige dois
 * diretores" — isso é `settings.approval.*` do tenant, e modelar o organograma
 * de uma empresa dentro do produto é exatamente o viés que a Lei 2 proíbe. A
 * tela mostra o valor; quem decide é gente.
 */
export function ApprovalQueue({
  items,
  canDecide,
  nowMs,
}: {
  items: readonly ApprovalItem[];
  canDecide: boolean;
  /** "Agora" vem do servidor, uma vez — componente não lê relógio (evita hidratação divergente). */
  nowMs: number;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nada aguardando visto"
        hint="Quando uma conciliação precisar de aprovação humana, ela aparece aqui — com quem pediu, quanto e há quanto tempo espera."
      />
    );
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-bos-border">
        {items.map((item) => (
          <ApprovalRow key={item.id} item={item} canDecide={canDecide} nowMs={nowMs} />
        ))}
      </ul>
    </Panel>
  );
}

function ApprovalRow({
  item,
  canDecide,
  nowMs,
}: {
  item: ApprovalItem;
  canDecide: boolean;
  nowMs: number;
}) {
  const [note, setNote] = useState('');
  const dias = ageInDays(item.requestedAt, nowMs);

  return (
    <li className="px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-bos-text">{item.title}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bos-muted">
            <span>pedido em {stamp(item.requestedAt)}</span>
            <span aria-hidden>·</span>
            {/* A IDADE é o que a pilha de papel escondia. Quanto mais velho,
                mais alto o alarme — mas nunca em ouro. */}
            <Badge tone={dias >= 3 ? 'danger' : dias >= 1 ? 'warning' : 'neutral'}>
              {dias === 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`}
            </Badge>
            <span aria-hidden>·</span>
            <span className="font-mono text-[11px]">{item.subjectType}</span>
          </div>

          {canDecide ? (
            <label className="mt-3 block max-w-lg">
              <span className="sr-only">Observação da decisão</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Observação (opcional) — fica na trilha"
                className="w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-xs text-bos-text placeholder:text-bos-muted focus:border-bos-accent focus:outline-none"
              />
            </label>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-3">
          {item.amountCents !== null && item.amountCents !== undefined ? (
            <span className="tabular font-display text-lg text-bos-text">
              {money(item.amountCents, item.currency ?? 'BRL')}
            </span>
          ) : null}

          <DecideButtons
            confirmLabel="Aprovar"
            rejectLabel="Rejeitar"
            disabled={!canDecide}
            disabledHint="Requer recon.approval.decide"
            question={(choice) =>
              choice === 'confirm'
                ? `Aprovar “${item.title}”? A decisão fica na trilha com o seu nome e não pode ser desfeita — só corrigida por uma nova decisão.`
                : `Rejeitar “${item.title}”? A decisão fica na trilha com o seu nome.`
            }
            onDecide={(choice) =>
              decideApprovalAction(
                item.id,
                choice === 'confirm' ? 'approved' : 'rejected',
                note.trim() || undefined,
              )
            }
          />
        </div>
      </div>
    </li>
  );
}
