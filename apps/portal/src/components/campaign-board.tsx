'use client';

import { useState, useTransition } from 'react';

import type { Campaign, CampaignStatus, TransitionVerdict } from '@alsham/marketing';

import { changeCampaignStatus } from '@/app/marketing-actions';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A carteira de campanhas — agora TABELA DE VERDADE (Mandato de Beleza). Cada
 * campanha é uma LINHA de resumo: nome, verba prevista, situação e agenda. A
 * descrição, o público, o estado da verba e as transições de estado vivem numa
 * LINHA EXPANSÍVEL.
 *
 * ⭐ **Este componente não decide nada.** Ele recebe, para cada campanha, o
 * veredito que `planTransition()` já produziu no servidor — inclusive a
 * MENSAGEM de recusa. Se a regra mudar no pacote, esta tela muda junto.
 *
 * Ação de estado tem **confirmação explícita em dois passos** (padrão CRIVO):
 * publicar e cancelar põem evento na caixa de saída do Core — não são cliques
 * baratos.
 */

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ROTULO: Record<CampaignStatus, string> = {
  draft: 'rascunho',
  scheduled: 'agendada',
  published: 'no ar',
  completed: 'encerrada',
  cancelled: 'cancelada',
};

const TOM: Record<CampaignStatus, Tone> = {
  draft: 'neutral',
  scheduled: 'info',
  published: 'success',
  completed: 'neutral',
  cancelled: 'danger',
};

const VERBA: Record<Campaign['budgetStatus'], { label: string; tone: Tone }> = {
  none: { label: 'sem resposta do financeiro', tone: 'neutral' },
  pending: { label: 'verba em análise', tone: 'warning' },
  approved: { label: 'verba aprovada', tone: 'success' },
  rejected: { label: 'verba reprovada', tone: 'danger' },
};

/** O que cada estado oferece como próximo passo, com o rótulo humano. */
const PROXIMOS: Partial<Record<CampaignStatus, { to: CampaignStatus; label: string }[]>> = {
  draft: [
    { to: 'scheduled', label: 'Agendar' },
    { to: 'published', label: 'Publicar' },
    { to: 'cancelled', label: 'Cancelar' },
  ],
  scheduled: [
    { to: 'published', label: 'Publicar' },
    { to: 'draft', label: 'Voltar a rascunho' },
    { to: 'cancelled', label: 'Cancelar' },
  ],
  published: [
    { to: 'completed', label: 'Encerrar' },
    { to: 'cancelled', label: 'Cancelar' },
  ],
};

/** O que a confirmação diz que vai acontecer. Nunca um "tem certeza?" vago. */
const CONSEQUENCIA: Partial<Record<CampaignStatus, string>> = {
  published: 'A campanha vai ao ar e o Core registra marketing.campaign.published.',
  completed: 'A campanha é encerrada e o Core registra marketing.campaign.completed.',
  cancelled:
    'A campanha sai da operação e o Core registra marketing.campaign.cancelled. Ela não volta — some da operação, nunca da trilha.',
  scheduled: 'A campanha passa a ter data marcada. Nenhum evento é emitido.',
  draft: 'A campanha volta a rascunho. Nenhum evento é emitido.',
};

export interface CampaignRow {
  readonly campaign: Campaign;
  /** O veredito do motor, por destino possível. Vem pronto do servidor. */
  readonly verdicts: Readonly<Record<string, TransitionVerdict>>;
}

