import type {
  Answer,
  ChecklistRun,
  ChkRunItem,
  ChkTemplate,
  NewTemplateInput,
  Problem,
  RunStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 19 — Checklists.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `chk.allowed_transition()` no `0034_chk.sql` — há teste que
 * lê a migration e compara. DOIS pares, ambos TERMINAIS: a execução é
 * DOCUMENTO de inspeção (o argumento do quote) — quem volta amanhã abre
 * execução nova.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [RunStatus, RunStatus])[] = [
  ['in_progress', 'completed'],
  ['in_progress', 'abandoned'],
];

export const ANSWERS: readonly Answer[] = ['ok', 'not_ok', 'not_applicable'];

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** ⭐ A resposta é ato: uma vez, com a execução viva. */
export function canAnswer(run: ChecklistRun, item: ChkRunItem): boolean {
  return run.status === 'in_progress' && item.answer === null;
}

export function whyCannotAnswer(run: ChecklistRun, item: ChkRunItem): string | null {
  if (run.status !== 'in_progress') {
    return 'A execução já terminou: quem volta amanhã abre execução nova.';
  }
  if (item.answer !== null) {
    return 'Resposta dada não se rasura: corrigir é abandonar a execução com razão e executar de novo.';
  }
  return null;
}

export interface RunProgress {
  readonly total: number;
  readonly answered: number;
  readonly ok: number;
  readonly notOk: number;
  readonly notApplicable: number;
}

/** O andamento da prancheta — contado, nunca estimado. */
export function runProgress(items: readonly ChkRunItem[]): RunProgress {
  let answered = 0;
  let ok = 0;
  let notOk = 0;
  let na = 0;
  for (const i of items) {
    if (i.answer === null) continue;
    answered += 1;
    if (i.answer === 'ok') ok += 1;
    else if (i.answer === 'not_ok') notOk += 1;
    else na += 1;
  }
  return { total: items.length, answered, ok, notOk, notApplicable: na };
}

/** ⭐ Concluir exige tudo respondido — a recusa com nome, decidida aqui. */
export function whyCannotComplete(run: ChecklistRun, items: readonly ChkRunItem[]): string | null {
  if (!canTransition(run.status, 'completed')) {
    return 'A execução não está em condição de ser concluída.';
  }
  const faltam = items.filter((i) => i.runId === run.id && i.answer === null).length;
  if (faltam > 0) {
    return `Faltam ${faltam} item(ns) sem resposta: checklist pela metade é decoração.`;
  }
  return null;
}

export function whyCannotAbandon(run: ChecklistRun, reason: string): string | null {
  if (!canTransition(run.status, 'abandoned')) {
    return 'A execução não está em condição de ser abandonada.';
  }
  if (reason.trim().length === 0) {
    return 'Abandonar exige a razão escrita: a inspeção interrompida também é história.';
  }
  return null;
}

/** A prancheta na ordem do desenho. */
export function orderItems(items: readonly ChkRunItem[]): readonly ChkRunItem[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export interface ChkSummary {
  readonly total: number;
  readonly running: number;
  readonly completed: number;
  readonly abandoned: number;
}

export function summarizeRuns(runs: readonly ChecklistRun[]): ChkSummary {
  let running = 0;
  let completed = 0;
  let abandoned = 0;
  for (const r of runs) {
    if (r.status === 'in_progress') running += 1;
    else if (r.status === 'completed') completed += 1;
    else abandoned += 1;
  }
  return { total: runs.length, running, completed, abandoned };
}

const NOME_MAX = 200;
const ITEM_MAX = 500;
const ITENS_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export interface ValidTemplate {
  readonly name: string;
  readonly items: readonly string[];
}

/** Valida um modelo novo: nome e ao menos um item — prancheta vazia não é inspeção. */
export function validateNewTemplate(input: NewTemplateInput): Validation<ValidTemplate> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Dê um nome ao modelo.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  const raw = Array.isArray(input.items) ? input.items : [];
  const items: string[] = [];
  for (const item of raw) {
    const limpo = texto(item);
    if (limpo === null) continue;
    if (limpo.length > ITEM_MAX) {
      problems.push({ field: 'items', message: `Item com no máximo ${ITEM_MAX} caracteres.` });
      continue;
    }
    items.push(limpo);
  }
  if (items.length === 0) {
    problems.push({ field: 'items', message: 'O modelo precisa de ao menos um item — prancheta vazia não é inspeção.' });
  } else if (items.length > ITENS_MAX) {
    problems.push({ field: 'items', message: `Modelo com no máximo ${ITENS_MAX} itens.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: { name: name!, items } };
}

/** Só modelos ativos e com itens abrem execução. */
export function whyCannotStart(template: ChkTemplate | undefined, itemCount: number): string | null {
  if (!template || template.status !== 'active') {
    return 'O modelo não existe ou está arquivado.';
  }
  if (itemCount === 0) {
    return 'O modelo não tem itens ativos: prancheta vazia não é inspeção.';
  }
  return null;
}
