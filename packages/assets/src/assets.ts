import type {
  Asset,
  AssetStatus,
  AssetTransfer,
  NewAssetInput,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 18 — Patrimônio.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). O relógio entra por
 * parâmetro — o pacote não olha o calendário sozinho.
 */

/**
 * ⭐ Espelho de `pat.allowed_transition()` no `0033_pat.sql` — há teste que
 * lê a migration e compara. UM par só: a baixa é TERMINAL. O crm foi
 * re-perguntado e a resposta DIVERGE de propósito — a contraparte que volta
 * é a MESMA pessoa; o bem baixado que "volta" é aquisição NOVA.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [AssetStatus, AssetStatus])[] = [
  ['active', 'written_off'],
];

export function canTransition(from: AssetStatus, to: AssetStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canWriteOff(status: AssetStatus): boolean {
  return canTransition(status, 'written_off');
}

export function canEditAsset(status: AssetStatus): boolean {
  return status === 'active';
}

/** ⭐ A baixa exige a razão — a recusa com nome, decidida aqui. */
export function whyCannotWriteOff(asset: Asset, reason: string): string | null {
  if (!canWriteOff(asset.status)) {
    return 'O bem já foi baixado — a baixa é terminal, e o que volta é aquisição nova.';
  }
  if (reason.trim().length === 0) {
    return 'A baixa exige a razão escrita — alienação, perda, sucata: o porquê fica no livro.';
  }
  return null;
}

/** A transferência tem as suas recusas — decididas aqui, com nome. */
export function whyCannotTransfer(asset: Asset, toLocation: string): string | null {
  if (asset.status === 'written_off') {
    return 'Bem baixado não se transfere: a baixa encerrou o livro dele.';
  }
  if (toLocation.trim().length === 0) {
    return 'Diga para onde o bem vai — transferência sem destino é sumiço com recibo.';
  }
  return null;
}

/**
 * ⭐ A localização VIGENTE — o último ato do livro, ou a original quando o
 * bem nunca se moveu. Espelho da view `pat.asset_locations`: a decisão do
 * lugar é do PACOTE, nunca da tela.
 */
export function currentLocation(asset: Asset, transfers: readonly AssetTransfer[]): string {
  let ultimo: AssetTransfer | null = null;
  for (const t of transfers) {
    if (t.assetId !== asset.id) continue;
    if (ultimo === null || t.movedAt > ultimo.movedAt) ultimo = t;
  }
  return ultimo?.toLocation ?? asset.originalLocation;
}

/** O livro na ordem de leitura: ativos por nome, baixados por último. */
export function orderAssets(assets: readonly Asset[]): readonly Asset[] {
  return [...assets].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export interface PatSummary {
  readonly total: number;
  readonly active: number;
  readonly writtenOff: number;
}

export function summarizeAssets(assets: readonly Asset[]): PatSummary {
  let active = 0;
  for (const a of assets) if (a.status === 'active') active += 1;
  return { total: assets.length, active, writtenOff: assets.length - active };
}

const NOME_MAX = 200;
const CODE_MAX = 60;
const LOCAL_MAX = 200;
const DESC_MAX = 4000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um bem novo. `todayIso` vem de fora: aquisição é fato consumado e
 * não mora no futuro — mas quem sabe que dia é hoje é quem chama.
 */
export function validateNewAsset(input: NewAssetInput, todayIso: string): Validation<Asset> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Dê um nome ao bem.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  const code = texto(input.code);
  if (code === null) {
    problems.push({ field: 'code', message: 'Dê a etiqueta — é ela que identifica o bem no livro.' });
  } else if (code.length > CODE_MAX) {
    problems.push({ field: 'code', message: `Etiqueta com no máximo ${CODE_MAX} caracteres.` });
  }

  const originalLocation = texto(input.originalLocation);
  if (originalLocation === null) {
    problems.push({
      field: 'originalLocation',
      message: 'Diga onde o bem está — bem sem lugar não é cadastro, é boato.',
    });
  } else if (originalLocation.length > LOCAL_MAX) {
    problems.push({
      field: 'originalLocation',
      message: `Localização com no máximo ${LOCAL_MAX} caracteres.`,
    });
  }

  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  const rawCost = input.acquisitionCostCents;
  const acquisitionCostCents =
    typeof rawCost === 'number' && Number.isInteger(rawCost) && rawCost >= 0 ? rawCost : null;
  if (rawCost !== undefined && rawCost !== null && rawCost !== '' && acquisitionCostCents === null) {
    problems.push({ field: 'acquisitionCostCents', message: 'Valor de aquisição em centavos inteiros.' });
  }
  let currency = texto(input.currency)?.toUpperCase() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'Moeda ISO de três letras, ou vazia.' });
    currency = null;
  }
  if (acquisitionCostCents !== null && currency === null) {
    problems.push({ field: 'currency', message: 'Valor informado exige a moeda.' });
  }
  if (acquisitionCostCents === null && currency !== null) {
    problems.push({ field: 'acquisitionCostCents', message: 'Moeda informada exige o valor.' });
  }

  const rawDate = texto(input.acquiredOn);
  let acquiredOn: string | null = null;
  if (rawDate !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      problems.push({ field: 'acquiredOn', message: 'Data de aquisição no formato AAAA-MM-DD.' });
    } else if (rawDate > todayIso) {
      problems.push({
        field: 'acquiredOn',
        message: 'Aquisição é fato consumado — não mora no futuro.',
      });
    } else {
      acquiredOn = rawDate;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      name: name!,
      code: code!,
      description,
      categoryId: texto(input.categoryId),
      originalLocation: originalLocation!,
      acquisitionCostCents,
      currency,
      acquiredOn,
      status: 'active',
      writtenOffAt: null,
      writeOffReason: '',
    },
  };
}
