/**
 * O motor puro do Módulo 46 — Avaliação de Fornecedores.
 *
 * ⭐ NÃO HÁ transições aqui — e a ausência é a lei. O `perf` tem um ciclo
 * (`open → closed`) porque a avaliação de RH acontece numa época; a avaliação
 * de FORNECEDOR é PONTUAL (a física do `sec.patrols`, não a do `perf.cycles`).
 * Sem ciclo, não há `ALLOWED_TRANSITIONS`, `canTransition` nem `status`. O que
 * este motor faz é validar o ato, ordená-lo e resumi-lo.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a RLS
 * e os gatilhos do `0061_vperf.sql`; o pacote avisa antes, com a MESMA régua,
 * para a recusa chegar com nome em vez de erro de constraint.
 */
import type {
  Appraisal,
  AppraisalSummary,
  NewAppraisalInput,
  Problem,
  Validation,
} from './types.ts';

/** As avaliações, mais recente primeiro — a leitura do livro do fornecedor. */
export function orderAppraisals(appraisals: readonly Appraisal[]): readonly Appraisal[] {
  return [...appraisals].sort((a, b) => b.appraisedAt.localeCompare(a.appraisedAt));
}

/**
 * Conta e tira a média sem inventar número onde não há: lista vazia dá média
 * `null`, nunca zero. A nota é obrigatória, então toda avaliação entra na conta.
 */
export function summarizeAppraisals(appraisals: readonly Appraisal[]): AppraisalSummary {
  if (appraisals.length === 0) {
    return { total: 0, averageRating: null };
  }
  const sum = appraisals.reduce((acc, a) => acc + a.rating, 0);
  return {
    total: appraisals.length,
    averageRating: sum / appraisals.length,
  };
}

const NOME_MAX = 200;
const SUMMARY_MAX = 4000;
const SOURCE_KIND_MAX = 120;
const RATING_MIN = 0;
const RATING_MAX = 100;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma avaliação nova. `supplierId`, `supplierName`, `rating` (0–100) e
 * `summary` são OBRIGATÓRIOS; `sourceKind` e `sourceRef` são OPCIONAIS.
 * `appraiserId` e `appraisedAt` não entram aqui — são carimbados pelo servidor,
 * nunca pela tela.
 */
export function validateNewAppraisal(input: NewAppraisalInput): Validation<Appraisal> {
  const problems: Problem[] = [];

  const supplierId = texto(input.supplierId);
  if (supplierId === null) {
    problems.push({ field: 'supplierId', message: 'Informe o fornecedor avaliado.' });
  }

  const supplierName = texto(input.supplierName);
  if (supplierName === null) {
    problems.push({ field: 'supplierName', message: 'Informe o nome do fornecedor avaliado.' });
  } else if (supplierName.length > NOME_MAX) {
    problems.push({ field: 'supplierName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  // ⭐ A nota é OBRIGATÓRIA, escala 0–100 — a régua do método (o DIVERGE do
  // perf, cuja nota é opcional). Uma avaliação sem número não é avaliação.
  let rating = 0;
  if (input.rating === undefined || input.rating === null || input.rating === '') {
    problems.push({ field: 'rating', message: 'Informe a nota da avaliação.' });
  } else {
    const n = typeof input.rating === 'number' ? input.rating : Number(input.rating);
    if (!Number.isFinite(n)) {
      problems.push({ field: 'rating', message: 'A nota precisa ser um número.' });
    } else if (n < RATING_MIN || n > RATING_MAX) {
      problems.push({ field: 'rating', message: `A nota vai de ${RATING_MIN} a ${RATING_MAX}.` });
    } else {
      rating = n;
    }
  }

  const summary = texto(input.summary);
  if (summary === null) {
    problems.push({ field: 'summary', message: 'Informe o parecer da avaliação.' });
  } else if (summary.length > SUMMARY_MAX) {
    problems.push({ field: 'summary', message: `Parecer com no máximo ${SUMMARY_MAX} caracteres.` });
  }

  // A origem é OPCIONAL: ausente vira '' (vazio), não um erro.
  const sourceKindBruto = texto(input.sourceKind);
  let sourceKind = '';
  if (sourceKindBruto !== null) {
    if (sourceKindBruto.length > SOURCE_KIND_MAX) {
      problems.push({ field: 'sourceKind', message: `Origem com no máximo ${SOURCE_KIND_MAX} caracteres.` });
    } else {
      sourceKind = sourceKindBruto;
    }
  }

  // O id da linha de origem é OPCIONAL.
  const sourceRef = texto(input.sourceRef);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      supplierId: supplierId!,
      supplierName: supplierName!,
      rating,
      summary: summary!,
      sourceKind,
      sourceRef,
      appraiserId: null,
      appraisedAt: '',
    },
  };
}
