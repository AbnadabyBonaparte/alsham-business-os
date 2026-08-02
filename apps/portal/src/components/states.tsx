import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

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
  eyebrow,
  aside,
}: {
  title: string;
  subtitle?: string;
  /** Rótulo institucional acima do título — o nome do módulo, a sala da casa. */
  eyebrow?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="bos-eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-[1.75rem] leading-tight tracking-tight text-bos-text">
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-bos-muted">{subtitle}</p> : null}
      </div>
      {aside}
    </div>
  );
}

/**
 * O hero de capítulo — o momento de apresentação das telas-vitrine.
 *
 * Gramática da casa: eyebrow com micro-régua, título serifa grande em
 * romano + `accent` em itálico dourado (via <em> — o ouro é acento, nunca
 * bloco), apoio em grotesque. Fecha num fio de ouro que acende no meio.
 */
export function PageHero({
  eyebrow,
  title,
  accent,
  subtitle,
  aside,
}: {
  eyebrow: string;
  title: string;
  /** A segunda linha, em itálico dourado — a alma da tela em uma frase. */
  accent?: string;
  subtitle?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-4 pb-7">
        <div>
          <p className="bos-eyebrow mb-3">{eyebrow}</p>
          <h1 className="bos-hero-title">
            {title}
            {accent ? (
              <>
                {' '}
                <em className="block text-[0.72em]">{accent}</em>
              </>
            ) : null}
          </h1>
          {subtitle ? <p className="mt-3 max-w-2xl text-sm text-bos-muted">{subtitle}</p> : null}
        </div>
        {aside ? <div className="pb-1">{aside}</div> : null}
      </div>
      <div className="bos-hairline" aria-hidden />
    </header>
  );
}

/** Superfície elevada padrão: Midnight Ink com borda alpha dourada a 15%
    e um chanfro de luz na borda superior — materialidade, não brilho. */
export function Panel({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  /** Só para ajustes de apresentação (ex.: `animationDelay` da cascata). */
  style?: CSSProperties;
}) {
  return (
    <section
      className={`bos-sheen rounded-lg border border-bos-border bg-bos-surface ${className}`}
      style={style}
    >
      {children}
    </section>
  );
}

/**
 * ⭐ Um CTA de VERDADE para um estado vazio (Onda UX Viva 4/6).
 *
 * ⚠️ **Lei 7 no botão:** só passe `action` quando o próximo passo for uma rota
 * REAL e alcançável — a Store, um formulário ancorado nesta mesma página. Se
 * não há ação que o usuário POSSA tomar aqui (falta um convite que só outra
 * pessoa envia, falta um teto de plano que só o dono declara), **não passe
 * `action`**: o silêncio honesto é melhor do que um botão que não resolve. Um
 * CTA decorativo é a Lei 7 com o sinal trocado.
 */
export interface EmptyAction {
  readonly label: string;
  /** Rota real (`/store`) ou âncora na própria página (`#novo`). Nunca `#`. */
  readonly href: string;
}

/** Estado vazio desenhado — nunca tela branca: moldura de cantoneiras,
    o Sol em opacidade mínima, serifa itálica. Composição, não ausência.
    Quando há um próximo passo real, ganha um CTA (ver `EmptyAction`). */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: EmptyAction;
}) {
  return (
    <Panel className="blueprint relative px-6 py-16 text-center">
      <span aria-hidden className="absolute top-3 left-3 h-4 w-4 border-t border-l border-bos-accent/30" />
      <span aria-hidden className="absolute top-3 right-3 h-4 w-4 border-t border-r border-bos-accent/30" />
      <span aria-hidden className="absolute bottom-3 left-3 h-4 w-4 border-b border-l border-bos-accent/30" />
      <span aria-hidden className="absolute right-3 bottom-3 h-4 w-4 border-b border-r border-bos-accent/30" />
      {/* A fagulha — não um segundo sol: o Sol é um por peça (§5.1). */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="bos-sun-breathe mx-auto mb-5 size-7 text-bos-accent/50"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.75"
      >
        <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
      </svg>
      <p className="font-display text-lg text-bos-text">{title}</p>
      {hint ? (
        <p className="mx-auto mt-2 max-w-md font-display text-sm italic text-bos-muted">{hint}</p>
      ) : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-bos-accent/60 bg-bos-accent/10 px-4 py-2 text-sm text-bos-text transition-colors duration-200 hover:border-bos-accent hover:bg-bos-accent/15 focus:outline-none focus-visible:ring-1 focus-visible:ring-bos-accent/60"
        >
          {action.label}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      ) : null}
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
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${TONE[tone]}`}
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
