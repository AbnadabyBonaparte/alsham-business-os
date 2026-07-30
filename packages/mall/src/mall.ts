import type {
  NewStoreInput,
  Problem,
  Store,
  StoreStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 38 — Gestão de Lojistas.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0053_mall.sql`; o pacote avisa antes, com a MESMA
 * régua.
 */

/**
 * ⭐ Espelho de `mall.allowed_transition()` no `0053_mall.sql` — há teste que
 * lê a migration e compara. `active ↔ archived`: o lojista é relação
 * comercial que volta (o DIVERGE do hr, onde terminated é terminal).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [StoreStatus, StoreStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransition(from: StoreStatus, to: StoreStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchive(status: StoreStatus): boolean {
  return canTransition(status, 'archived');
}

export function canReopen(status: StoreStatus): boolean {
  return canTransition(status, 'active');
}

/** O mapa de lojistas: ativos primeiro, arquivados por último. */
export function orderStores(stores: readonly Store[]): readonly Store[] {
  const peso = (s: StoreStatus): number => (s === 'active' ? 0 : 1);
  return [...stores].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.storeName.localeCompare(b.storeName);
  });
}

export interface MallSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export function summarizeStores(stores: readonly Store[]): MallSummary {
  let active = 0;
  let archived = 0;
  for (const s of stores) {
    if (s.status === 'active') active += 1;
    else archived += 1;
  }
  return { total: stores.length, active, archived };
}

const NOME_MAX = 200;
const SEGMENTO_MAX = 120;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um lojista novo. Nome e segmento são obrigatórios; a unidade física
 * (id solto ao spc) é opcional — o lojista pode ser cadastrado antes de a
 * unidade estar definida.
 */
export function validateNewStore(input: NewStoreInput): Validation<Store> {
  const problems: Problem[] = [];

  const storeName = texto(input.storeName);
  if (storeName === null) {
    problems.push({ field: 'storeName', message: 'Informe o nome da loja.' });
  } else if (storeName.length > NOME_MAX) {
    problems.push({ field: 'storeName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  const segment = texto(input.segment);
  if (segment === null) {
    problems.push({ field: 'segment', message: 'Informe o segmento da loja.' });
  } else if (segment.length > SEGMENTO_MAX) {
    problems.push({ field: 'segment', message: `Segmento com no máximo ${SEGMENTO_MAX} caracteres.` });
  }

  const spaceId = texto(input.spaceId);
  const spaceName = texto(input.spaceName) ?? '';

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      storeName: storeName!,
      segment: segment!,
      spaceId,
      spaceName,
      status: 'active',
    },
  };
}
