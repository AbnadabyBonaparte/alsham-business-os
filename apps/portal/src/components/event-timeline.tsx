'use client';

import { useState, type ReactNode } from 'react';

import { humanizeAction } from '@/lib/timeline-humanize';
import type { TimelineIcon } from '@/lib/timeline-humanize';
import type { AuditRow } from '@/lib/data/panel-port';
import { Badge } from '@/components/states';

/**
 * ⭐ A LINHA DO TEMPO (Onda UX Viva 2/6 · colapsada no Mandato de Beleza 2/6).
 *
 * A trilha real como timeline — fio vertical, nó por fato, ícone de TRAÇO por
 * categoria de verbo, glosa humana ao lado da `action` crua (que segue visível
 * — Lei 7).
 *
 * ⭐ **Colapso honesto (Mandato de Beleza 2/6):** uma instalação em lote gera
 * dezenas de linhas idênticas (mesmo `action`, mesmo `resourceType`, na mesma
 * rajada de segundos) — verdade, mas ilegível. Sequências assim COLAPSAM em UMA
 * linha com contador ("84× · em lote"), **expansível** para revelar as N linhas
 * cruas por trás. O dado bruto nunca some — só a APRESENTAÇÃO agrupa (Lei 7).
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

// 3+ eventos iguais e seguidos, na mesma rajada, colapsam. A janela é larga o
// bastante para uma instalação em lote (segundos) e curta o bastante para não
// fundir dois fatos iguais de dias diferentes.
const COLAPSA_MIN = 3;
const COLAPSA_JANELA_MS = 30 * 60 * 1000;

interface Grupo {
  readonly rows: readonly AuditRow[];
  readonly collapsed: boolean;
}

/**
 * Agrupa a trilha (já ordenada) em blocos. Rows consecutivas com o MESMO
 * `action`+`resourceType`, adjacentes dentro da janela, formam um bloco; bloco
 * com ≥ `COLAPSA_MIN` linhas colapsa. Pura — testável, sem estado de tela.
 */
export function collapseTimeline(linhas: readonly AuditRow[]): Grupo[] {
  const grupos: Grupo[] = [];
  let atual: AuditRow[] = [];

  const fecha = () => {
    if (atual.length > 0) {
      grupos.push({ rows: atual, collapsed: atual.length >= COLAPSA_MIN });
      atual = [];
    }
  };

  for (const linha of linhas) {
    const anterior = atual[atual.length - 1];
    if (anterior === undefined) {
      atual = [linha];
      continue;
    }
    const mesmaAcao =
      linha.action === anterior.action && linha.resourceType === anterior.resourceType;
    const perto =
      Math.abs(
        new Date(anterior.occurredAt).getTime() - new Date(linha.occurredAt).getTime(),
      ) <= COLAPSA_JANELA_MS;
    if (mesmaAcao && perto) atual.push(linha);
    else {
      fecha();
      atual = [linha];
    }
  }
  fecha();
  return grupos;
}

/** O carimbo de tempo curto de uma linha — "AAAA-MM-DD HH:MM". */
function quando(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

export function EventTimeline({ linhas }: { linhas: readonly AuditRow[] }) {
  const grupos = collapseTimeline(linhas);

  // Achata em NÓS de topo: um bloco colapsado é 1 nó; um bloco solto vira 1 nó
  // por linha. Assim o fio vertical liga os nós na ordem certa.
  type No =
    | { readonly kind: 'row'; readonly row: AuditRow }
    | { readonly kind: 'group'; readonly rows: readonly AuditRow[] };
  const nos: No[] = [];
  for (const g of grupos) {
    if (g.collapsed) nos.push({ kind: 'group', rows: g.rows });
    else for (const row of g.rows) nos.push({ kind: 'row', row });
  }

  return (
    <ol className="mt-4">
      {nos.map((no, i) => {
        const ultimo = i === nos.length - 1;
        const chave =
          no.kind === 'row' ? no.row.id : `grp-${no.rows[0]?.id ?? i}-${no.rows.length}`;
        return (
          <li key={chave} className="relative flex gap-3 pb-4 last:pb-0">
            {!ultimo ? (
              <span
                aria-hidden
                className="absolute top-7 left-[13px] h-[calc(100%-1rem)] w-px bg-bos-border"
              />
            ) : null}
            {no.kind === 'row' ? <NoLinha row={no.row} /> : <NoGrupo rows={no.rows} />}
          </li>
        );
      })}
    </ol>
  );
}

/** O nó de traço com o ícone da categoria (ou um contador, no bloco colapsado). */
function Node({ icon, children }: { icon: TimelineIcon; children?: ReactNode }) {
  return (
    <span className="relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-bos-border bg-bos-surface">
      {children ?? (
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
      )}
    </span>
  );
}

/** Uma linha solta — o nó individual. */
function NoLinha({ row }: { row: AuditRow }) {
  const { phrase, icon } = humanizeAction(row.action);
  return (
    <>
      <Node icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm text-bos-text">{phrase}</span>
          {row.moduleId !== null ? (
            <span className="font-mono text-[11px] text-bos-muted">{row.moduleId}</span>
          ) : null}
          {row.actorKind !== 'user' ? <Badge tone="neutral">{row.actorKind}</Badge> : null}
          <time
            dateTime={row.occurredAt}
            className="ml-auto shrink-0 font-mono text-[11px] text-bos-muted"
          >
            {quando(row.occurredAt)}
          </time>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-bos-muted">
          {row.action} · {row.resourceType}
        </p>
      </div>
    </>
  );
}

/**
 * Um bloco colapsado — uma linha com contador, expansível para as N cruas.
 * O intervalo de tempo é o do primeiro ao último da rajada.
 */
function NoGrupo({ rows }: { rows: readonly AuditRow[] }) {
  const [aberto, setAberto] = useState(false);
  const primeiro = rows[0]!;
  const ultimo = rows[rows.length - 1]!;
  const { phrase, icon } = humanizeAction(primeiro.action);
  const n = rows.length;

  return (
    <>
      <Node icon={icon}>
        <span className="font-mono text-[11px] font-medium text-bos-accent">{n}</span>
      </Node>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm text-bos-text">{phrase}</span>
          <span className="text-xs text-bos-muted">· em lote</span>
          <Badge tone="neutral">{n}×</Badge>
          <time className="ml-auto shrink-0 font-mono text-[11px] text-bos-muted">
            {/* mesma janela: mostra o instante; se cruzar minutos, o intervalo */}
            {quando(ultimo.occurredAt) === quando(primeiro.occurredAt)
              ? quando(primeiro.occurredAt)
              : `${quando(ultimo.occurredAt)} — ${quando(primeiro.occurredAt).slice(11)}`}
          </time>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-bos-muted">
          {primeiro.action} · {primeiro.resourceType}
        </p>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="mt-1 text-[11px] text-bos-muted underline-offset-4 transition-colors hover:text-bos-text hover:underline"
        >
          {aberto ? 'ocultar as linhas' : `ver as ${n} linhas`}
        </button>

        {aberto ? (
          <ul className="mt-2 space-y-1.5 border-l border-bos-border pl-3">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-[11px] text-bos-muted">{r.action}</span>
                {r.moduleId !== null ? (
                  <span className="font-mono text-[11px] text-bos-muted">· {r.moduleId}</span>
                ) : null}
                <time
                  dateTime={r.occurredAt}
                  className="ml-auto shrink-0 font-mono text-[11px] text-bos-muted"
                >
                  {quando(r.occurredAt)}
                </time>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}