export function CampaignBoard({
  rows,
  canPublish,
}: {
  rows: readonly CampaignRow[];
  canPublish: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhuma campanha ainda"
        hint="Crie um rascunho acima. Rascunho não emite evento nem consome nada — é trabalho interno até você publicar."
      />
    );
  }

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Campanha</TH>
            <TH num>Verba</TH>
            <TH>Situação</TH>
            <TH>Agenda</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <CampaignRowItem key={row.campaign.id} row={row} canPublish={canPublish} />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function CampaignRowItem({ row, canPublish }: { row: CampaignRow; canPublish: boolean }) {
  const { campaign: c } = row;
  const [aberto, setAberto] = useState(false);
  const verba = VERBA[c.budgetStatus];
  const proximos = PROXIMOS[c.status] ?? [];
  const painelId = `campaign-${c.id}`;

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{c.name}</span>
          {c.audienceNote ? <span className="mt-0.5 block text-xs text-bos-muted">público: {c.audienceNote}</span> : null}
        </TD>
        <TD num className="whitespace-nowrap">
          {c.budgetPlannedCents !== null && c.currency ? (
            <span className="text-bos-text">{money(c.budgetPlannedCents, c.currency)}</span>
          ) : (
            <span className="text-bos-muted">—</span>
          )}
        </TD>
        <TD className="whitespace-nowrap">
          <Badge tone={TOM[c.status]}>{ROTULO[c.status]}</Badge>
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">
          {c.publishedAt ? <>no ar {shortDate(c.publishedAt)}</>
            : c.scheduledFor ? <>→ {shortDate(c.scheduledFor)}</>
            : c.completedAt ? <>fim {shortDate(c.completedAt)}</>
            : <span className="italic">—</span>}
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
              {c.description ? <p className="max-w-2xl text-sm text-bos-muted">{c.description}</p> : null}
              <p className="text-xs text-bos-muted">
                {c.scheduledFor ? <>agendada para {shortDate(c.scheduledFor)} · </> : null}
                {c.publishedAt ? <>no ar desde {shortDate(c.publishedAt)} · </> : null}
                {c.completedAt ? <>encerrada em {shortDate(c.completedAt)} · </> : null}
                {c.budgetPlannedCents !== null && c.currency
                  ? `verba prevista ${money(c.budgetPlannedCents, c.currency)}`
                  : 'sem verba declarada'}
              </p>

              {c.budgetRef ? (
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone={verba.tone}>{verba.label}</Badge>
                  <span className="font-mono text-[11px] text-bos-muted">{c.budgetRef}</span>
                </p>
              ) : null}

              {proximos.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-bos-border pt-2">
                  {proximos.map(({ to, label }) => (
                    <TransitionButton
                      key={to}
                      campaignId={c.id}
                      to={to}
                      label={label}
                      consequence={CONSEQUENCIA[to] ?? ''}
                      verdict={row.verdicts[to]}
                      canPublish={canPublish}
                    />
                  ))}
                </div>
              ) : (
                <p className="border-t border-bos-border pt-2 text-xs text-bos-muted">
                  Estado terminal: campanha {ROTULO[c.status]} não muda mais. Reabrir apagaria a fronteira
                  entre o que aconteceu e o que se quis que acontecesse.
                </p>
              )}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

/** Precisa de `marketing.campaign.publish`? Publicar, encerrar e cancelar precisam. */
const EXIGE_PUBLISH: ReadonlySet<CampaignStatus> = new Set<CampaignStatus>([
  'published',
  'completed',
  'cancelled',
]);

function TransitionButton({
  campaignId,
  to,
  label,
  consequence,
  verdict,
  canPublish,
}: {
  campaignId: string;
  to: CampaignStatus;
  label: string;
  consequence: string;
  verdict: TransitionVerdict | undefined;
  canPublish: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cortesia de interface. Quem IMPEDE de verdade é o trigger
  // `campaigns_guard_publish` no banco, provado no CI.
  if (EXIGE_PUBLISH.has(to) && !canPublish) {
    return (
      <span className="text-xs text-bos-muted" title="Falta marketing.campaign.publish">
        {label} — sem permissão
      </span>
    );
  }

  // O motor já recusou. Mostramos a razão DELE, palavra por palavra.
  if (verdict && !verdict.allowed) {
    return (
      <span className="text-xs text-bos-muted" title={verdict.refusal.message}>
        {label} — {verdict.refusal.message}
      </span>
    );
  }

  function confirmar() {
    setError(null);
    startTransition(async () => {
      const r = await changeCampaignStatus({ campaignId, to });
      if (!r.ok) setError(r.message);
      setArmed(false);
    });
  }

  if (armed) {
    return (
      <span className="flex flex-wrap items-center gap-2 rounded-md border border-bos-border bg-bos-elevated px-3 py-2">
        <span className="max-w-md text-xs text-bos-muted">{consequence}</span>
        <button
          type="button"
          onClick={confirmar}
          disabled={pending}
          className="rounded-md border border-bos-accent bg-bos-accent/20 px-3 py-1 text-xs text-bos-text transition-colors hover:bg-bos-accent/30 disabled:opacity-50"
        >
          {pending ? 'registrando…' : `Confirmar: ${label.toLowerCase()}`}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          disabled={pending}
          className="rounded-md border border-bos-border px-3 py-1 text-xs text-bos-muted transition-colors hover:text-bos-text"
        >
          Cancelar
        </button>
        {error ? <span className="text-xs text-bos-danger">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-md border border-bos-border px-3 py-1 text-xs text-bos-text transition-colors hover:border-bos-accent"
      >
        {label}
      </button>
      {error ? <span className="text-xs text-bos-danger">{error}</span> : null}
    </span>
  );
}
