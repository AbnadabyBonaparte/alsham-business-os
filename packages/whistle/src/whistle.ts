/**
 * O motor puro do Módulo 77 — Canal de Denúncias.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; nunca decide se uma denúncia pode ser revista, resolvida
 * ou arquivada, nem se o denunciante deve ser omitido.
 *
 * ⭐ O `ALLOWED_TRANSITIONS` abaixo é o espelho de `whistle.allowed_transition()`
 * no `0092_whistle.sql`, e um teste lê a migration e confere que os dois dizem a
 * mesma coisa. `resolved` e `dismissed` são TERMINAIS.
 *
 * ⭐⭐ `redactReporter()` é o guarda de anonimato no domínio — o espelho puro da
 * lei do banco: denúncia anônima nunca carrega o denunciante.
 *
 * @see supabase/migrations/0092_whistle.sql
 * @see docs/canon/MODULO-WHISTLE-SPEC.md
 */
import type {
  NewReportInput,
  Problem,
  ReportStatus,
  Validation,
  WhistleReport,
} from './types.ts';

/**
 * ⭐ Espelho de `whistle.allowed_transition()` no `0092_whistle.sql`. O relato
 * congela; só o tratamento anda. `resolved`/`dismissed` são TERMINAIS.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ReportStatus, ReportStatus])[] = [
  ['open', 'under_review'],
  ['open', 'dismissed'],
  ['under_review', 'resolved'],
  ['under_review', 'dismissed'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly ReportStatus[] = [
  'open',
  'under_review',
  'resolved',
  'dismissed',
];

/** ⭐ Os fins: encerrar exige o desfecho escrito; deles não se sai. */
export const TERMINAL_STATUSES: readonly ReportStatus[] = ['resolved', 'dismissed'];

export function isTerminal(status: ReportStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: ReportStatus): readonly ReportStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/**
 * Levar para análise (open → under_review) só existe a partir de `open`.
 *
 * ⚠️ Estas três consultam a TABELA (via `nextStatuses`), não `canTransition` —
 * que responde `true` ao no-op (`from === to`). Perguntar "posso analisar daqui?"
 * de quem já está em `under_review` tem de ser `false`, não o eco do próprio
 * estado; o mesmo para arquivar de um estado terminal.
 */
export function canReview(status: ReportStatus): boolean {
  return nextStatuses(status).includes('under_review');
}

/** Resolver (under_review → resolved) só existe a partir de `under_review`. */
export function canResolve(status: ReportStatus): boolean {
  return nextStatuses(status).includes('resolved');
}

/** Arquivar (→ dismissed) existe de `open` e de `under_review`, de mais nenhum. */
export function canDismiss(status: ReportStatus): boolean {
  return nextStatuses(status).includes('dismissed');
}

/**
 * ⭐⭐ O guarda de anonimato, PURO — o espelho da lei do banco. Uma denúncia
 * anônima nunca carrega o denunciante: se `isAnonymous`, `reporterId` é forçado
 * a `null`, aconteça o que acontecer com o valor que chegou. No banco isto é o
 * gatilho de inserção (descarta `auth.uid()`) mais a CHECK constraint; aqui, no
 * domínio, é a mesma verdade escrita uma segunda vez para a tela nunca inventar.
 */
export function redactReporter(report: WhistleReport): WhistleReport {
  if (!report.isAnonymous) return report;
  if (report.reporterId === null) return report;
  return { ...report, reporterId: null };
}

/**
 * ⭐ Encerrar exige desfecho: uma transição para estado TERMINAL
 * (`resolved`/`dismissed`) requer a `resolution` escrita. Espelho puro da regra
 * do gatilho `whistle.guard_report_update()`.
 */
export function requiresResolution(_from: ReportStatus, to: ReportStatus): boolean {
  return isTerminal(to);
}

const ASSUNTO_MAX = 200;
const DESC_MAX = 8000;
const CATEGORIA_MAX = 120;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma denúncia nova (sempre nasce `open`).
 *
 * Assunto e descrição obrigatórios; categoria opcional (vira vazio); anonimato é
 * um booleano (só `true` liga — ausência/qualquer outra coisa nasce `false`, o
 * padrão honesto). Nasce com `id` vazio, `reporterId` `null` e `resolution`
 * vazia — o denunciante quem carimba é o SERVIDOR (e só se NÃO for anônima).
 */
export function validateNewReport(input: NewReportInput): Validation<WhistleReport> {
  const problems: Problem[] = [];

  const subject = texto(input.subject);
  if (subject === null) {
    problems.push({ field: 'subject', message: 'Informe o assunto da denúncia.' });
  } else if (subject.length > ASSUNTO_MAX) {
    problems.push({ field: 'subject', message: `Assunto com no máximo ${ASSUNTO_MAX} caracteres.` });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Descreva o que está sendo denunciado.' });
  } else if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
  }

  let category = texto(input.category) ?? '';
  if (category.length > CATEGORIA_MAX) {
    problems.push({ field: 'category', message: `Categoria com no máximo ${CATEGORIA_MAX} caracteres.` });
    category = category.slice(0, CATEGORIA_MAX);
  }

  const isAnonymous = input.isAnonymous === true;

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      category,
      subject: subject!,
      description: description!,
      isAnonymous,
      // ⭐⭐ Nasce sem denunciante — mesmo NÃO-anônima, quem carimba é o servidor.
      reporterId: null,
      status: 'open',
      resolution: '',
    },
  };
}
