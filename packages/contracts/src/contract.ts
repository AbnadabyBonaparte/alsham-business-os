import type {
  Adjustment,
  Contract,
  ContractStatus,
  NewContractInput,
  Problem,
  Renewal,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 13 — Contratos.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Toda comparação de data
 * recebe `todayIso` por parâmetro — o relógio é de quem chama.
 */

/**
 * ⭐ Espelho de `ctr.allowed_transition()` no `0028_ctr.sql` — há teste que
 * lê a migration e compara par a par.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ContractStatus, ContractStatus])[] = [
  ['draft', 'active'],
  ['draft', 'cancelled'],
  ['active', 'ended'],
  ['active', 'terminated'],
];

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function nextStatuses(from: ContractStatus): readonly ContractStatus[] {
  return ALLOWED_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t);
}

/** Entrar em vigor exige o essencial: com quem e desde quando. */
export function canActivate(contract: Contract): boolean {
  return (
    contract.status === 'draft' &&
    contract.counterpartyName !== null &&
    contract.startsOn !== null
  );
}

export function canCancel(contract: Contract): boolean {
  return contract.status === 'draft';
}

/** Só rascunho edita termos: em vigor, valor muda por REAJUSTE e prazo por RENOVAÇÃO. */
export function canEditTerms(status: ContractStatus): boolean {
  return status === 'draft';
}

/**
 * ⭐ O VALOR VIGENTE não é campo — é o original + o último reajuste.
 * O saldo do `inv`, re-perguntado para os termos.
 */
export function currentValueCents(
  contract: Contract,
  adjustments: readonly Adjustment[],
): number | null {
  const last = [...adjustments]
    .sort((a, b) =>
      a.adjustedOn === b.adjustedOn
        ? a.registeredAt.localeCompare(b.registeredAt)
        : a.adjustedOn.localeCompare(b.adjustedOn),
    )
    .at(-1);
  return last ? last.newValueCents : contract.valueCents;
}

/** ⭐ O FIM VIGENTE: original + a última renovação. */
export function currentEndsOn(contract: Contract, renewals: readonly Renewal[]): string | null {
  const last = [...renewals].sort((a, b) => a.renewedAt.localeCompare(b.renewedAt)).at(-1);
  return last ? last.newEndsOn : contract.endsOn;
}

const DIA_MS = 86_400_000;

function dataUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

/**
 * Quantos dias até o fim VIGENTE. Negativo = vencido (e a decisão de
 * renovar ou encerrar está atrasada). `null` = sem prazo: não vence nunca.
 */
export function daysToEnd(
  contract: Contract,
  renewals: readonly Renewal[],
  todayIso: string,
): number | null {
  const end = currentEndsOn(contract, renewals);
  if (end === null) return null;
  return Math.round((dataUtc(end) - dataUtc(todayIso)) / DIA_MS);
}

/**
 * ⭐ `ended` é registro de CALENDÁRIO, nunca vontade: só contrato em vigor,
 * com prazo, e com o prazo VENCIDO. Sem prazo, rescinde-se.
 */
export function canEnd(contract: Contract, renewals: readonly Renewal[], todayIso: string): boolean {
  if (contract.status !== 'active') return false;
  const dias = daysToEnd(contract, renewals, todayIso);
  return dias !== null && dias < 0;
}

export function canTerminate(contract: Contract): boolean {
  return contract.status === 'active';
}

export function whyCannotTerminate(contract: Contract, reason: string): string | null {
  if (contract.status !== 'active') {
    return 'Só se rescinde contrato em vigor.';
  }
  if (reason.trim().length === 0) {
    return 'Rescindir exige a razão: o livro existe para se aprender por que se rompe.';
  }
  return null;
}

/** Reajuste só em vigor, e só sobre valor que EXISTE. */
export function canAdjust(contract: Contract): boolean {
  return contract.status === 'active' && contract.valueCents !== null;
}

/** Renovar exige vigor E prazo a estender — sem fim não há o que renovar. */
export function canRenew(contract: Contract, renewals: readonly Renewal[]): boolean {
  return contract.status === 'active' && currentEndsOn(contract, renewals) !== null;
}

/**
 * ⭐ Renovar ESTENDE: a recusa com nome, decidida AQUI — a tela só repete.
 * Encurtar prazo não é renovação, é rescisão (que tem ato próprio).
 */
export function whyCannotRenewTo(
  contract: Contract,
  renewals: readonly Renewal[],
  newEndsOnIso: string,
): string | null {
  if (!canRenew(contract, renewals)) {
    return 'Só se renova contrato em vigor com prazo a estender.';
  }
  const vigente = currentEndsOn(contract, renewals)!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newEndsOnIso)) {
    return 'Informe o novo fim no formato AAAA-MM-DD.';
  }
  if (newEndsOnIso <= vigente) {
    return `Renovar ESTENDE: o novo fim precisa ser posterior ao vigente (${vigente}).`;
  }
  return null;
}

