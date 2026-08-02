import type { ReactNode } from 'react';

import { humanizeAction } from '@/lib/timeline-humanize';
import type { TimelineIcon } from '@/lib/timeline-humanize';
import type { AuditRow } from '@/lib/data/panel-port';
import { Badge } from '@/components/states';

/**
 * ⭐ A LINHA DO TEMPO (Onda UX Viva) — a trilha real como timeline, não log cru.
 *
 * Mesma fonte de dado (a trilha do tenant, `core.audit_log`, sob RLS) — só a
 * apresentação muda: um fio vertical, um nó por fato, ícone de TRAÇO por
 * categoria de verbo, e a glosa humana ao lado da `action` crua (que continua
 * visível — Lei 7: a tela ajuda a ler, não substitui o fato).
 *
 * Ícones: SVG de traço inline (geometria Lucide, MIT), no idioma do portal —
 * zero emoji, zero raster, zero dependência nova.
 */

const ICON: Record<TimelineIcon, ReactNode> = {
  created: <path d="M12 5v14M5 12h14" />,
  updated: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  closed: (
    <>
      <rect x="3" y="4.5" width="18" height="4" rx="1" />
      <path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M9.5 12.5h5" />
    </>
  ),
  reopened: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
    </>
  ),
  decided: (
    <>
      <path d="M9 12l2 2 4-4" />
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z" />
    </>
  ),
  moved: <path d="M4 12h14M13 6l6 6-6 6" />,
  removed: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>
  ),
  neutral: <circle cx="12" cy="12" r="3.2" />,
};

export function EventTimeline({ linhas }: { linhas: readonly AuditRow[] }) {
  return (
    <ol className="mt-4">
      {linhas.map((l, i) => {
        const { phrase, icon } = humanizeAction(l.action);
        const ultimo = i === linhas.length - 1;
        return (
          <li key={l.id} className="relative flex gap-3 pb-4 last:pb-0">
            {/* o fio vertical — some no último nó */}
            {!ultimo ? (
              <span aria-hidden className="absolute top-7 left-[13px] h-[calc(100%-1rem)] w-px bg-bos-border" />
            ) : null}
            {/* o nó com o ícone de traço */}
            <span className="relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-bos-border bg-bos-surface">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-3.5 text-bos-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ICON[icon]}
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm text-bos-text">{phrase}</span>
                {l.moduleId !== null ? (
                  <span className="font-mono text-[11px] text-bos-muted">{l.moduleId}</span>
                ) : null}
                {l.actorKind !== 'user' ? <Badge tone="neutral">{l.actorKind}</Badge> : null}
                <time
                  dateTime={l.occurredAt}
                  className="ml-auto shrink-0 font-mono text-[11px] text-bos-muted"
                >
                  {l.occurredAt.slice(0, 16).replace('T', ' ')}
                </time>
              </div>
              {/* a `action` crua + o recurso — a precisão que a glosa resume */}
              <p className="mt-0.5 truncate font-mono text-[11px] text-bos-muted">
                {l.action} · {l.resourceType}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
