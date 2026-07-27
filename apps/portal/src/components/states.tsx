import type { ReactNode } from 'react';

/**
 * Os estados que todo mundo esquece — e que o CRIVO cobra.
 *
 * Lista vazia com tela branca, erro que derruba a página e carregamento que
 * congela não são "detalhe de polimento": são a diferença entre um sistema e
 * uma demonstração. Ficam num arquivo só para que a próxima tela não tenha
 * desculpa para não usá-los.
 *
 * Cores: **o ouro nunca aparece aqui**. Estado é `--bos-danger`, `--bos-warning`,
 * `--bos-success` — o Imperial Gold é do sistema (IDENTIDADE-VISUAL §2).
 */

/** Cabeçalho de seção. Serifa no título, grotesque no apoio (§4). */
export function SectionHeader({
  title,
  subtitle,
  aside,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-bos-text">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-bos-muted">{subtitle}</p> : null}
      </div>
      {aside}
    </div>
  );
}

/** Superfície elevada padrão: Midnight Ink com borda alpha dourada a 15%. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-bos-border bg-bos-surface ${className}`}>
      {children}
    </section>
  );
}

/** Estado vazio desenhado — nunca tela branca. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Panel className="blueprint px-6 py-16 text-center">
      <p className="font-display text-lg text-bos-text">{title}</p>
      {hint ? <p className="mx-auto mt-2 max-w-md text-sm text-bos-muted">{hint}</p> : null}
    </Panel>
  );
}

/** Erro de carregamento com mensagem — nunca crash, nunca stack na cara. */
export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <Panel className="border-bos-danger/40 px-6 py-10">
      <p className="font-display text-lg text-bos-text">{title}</p>
      {detail ? <p className="mt-2 max-w-2xl text-sm text-bos-muted">{detail}</p> : null}
      <p className="mt-4 text-xs text-bos-muted">
        Nada foi alterado. Recarregue a página; se persistir, leve esta mensagem ao suporte.
      </p>
    </Panel>
  );
}

/** Skeleton — pulso lento, sem brilho de SaaS genérico. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Panel className="divide-y divide-bos-border" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="bos-skeleton h-3 w-1/4 rounded" />
          <div className="bos-skeleton h-3 w-1/3 rounded" />
          <div className="bos-skeleton ml-auto h-3 w-24 rounded" />
        </div>
      ))}
    </Panel>
  );
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE: Record<Tone, string> = {
  // Dessaturadas de propósito (IDENTIDADE-VISUAL §2). Nenhuma usa o ouro.
  success: 'border-bos-success/50 bg-bos-success/15 text-bos-text',
  warning: 'border-bos-warning/50 bg-bos-warning/15 text-bos-text',
  danger: 'border-bos-danger/50 bg-bos-danger/20 text-bos-text',
  info: 'border-bos-info/50 bg-bos-info/15 text-bos-text',
  neutral: 'border-bos-border bg-bos-elevated text-bos-muted',
};

/** Selo de estado. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Aviso de que o painel está em modo de demonstração. Honestidade na tela. */
export function DemoNotice() {
  return (
    <div className="mb-6 rounded-lg border border-bos-info/50 bg-bos-info/10 px-4 py-3 text-sm text-bos-text">
      <strong className="font-medium">Modo de demonstração.</strong>{' '}
      <span className="text-bos-muted">
        Sem <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> configurada, os dados
        são fabricados e anônimos, e nenhuma decisão é gravada. A tela é a mesma que roda com o banco.
      </span>
    </div>
  );
}