export interface ExpiryRow {
  readonly contract: Contract;
  readonly daysToEnd: number;
}

/**
 * A fila de vencimentos: contratos EM VIGOR com prazo, do mais urgente para
 * o mais folgado. `windowDays` recorta "vencendo em N dias" — e o vencido
 * (negativo) SEMPRE entra: ele é o mais urgente de todos.
 */
export function buildExpiryQueue(
  contracts: readonly Contract[],
  renewalsByContract: ReadonlyMap<string, readonly Renewal[]>,
  todayIso: string,
  windowDays: number,
): readonly ExpiryRow[] {
  const rows: ExpiryRow[] = [];
  for (const c of contracts) {
    if (c.status !== 'active') continue;
    const dias = daysToEnd(c, renewalsByContract.get(c.externalRef) ?? [], todayIso);
    if (dias === null) continue;
    if (dias <= windowDays) rows.push({ contract: c, daysToEnd: dias });
  }
  return rows.sort((a, b) => a.daysToEnd - b.daysToEnd);
}

const REF_MAX = 64;
const TITULO_MAX = 200;
const NOME_MAX = 200;
const DESC_MAX = 4000;
const TIPO_MAX = 80;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export function validateNewContract(input: NewContractInput): Validation<Contract> {
  const problems: Problem[] = [];

  const externalRef = texto(input.externalRef);
  if (externalRef === null) {
    problems.push({ field: 'externalRef', message: 'Informe a referência do contrato.' });
  } else if (externalRef.length > REF_MAX) {
    problems.push({ field: 'externalRef', message: `Referência com no máximo ${REF_MAX} caracteres.` });
  }

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o objeto do contrato.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Objeto com no máximo ${TITULO_MAX} caracteres.` });
  }

  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  let contractType = texto(input.contractType);
  if (contractType !== null && contractType.length > TIPO_MAX) {
    problems.push({ field: 'contractType', message: `Tipo com no máximo ${TIPO_MAX} caracteres.` });
    contractType = null;
  }

  let counterpartyName = texto(input.counterpartyName);
  if (counterpartyName !== null && counterpartyName.length > NOME_MAX) {
    problems.push({ field: 'counterpartyName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
    counterpartyName = null;
  }

  let counterpartyTaxId = texto(input.counterpartyTaxId);
  if (counterpartyTaxId !== null && counterpartyTaxId.length > 64) {
    problems.push({ field: 'counterpartyTaxId', message: 'Identificador fiscal longo demais.' });
    counterpartyTaxId = null;
  }

  const startsOn = texto(input.startsOn);
  if (startsOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
    problems.push({ field: 'startsOn', message: 'Início no formato AAAA-MM-DD, ou vazio.' });
  }

  const endsOn = texto(input.endsOn);
  if (endsOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
    problems.push({ field: 'endsOn', message: 'Fim no formato AAAA-MM-DD, ou vazio.' });
  }
  if (startsOn !== null && endsOn !== null && endsOn < startsOn) {
    problems.push({ field: 'endsOn', message: 'O fim da vigência não pode preceder o início.' });
  }

  // ⭐ Valor e moeda andam JUNTOS — valor sem moeda é número que mente.
  const rawValue = input.valueCents;
  const valueCents =
    typeof rawValue === 'number' && Number.isInteger(rawValue) && rawValue > 0 ? rawValue : null;
  if (rawValue !== undefined && rawValue !== null && rawValue !== '' && valueCents === null) {
    problems.push({ field: 'valueCents', message: 'Valor em centavos inteiros, maior que zero.' });
  }
  let currency = texto(input.currency)?.toUpperCase() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'Moeda ISO de três letras, ou vazia.' });
    currency = null;
  }
  if (valueCents !== null && currency === null) {
    problems.push({ field: 'currency', message: 'Valor informado exige a moeda.' });
  }
  if (valueCents === null && currency !== null) {
    problems.push({ field: 'valueCents', message: 'Moeda informada exige o valor.' });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      externalRef: externalRef!,
      title: title!,
      description,
      contractType,
      counterpartyName,
      counterpartyTaxId,
      partyId: null,
      startsOn,
      endsOn,
      valueCents,
      currency,
      status: 'draft',
      outcomeReason: '',
      decidedAt: null,
    },
  };
}

export interface ContractsSummary {
  readonly total: number;
  readonly drafts: number;
  readonly active: number;
  readonly closed: number;
}

export function summarizeContracts(contracts: readonly Contract[]): ContractsSummary {
  let drafts = 0;
  let active = 0;
  let closed = 0;
  for (const c of contracts) {
    if (c.status === 'draft') drafts += 1;
    else if (c.status === 'active') active += 1;
    else closed += 1;
  }
  return { total: contracts.length, drafts, active, closed };
}
