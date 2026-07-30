import type {
  AssetStatus,
  MediaAsset,
  MediaTag,
  MediaUsage,
  NewAssetInput,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 26 — Biblioteca de Mídia.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `media.allowed_transition()` no `0041_media.sql` — há teste
 * que lê a migration e compara. IDA E VOLTA de propósito: o DIVERGE
 * assinado do pat (a baixa do BEM é terminal; a OBRA que volta é a mesma,
 * e renascer partiria o histórico de uso em dois — o argumento do crm).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [AssetStatus, AssetStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransition(from: AssetStatus, to: AssetStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchive(status: AssetStatus): boolean {
  return canTransition(status, 'archived');
}

/** ⭐ O acervo devolve — o bem baixado do pat, não. */
export function canRestore(status: AssetStatus): boolean {
  return canTransition(status, 'active');
}

/** ⭐ Fora do acervo não se usa — a recusa com nome. */
export function whyCannotRecordUsage(asset: MediaAsset, usedIn: string): string | null {
  if (asset.status === 'archived') {
    return 'Ativo arquivado não recebe uso novo: devolva-o ao acervo para usar.';
  }
  if (usedIn.trim().length === 0) {
    return 'Em quê foi usado? O livro registra o destino, não só a data.';
  }
  return null;
}

/** Os usos de um ativo, na ordem do LIVRO (a sequência, nunca o relógio). */
export function usagesOf(asset: MediaAsset, usages: readonly MediaUsage[]): readonly MediaUsage[] {
  return usages.filter((u) => u.assetId === asset.id).sort((a, b) => b.seq - a.seq);
}

export function usageCount(asset: MediaAsset, usages: readonly MediaUsage[]): number {
  return usages.reduce((n, u) => (u.assetId === asset.id ? n + 1 : n), 0);
}

/** A prateleira na ordem de leitura: acervo vivo por título; o arquivo depois. */
export function orderShelf(assets: readonly MediaAsset[]): readonly MediaAsset[] {
  return [...assets].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export interface MediaSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
  readonly usages: number;
}

export function summarizeShelf(
  assets: readonly MediaAsset[],
  usages: readonly MediaUsage[],
): MediaSummary {
  let active = 0;
  for (const a of assets) if (a.status === 'active') active += 1;
  return {
    total: assets.length,
    active,
    archived: assets.length - active,
    usages: usages.length,
  };
}

/** Etiquetas em ordem de nome — dado do tenant, lido como o tenant escreveu. */
export function orderTags(tags: readonly MediaTag[]): readonly MediaTag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name));
}

const TITULO_MAX = 200;
const TEXTO_MAX = 2000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida um ativo novo — título e o ONDE VIVE; tipo e descrição podem faltar. */
export function validateNewAsset(
  input: NewAssetInput,
): Validation<{ title: string; description: string; assetType: string; location: string }> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Dê um título à obra.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const location = texto(input.location);
  if (location === null) {
    problems.push({
      field: 'location',
      message: 'Onde a obra vive? Catálogo sem endereço não cataloga nada.',
    });
  } else if (location.length > TEXTO_MAX) {
    problems.push({ field: 'location', message: `Endereço com no máximo ${TEXTO_MAX} caracteres.` });
  }

  const description = texto(input.description) ?? '';
  const assetType = texto(input.assetType) ?? '';

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: { title: title!, description, assetType, location: location! } };
}
