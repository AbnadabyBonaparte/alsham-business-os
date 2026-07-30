import type {
  Agreement,
  AgreementStatus,
  NewAgreementInput,
  NewSalesReportInput,
  Problem,
  SalesReport,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 39 — Locação de Lojistas.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0054_lease.sql`; o pacote avisa antes, com a MESMA
 * régua.
 *
 * ⭐⭐ Este módulo NÃO reescreve o ctr: vigência, reajuste, renovação e
 * rescisão são inteiramente do `ctr.contracts`. Aqui mora só o vínculo
 * (id solto ao ctr e ao mall) e o termo comercial sobre vendas.
 */

/**
 * ⭐ Espelho de `lease.allowed_transition()` no `0054_lease.sql` — há teste
 * que lê a migration e compara. `active → ended`: a ÚNICA transição do
 * catálogo inteiro — a camada fina não inventa física própria.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [AgreementStatus, AgreementStatus])[] = [
  ['active', 'ended'],
];

export function canTransition(from: AgreementStatus, to: AgreementStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canEnd(status: AgreementStatus): boolean {
  return canTransition(status, 'ended');
}

export function isEnded(status: AgreementStatus): boolean {
  return status === 'ended';
}

/**
 * O motivo pelo qual uma locação NÃO pode ser encerrada agora — para a tela
 * explicar em vez de deixar o botão falhar em silêncio.
 */
export function whyCannotEnd(status: AgreementStatus, endReason: string): string | null {
  if (!canEnd(status)) {
    return 'locação encerrada é terminal: nada nela muda';
  }
  if (endReason.trim().length === 0) {
    return 'encerrar exige a razão: locação sem motivo é história que ninguém consegue ler depois';
  }
  return null;
}

/** O mapa de locações: ativas primeiro. */
export function orderAgreements(agreements: readonly Agreement[]): readonly Agreement[] {
  const peso = (s: AgreementStatus): number => (s === 'active' ? 0 : 1);
  return [...agreements].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.storeName.localeCompare(b.storeName);
  });
}

export interface LeaseSummary {
  readonly total: number;
  readonly active: number;
  readonly ended: number;
}

export function summarize(agreements: readonly Agreement[]): LeaseSummary {
  let active = 0;
  let ended = 0;
  for (const a of agreements) {
    if (a.status === 'active') active += 1;
    else ended += 1;
  }
  return { total: agreements.length, active, ended };
}

const TEXTO_MAX = 200;
const REVENUE_SHARE_MAX = 200;
const NOTE_MAX = 500;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma locação nova. `contractId` e `storeId` são OBRIGATÓRIOS — sem
 * os dois a locação não tem o que vincular (é exatamente o que este módulo
 * existe para amarrar). Ainda assim são IDs SOLTOS: a validação confere que
 * a tela informou um valor, nunca que a linha existe no ctr ou no mall
 * (isso é integridade referencial de outro schema). `revenueShare` é
 * TEXTO LIVRE opcional — a locação pode nascer antes de o termo comercial
 * estar negociado.
 */
export function validateNewAgreement(input: NewAgreementInput): Validation<Agreement> {
  const problems: Problem[] = [];

  const contractId = texto(input.contractId);
  if (contractId === null) {
    problems.push({ field: 'contractId', message: 'Informe o contrato vinculado (id solto ao ctr).' });
  }

  const storeId = texto(input.storeId);
  if (storeId === null) {
    problems.push({ field: 'storeId', message: 'Informe o lojista vinculado (id solto ao mall).' });
  }

  const contractRef = texto(input.contractRef) ?? '';
  if (contractRef.length > TEXTO_MAX) {
    problems.push({ field: 'contractRef', message: `Referência do contrato com no máximo ${TEXTO_MAX} caracteres.` });
  }

  const storeName = texto(input.storeName) ?? '';
  if (storeName.length > TEXTO_MAX) {
    problems.push({ field: 'storeName', message: `Nome da loja com no máximo ${TEXTO_MAX} caracteres.` });
  }

  const revenueShare = texto(input.revenueShare) ?? '';
  if (revenueShare.length > REVENUE_SHARE_MAX) {
    problems.push({ field: 'revenueShare', message: `Termo comercial com no máximo ${REVENUE_SHARE_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      contractId: contractId!,
      contractRef,
      storeId: storeId!,
      storeName,
      revenueShare,
      status: 'active',
      endReason: '',
      endedAt: null,
    },
  };
}

/**
 * Valida um relatório de vendas novo. `competency` e `reportedAmountCents`
 * são obrigatórios — um relatório sem os dois é a linha muda que o ctr
 * já recusou para o reajuste.
 */
export function validateNewReport(input: NewSalesReportInput): Validation<SalesReport> {
  const problems: Problem[] = [];

  const agreementId = texto(input.agreementId);
  if (agreementId === null) {
    problems.push({ field: 'agreementId', message: 'Informe a locação vinculada.' });
  }

  const competency = texto(input.competency);
  if (competency === null) {
    problems.push({ field: 'competency', message: 'Informe a competência (mês/ano) do relatório.' });
  }

  const reportedAmountCents = input.reportedAmountCents;
  if (typeof reportedAmountCents !== 'number' || !Number.isInteger(reportedAmountCents) || reportedAmountCents < 0) {
    problems.push({ field: 'reportedAmountCents', message: 'Informe o valor vendido (em centavos, inteiro, ≥ 0).' });
  }

  let currency: string | null = null;
  if (input.currency !== undefined && input.currency !== null) {
    const c = texto(input.currency);
    if (c === null || !/^[A-Z]{3}$/.test(c)) {
      problems.push({ field: 'currency', message: 'Moeda deve ter três letras maiúsculas (ex.: BRL).' });
    } else {
      currency = c;
    }
  }

  const note = texto(input.note) ?? '';
  if (note.length > NOTE_MAX) {
    problems.push({ field: 'note', message: `Anotação com no máximo ${NOTE_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      agreementId: agreementId!,
      competency: competency!,
      reportedAmountCents: reportedAmountCents as number,
      currency,
      note,
      reportedAt: '',
    },
  };
}
