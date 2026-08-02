'use client';

import { useState, useTransition } from 'react';

import { computeAllocations, isRuleComplete, orderCenters, sumBasisPoints } from '@alsham/cost-centers';

import {
  activateRule,
  addRuleLine,
  archiveRule,
  executeRateio,
  removeRuleLine,
  setCenterStatus,
} from '@/app/cc-actions';
import type { ByCenterRow, CenterRow, ExecutionRow, RuleRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

const campo = 'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';
const botao = 'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';

export function CcBoard({
  centers,
  rules,
  executions,
  byCenter,
  canManage,
  canDesign,
  canExecute,
}: {
  centers: readonly CenterRow[];
  rules: readonly RuleRow[];
  executions: readonly ExecutionRow[];
  byCenter: readonly ByCenterRow[];
  canManage: boolean;
  canDesign: boolean;
  canExecute: boolean;
}) {
  const centrosOrd = orderCenters(centers) as readonly CenterRow[];
  const nomePorId = new Map(centers.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-sm font-medium text-bos-text">Centros</h3>
        {centrosOrd.length === 0 ? (
          <EmptyState title="Nenhum centro ainda" hint="Cadastre o primeiro centro — por obra, cliente ou setor." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {centrosOrd.map((c) => (
              <CenterChip key={c.id} center={c} canManage={canManage} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-bos-text">Regras de rateio</h3>
        {rules.length === 0 ? (
          <EmptyState title="Nenhuma regra ainda" hint="Crie uma regra e some as linhas — ativar exige fechar 100%." />
        ) : (
          <div className="flex flex-col gap-3">
            {rules.map((r) => (
              <RuleCard
                key={r.id}
                rule={r}
                centers={centers}
                nomePorId={nomePorId}
                canDesign={canDesign}
                canExecute={canExecute}
              />
            ))}
          </div>
        )}
      </section>

      {byCenter.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium text-bos-text">Rateado por centro</h3>
          <Panel className="px-5 py-4">
            <Table>
              <THead>
                <TR>
                  <TH>Centro</TH>
                  <TH num>Rateado</TH>
                </TR>
              </THead>
              <TBody>
                {byCenter.map((b) => (
                  <TR key={`${b.centerId}-${b.currency}`} className="transition-colors hover:bg-bos-elevated/30">
                    <TD>{b.centerName}</TD>
                    <TD num>{money(b.allocatedCents, b.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Panel>
        </section>
      ) : null}

      {executions.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium text-bos-text">Execuções</h3>
          <Table>
            <THead>
              <TR>
                <TH>Regra</TH>
                <TH num>Total</TH>
                <TH>Origem</TH>
                <TH>Competência</TH>
              </TR>
            </THead>
            <TBody>
              {executions.map((e) => (
                <TR key={e.id} className="transition-colors hover:bg-bos-elevated/30">
                  <TD>{e.ruleName}</TD>
                  <TD num>{money(e.totalCents, e.currency)}</TD>
                  <TD>{e.sourceName || e.sourceKind}</TD>
                  <TD>{shortDate(e.competenceOn)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

function CenterChip({ center: c, canManage }: { center: CenterRow; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const viva = c.status === 'active';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-bos-border px-3 py-1 text-xs text-bos-text">
      {c.name}
      {!viva ? <Badge tone="neutral">arquivado</Badge> : null}
      {canManage ? (
        <button
          type="button"
          disabled={pending}
          className="text-bos-muted hover:text-bos-text"
          onClick={() =>
            startTransition(async () => {
              await setCenterStatus({ centerId: c.id, status: viva ? 'archived' : 'active' });
            })
          }
        >
          {viva ? 'arquivar' : 'devolver'}
        </button>
      ) : null}
    </span>
  );
}

function RuleCard({
  rule: r,
  centers,
  nomePorId,
  canDesign,
  canExecute,
}: {
  rule: RuleRow;
  centers: readonly CenterRow[];
  nomePorId: Map<string, string>;
  canDesign: boolean;
  canExecute: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [novoCentro, setNovoCentro] = useState('');
  const [novoPct, setNovoPct] = useState('');
  const [exec, setExec] = useState(false);
  const [total, setTotal] = useState('');
  const [origem, setOrigem] = useState('');
  const [comp, setComp] = useState('');
  const [pending, startTransition] = useTransition();

  const soma = sumBasisPoints(r.lines);
  const completa = isRuleComplete(r);
  const rascunho = r.status === 'draft';
  const ativos = centers.filter((c) => c.status === 'active');
  const usados = new Set(r.lines.map((l) => l.centerId));

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErro(res.message ?? 'Não deu.');
      else { setNovoCentro(''); setNovoPct(''); setExec(false); setTotal(''); setOrigem(''); setComp(''); }
    });
  }

  const previa = completa && total.trim() !== ''
    ? computeAllocations(Math.round(Number(total.replace(',', '.')) * 100) || 0, r.lines)
    : [];

  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-bos-text">{r.name}</p>
          <p className="mt-0.5 text-xs text-bos-muted">
            soma {(soma / 100).toFixed(2).replace('.', ',')}%
            {completa ? ' — fecha 100%' : ' — ainda não fecha'}
          </p>
        </div>
        <Badge tone={r.status === 'active' ? 'success' : r.status === 'draft' ? 'warning' : 'neutral'}>
          {r.status === 'active' ? 'ativa' : r.status === 'draft' ? 'rascunho' : 'arquivada'}
        </Badge>
      </div>

      <ul className="mt-3 flex flex-col gap-1">
        {r.lines.map((l) => (
          <li key={l.centerId} className="flex items-center justify-between gap-2 text-xs text-bos-text">
            <span>{nomePorId.get(l.centerId) ?? l.centerId} · {(l.basisPoints / 100).toFixed(2).replace('.', ',')}%</span>
            {canDesign && rascunho ? (
              <button type="button" disabled={pending} className="text-bos-muted hover:text-bos-danger"
                onClick={() => run(() => removeRuleLine({ ruleId: r.id, centerId: l.centerId }))}>
                tirar
              </button>
            ) : null}
          </li>
        ))}
        {r.lines.length === 0 ? <li className="text-xs text-bos-muted">Sem linhas ainda.</li> : null}
      </ul>

      {canDesign && rascunho ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className={campo} value={novoCentro} onChange={(e) => setNovoCentro(e.target.value)}>
            <option value="">centro…</option>
            {ativos.filter((c) => !usados.has(c.id)).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input className={campo + ' w-20'} inputMode="decimal" value={novoPct} onChange={(e) => setNovoPct(e.target.value)} placeholder="%" />
          <button type="button" disabled={pending || !novoCentro || !novoPct} className={botao}
            onClick={() => run(() => addRuleLine({ ruleId: r.id, centerId: novoCentro, percent: Number(novoPct.replace(',', '.')) }))}>
            somar linha
          </button>
          <button type="button" disabled={pending} className={botao}
            onClick={() => run(() => activateRule({ ruleId: r.id }))}>
            Ativar — fecha 100%
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canExecute && r.status === 'active' && !exec ? (
          <button type="button" className={botao} onClick={() => setExec(true)}>Executar rateio…</button>
        ) : null}
        {canDesign && r.status === 'active' ? (
          <button type="button" disabled={pending} className={botaoNeutro}
            onClick={() => run(() => archiveRule({ ruleId: r.id }))}>
            Arquivar
          </button>
        ) : null}
      </div>

      {exec ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-bos-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className={campo + ' w-28'} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="total (BRL)" />
            <input className={campo} value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="de onde vem (aluguel…)" />
            <input className={campo} type="date" value={comp} onChange={(e) => setComp(e.target.value)} />
            <button type="button" disabled={pending} className={botao}
              onClick={() => run(() => executeRateio({ ruleId: r.id, sourceKind: 'manual', sourceName: origem, total, currency: 'BRL', competenceOn: comp, note: '' }))}>
              Ratear — no livro
            </button>
            <button type="button" className={botaoNeutro} onClick={() => setExec(false)}>Cancelar</button>
          </div>
          {previa.length > 0 ? (
            <p className="text-xs text-bos-muted">
              prévia: {previa.map((s) => `${nomePorId.get(s.centerId) ?? s.centerId} ${money(s.amountCents, 'BRL')}`).join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-xs text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
