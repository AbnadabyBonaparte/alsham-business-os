import type { ReactNode } from 'react';

import { TERRITORY_ICON, TERRITORY_ICON_FALLBACK } from '@/lib/domain-icons';

/**
 * ⭐ **O CABEÇALHO DE DOMÍNIO — o mesmo em toda parte** (Mandato de Beleza 1/6).
 *
 * A Store já agrupava por território (pequeno-caps + nome + fio dourado); o
 * Painel repetia uma parede de linhas sem seção. Esta é a peça COMPARTILHADA:
 * um glifo de TRAÇO do domínio + a etiqueta da camada + o nome + o fio, na
 * mesma gramática. A Store e o Painel consomem daqui — uma fonte só (Sol Único),
 * nunca dois cabeçalhos que envelhecem separados.
 *
 * ⛔ Ícone é TRAÇO inline (geometria em `domain-icons.tsx`, zero dependência,
 * zero emoji — IDENTIDADE-VISUAL §6). O ouro entra só como acento do glifo e do
 * fio; o resto é a paleta sóbria.
 */

/** O glifo do território — a geometria de `domain-icons.tsx` dentro do `<svg>` padrão. */
export function DomainGlyph({
  territoryKey,
  className = 'size-4',
}: {
  territoryKey: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TERRITORY_ICON[territoryKey] ?? TERRITORY_ICON_FALLBACK}
    </svg>
  );
}

/**
 * O cabeçalho de uma seção de território: glifo + etiqueta da camada
 * (Domínio/Vertical) + nome, fechado por um fio `--bos-border`. À direita, um
 * slot livre (a contagem de módulos, por exemplo).
 */
export function DomainSectionHeader({
  territoryKey,
  layerLabel,
  name,
  right,
}: {
  territoryKey: string;
  layerLabel: string;
  name: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-bos-border pb-2">
      <div className="flex items-center gap-2.5">
        <DomainGlyph territoryKey={territoryKey} className="size-4 shrink-0 text-bos-accent/70" />
        <div>
          <p className="bos-eyebrow mb-1">{layerLabel}</p>
          <h3 className="font-display text-lg leading-none text-bos-text">{name}</h3>
        </div>
      </div>
      {right ? <span className="shrink-0 text-xs text-bos-muted">{right}</span> : null}
    </div>
  );
}
