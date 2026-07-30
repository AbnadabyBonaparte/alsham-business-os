'use client';

import { useState, useTransition } from 'react';

import { orderHoldings } from '@alsham/investments';

import { registerMovement, setHoldingStatus } from '@/app/invest-actions';
import type { HoldingRow, PositionRow } from '@/lib/data';
import { money } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';

const campo = 'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';
const botao = 'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';

export function InvestBoard({
  holdings,
  positions,
  canManage,
  canRegister,
}: {
  holdings: readonly HoldingRow[];
  positions: readonly PositionRow[];
  canManage: boolean;
  canRegister: boolean;
}) {
  const ordenados = orderHoldings(holdings) as readonly HoldingRow[];
  const posPorId = new Map(positions.map((p) => [p.holdingId, p]));

  if (ordenados.length === 0) {
    return <EmptyState title="Nenhum investimento ainda" hint="Cadastre o primeiro — nome, tipo e moeda. A posição vem dos atos." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {ordenados.map((h) => (
        <HoldingCard key={h.id} holding={h} position={posPorId.get(h.id) ?? null} canManage={canManage} canRegister={canRegister} />
      ))}
    </div>
  );
}

function HoldingCard({
  holding: h,
  position,
  canManage,
  canRegister,
}: {
  holding: HoldingRow;
  position: PositionRow | null;
  canManage: boolean;
  canRegister: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [lanc, setLanc] = useState(false);
  const [tipo, setTipo] = useState<'application' | 'yield' | 'redemption'>('application');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [nota, setNota] = useState('');
  const [pending, startTransition] = useTransition();

  const viva = h.status === 'active';
  const pos = position?.positionCents ?? 0;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErro(res.message ?? 'Não deu.');
      else { setLanc(false); setValor(''); setData(''); setNota(''); }
    });
  }

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-bos-text">
            {h.name}
            {!viva ? <span className="ml-2"><Badge tone="neutral">arquivado</Badge></span> : null}
          </p>
          <p className="mt-0.5 text-xs text-bos-muted">
            {[h.kind, h.institution].filter(Boolean).join(' · ') || 'sem tipo'} · {h.currency}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-bos-text">{money(pos, h.currency)}</p>
          {position ? (
            <p className="text-xs text-bos-muted">
              aplicado {money(position.investedCents, h.currency)} · rendimento {money(position.yieldCents, h.currency)}
            </p>
          ) : <p className="text-xs text-bos-muted">sem atos ainda</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canRegister && viva && !lanc ? (
          <button type="button" className={botao} onClick={() => setLanc(true)}>Registrar ato…</button>
        ) : null}
        {canManage ? (
          <button
            type="button"
            disabled={pending}
            className={botaoNeutro}
            onClick={() => run(() => setHoldingStatus({ holdingId: h.id, status: viva ? 'archived' : 'active' }))}
          >
            {viva ? 'arquivar' : 'devolver'}
          </button>
        ) : null}
      </div>

      {lanc ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-bos-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as 'application' | 'yield' | 'redemption')}>
              <option value="application">aplicação</option>
              <option value="yield">rendimento</option>
              <option value="redemption">resgate</option>
            </select>
            <input className={campo + ' w-28'} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="valor" />
            <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <input className={campo} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="nota (opcional)" />
            <button
              type="button"
              disabled={pending}
              className={botao}
              onClick={() =>
                run(() =>
                  registerMovement({ holdingId: h.id, kind: tipo, amount: valor, currency: h.currency, note: nota, occurredOn: data }),
                )
              }
            >
              Registrar — no livro
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setLanc(false)}>Cancelar</button>
          </div>
          {tipo === 'redemption' ? (
            <p className="text-xs text-bos-muted">O resgate não passa da posição atual ({money(pos, h.currency)}).</p>
          ) : null}
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
