/**
 * O motor puro do Módulo 69 — Propriedade Intelectual.
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; nunca decide se um ativo pode ser concedido ou expirado.
 *
 * ⭐ O `ALLOWED_TRANSITIONS` é o espelho de `ip.allowed_transition()` no
 * `0084_ip.sql`, e um teste lê a migration e confere que os dois dizem a mesma
 * coisa. `rejected` e `expired` são TERMINAIS e NÃO REABREM (a física do
 * proj/nc): o que volta é depósito novo.
 */
import {
  ASSET_TYPES,
  type AssetStatus,
  type AssetType,
  type IpAsset,
  type IpSummary,
  type NewIpAssetInput,
  type Problem,
  type Validation,
} from './types.ts';

/**
 * ⭐ filed→granted, filed→rejected, granted→expired. `rejected` e `expired` são
 * TERMINAIS: não reabrem.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [AssetStatus, AssetStatus])[] = [
  ['filed', 'granted'],
  ['filed', 'rejected'],
  ['granted', 'expired'],
];

export const ALL_STATUSES: readonly AssetStatus[] = ['filed', 'granted', 'rejected', 'expired'];

export function canTransition(from: AssetStatus, to: AssetStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: AssetStatus): readonly AssetStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Conceder só existe para o pedido depositado. */
export function canGrant(status: AssetStatus): boolean {
  return status === 'filed';
}

/** Indeferir só existe para o pedido depositado. */
export function canReject(status: AssetStatus): boolean {
  return status === 'filed';
}

/** Expirar só existe para o direito concedido. */
export function canExpire(status: AssetStatus): boolean {
  return status === 'granted';
}

/** ⭐ A identidade (título/tipo) só muda enquanto depositado (filed). */
export function canEditIdentity(status: AssetStatus): boolean {
  return status === 'filed';
}

/** É uma das quatro categorias do direito? A régua do CHECK, na camada pura. */
export function isAssetType(valor: unknown): valor is AssetType {
  return typeof valor === 'string' && (ASSET_TYPES as readonly string[]).includes(valor);
}

const ORDEM: Record<AssetStatus, number> = { filed: 0, granted: 1, rejected: 2, expired: 3 };

/** Vivos primeiro (filed, granted), depois os terminais; dentro, por título. */
export function orderAssets(assets: readonly IpAsset[]): readonly IpAsset[] {
  return [...assets].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.title.localeCompare(b.title);
  });
}

export function summarizeAssets(assets: readonly IpAsset[]): IpSummary {
  return {
    total: assets.length,
    filed: assets.filter((a) => a.status === 'filed').length,
    granted: assets.filter((a) => a.status === 'granted').length,
    rejected: assets.filter((a) => a.status === 'rejected').length,
    expired: assets.filter((a) => a.status === 'expired').length,
  };
}

const TITLE_MAX = 200;
const REG_MAX = 120;
const NOTE_MAX = 1000;
const SOURCE_NAME_MAX = 200;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

function dataIso(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null || !DATA_RE.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === t ? t : null;
}

/**
 * Valida um ativo de PI novo (nasce sempre `filed`). Título e tipo obrigatórios;
 * número de registro, data de depósito, origem e nota OPCIONAIS. Nasce com `id`
 * vazio — a pura camada nunca inventa dado do servidor.
 */
export function validateNewAsset(input: NewIpAssetInput): Validation<IpAsset> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o título do ativo de PI.' });
  } else if (title.length > TITLE_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITLE_MAX} caracteres.` });
  }

  if (!isAssetType(input.assetType)) {
    problems.push({
      field: 'assetType',
      message: 'O tipo deve ser um de: patent, trademark, copyright, trade_secret.',
    });
  }

  const regBruto = texto(input.registrationNumber);
  let registrationNumber = '';
  if (regBruto !== null) {
    if (regBruto.length > REG_MAX) {
      problems.push({ field: 'registrationNumber', message: `Número de registro com no máximo ${REG_MAX} caracteres.` });
    } else {
      registrationNumber = regBruto;
    }
  }

  // Data de depósito: OPCIONAL, mas se vier, precisa ser data ISO real.
  let filedOn: string | null = null;
  if (input.filedOn !== undefined && input.filedOn !== null && input.filedOn !== '') {
    const d = dataIso(input.filedOn);
    if (d === null) problems.push({ field: 'filedOn', message: 'A data de depósito deve estar no formato AAAA-MM-DD.' });
    else filedOn = d;
  }

  const sourceId = texto(input.sourceId);

  const nomeBruto = texto(input.sourceName);
  let sourceName = '';
  if (nomeBruto !== null) {
    if (nomeBruto.length > SOURCE_NAME_MAX) {
      problems.push({ field: 'sourceName', message: `Nome da origem com no máximo ${SOURCE_NAME_MAX} caracteres.` });
    } else {
      sourceName = nomeBruto;
    }
  }

  const notaBruta = texto(input.note);
  let note = '';
  if (notaBruta !== null) {
    if (notaBruta.length > NOTE_MAX) {
      problems.push({ field: 'note', message: `Nota com no máximo ${NOTE_MAX} caracteres.` });
    } else {
      note = notaBruta;
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      title: title!,
      assetType: input.assetType as AssetType,
      registrationNumber,
      filedOn,
      status: 'filed',
      sourceId,
      sourceName,
      note,
    },
  };
}
