import type { ReactNode } from 'react';

/**
 * ⭐ **A TABELA DE VERDADE** (Mandato de Beleza 3/6).
 *
 * A pesquisa de mercado (Stripe/Linear/Vercel, 2026) é explícita: a tabela
 * reclama o trono, o gráfico decorativo sai de cena. Estas peças são o padrão
 * único de tabela do portal — para o Painel e, adiante, para as listagens dos
 * módulos (contratos, títulos, pedidos).
 *
 * As leis da tabela:
 * - **Número SEMPRE à direita, com tabular figures** (`num` → `text-right` +
 *   `.tabular` + `font-mono`, o token JetBrains Mono). Coluna de número que não
 *   alinha é ruído.
 * - **Altura de linha consistente** (~40px: `py-2.5`), densidade tipo Linear.
 * - **Gridlines DISCRETAS** — `--bos-border` em alpha baixo, nunca sólida.
 * - Zero cor nova; o realce de hover é só profundidade (`bos-elevated`).
 */

export function Table({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  // A tabela rola dentro do próprio contêiner — o corpo da página nunca rola
  // na horizontal (regra de responsividade).
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${className}`}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

/** O corpo, com as gridlines discretas entre linhas. */
export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-bos-border/60">{children}</tbody>;
}

export function TR({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tr className={className}>{children}</tr>;
}

/** Célula de cabeçalho. `num` alinha à direita (para colunas de número). */
export function TH({
  children,
  num = false,
  className = '',
}: {
  children?: ReactNode;
  num?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-bos-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-bos-muted ${
        num ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

/** Célula de corpo. `num` → direita + tabular + mono (a lei do número). */
export function TD({
  children,
  num = false,
  className = '',
  colSpan,
}: {
  children?: ReactNode;
  num?: boolean;
  className?: string;
  /** Para a linha de detalhe que atravessa a tabela inteira. */
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-3 py-2.5 align-middle ${
        num ? 'tabular text-right font-mono' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}
