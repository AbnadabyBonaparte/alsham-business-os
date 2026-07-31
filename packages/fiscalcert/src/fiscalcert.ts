/**
 * O motor puro do Módulo 70 — Certificado Digital (metadados).
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; nunca decide se um certificado pode ser arquivado.
 *
 * ⛔ E o que este motor NÃO faz é tão importante quanto o que faz: NÃO assina
 * nada, NÃO lê arquivo .pfx, NÃO toca chave privada. Ele ordena, resume e
 * valida METADADOS — e diz, contra uma data de referência PASSADA POR
 * PARÂMETRO (nunca o relógio), se um certificado já venceu.
 *
 * O `ALLOWED_TRANSITIONS` é o espelho de `fiscalcert.allowed_transition()` no
 * `0085_fiscalcert.sql` (teste lê e compara). `active ↔ archived` é reversível.
 */
import type {
  Certificate,
  CertificateStatus,
  CertificateSummary,
  NewCertificateInput,
  Problem,
  Validation,
} from './types.ts';

/** ⭐ active ↔ archived (a física do vendor — o registro volta). */
export const ALLOWED_TRANSITIONS: readonly (readonly [CertificateStatus, CertificateStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export const ALL_STATUSES: readonly CertificateStatus[] = ['active', 'archived'];

export function canTransition(from: CertificateStatus, to: CertificateStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function canArchive(status: CertificateStatus): boolean {
  return status === 'active';
}

export function canRestore(status: CertificateStatus): boolean {
  return status === 'archived';
}

/**
 * Já venceu, em relação a uma data de referência? A régua é `validUntil < asOf`.
 * ⭐ A data de referência vem POR PARÂMETRO — a pura camada nunca lê o relógio.
 */
export function isExpiredAsOf(cert: Certificate, asOf: string): boolean {
  return cert.validUntil < asOf;
}

/** Do vencimento mais próximo ao mais distante — a leitura do lembrete. */
export function orderByExpiry(certs: readonly Certificate[]): readonly Certificate[] {
  return [...certs].sort((a, b) => {
    if (a.validUntil !== b.validUntil) return a.validUntil < b.validUntil ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function summarizeCertificates(certs: readonly Certificate[]): CertificateSummary {
  return {
    total: certs.length,
    active: certs.filter((c) => c.status === 'active').length,
    archived: certs.filter((c) => c.status === 'archived').length,
  };
}

const TYPE_MAX = 120;
const HOLDER_MAX = 200;
const NOTE_MAX = 1000;
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
 * Valida um certificado novo (nasce `active`). Tipo, titular e VENCIMENTO
 * (`validUntil`) obrigatórios; o início (`validFrom`) e a nota OPCIONAIS. Se há
 * início, o vencimento não pode ser antes dele. Nasce com `id` vazio.
 */
export function validateNewCertificate(input: NewCertificateInput): Validation<Certificate> {
  const problems: Problem[] = [];

  const certType = texto(input.certType);
  if (certType === null) {
    problems.push({ field: 'certType', message: 'Informe o tipo do certificado (ex.: e-CNPJ).' });
  } else if (certType.length > TYPE_MAX) {
    problems.push({ field: 'certType', message: `Tipo com no máximo ${TYPE_MAX} caracteres.` });
  }

  const holder = texto(input.holder);
  if (holder === null) {
    problems.push({ field: 'holder', message: 'Informe o titular do certificado.' });
  } else if (holder.length > HOLDER_MAX) {
    problems.push({ field: 'holder', message: `Titular com no máximo ${HOLDER_MAX} caracteres.` });
  }

  // Vencimento: OBRIGATÓRIO, data ISO real.
  let validUntil: string | null = null;
  if (input.validUntil === undefined || input.validUntil === null || input.validUntil === '') {
    problems.push({ field: 'validUntil', message: 'Informe a data de vencimento do certificado.' });
  } else {
    const d = dataIso(input.validUntil);
    if (d === null) problems.push({ field: 'validUntil', message: 'A data de vencimento deve estar no formato AAAA-MM-DD.' });
    else validUntil = d;
  }

  // Início: OPCIONAL, mas se vier, data ISO real e não depois do vencimento.
  let validFrom: string | null = null;
  if (input.validFrom !== undefined && input.validFrom !== null && input.validFrom !== '') {
    const d = dataIso(input.validFrom);
    if (d === null) problems.push({ field: 'validFrom', message: 'A data de início deve estar no formato AAAA-MM-DD.' });
    else validFrom = d;
  }
  if (validFrom !== null && validUntil !== null && validUntil < validFrom) {
    problems.push({ field: 'validUntil', message: 'O vencimento não pode ser antes do início.' });
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
      certType: certType!,
      holder: holder!,
      validFrom,
      validUntil: validUntil!,
      status: 'active',
      note,
    },
  };
}
