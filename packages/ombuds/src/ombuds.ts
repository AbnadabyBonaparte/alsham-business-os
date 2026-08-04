/**
 * O motor puro do Módulo 91 — Ouvidoria (Lei 13.460).
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; nunca decide se uma manifestação pode ser analisada,
 * respondida ou arquivada, nem se o cidadão deve ser omitido.
 *
 * ⭐ O `ALLOWED_TRANSITIONS` abaixo é o espelho de `ombuds.allowed_transition()`
 * no `0106_ombuds.sql`, e um teste lê a migration e confere que os dois dizem a
 * mesma coisa. `answered` e `dismissed` são TERMINAIS.
 *
 * ⭐⭐ `redactReporter()` é o guarda de anonimato no domínio — o espelho puro da
 * lei do banco (reaproveitada do `whistle`): manifestação anônima nunca carrega
 * o cidadão.
 *
 * @see supabase/migrations/0106_ombuds.sql
 * @see docs/canon/MODULO-OMBUDS-SPEC.md
 */
import {
  MANIFESTATION_TYPES,
  type ManifestationStatus,
  type ManifestationType,
  type Manifestation,
  type NewManifestationInput,
  type Problem,
  type Validation,
} from './types.ts';

/**
 * ⭐ Espelho de `ombuds.allowed_transition()` no `0106_ombuds.sql`. O relato
 * congela; só o tratamento anda. `answered`/`dismissed` são TERMINAIS.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ManifestationStatus, ManifestationStatus])[] = [
  ['received', 'under_review'],
  ['received', 'dismissed'],
  ['under_review', 'answered'],
  ['under_review', 'dismissed'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly ManifestationStatus[] = [
  'received',
  'under_review',
  'answered',
  'dismissed',
];

/** ⭐ Os fins: encerrar exige a resposta escrita; deles não se sai. */
export const TERMINAL_STATUSES: readonly ManifestationStatus[] = ['answered', 'dismissed'];

export function isTerminal(status: ManifestationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: ManifestationStatus, to: ManifestationStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: ManifestationStatus): readonly ManifestationStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/**
 * Levar para análise (received → under_review) só existe a partir de `received`.
 *
 * ⚠️ Estas três consultam a TABELA (via `nextStatuses`), não `canTransition` —
 * que responde `true` ao no-op (`from === to`). Perguntar "posso analisar daqui?"
 * de quem já está em `under_review` tem de ser `false`, não o eco do próprio
 * estado; o mesmo para arquivar de um estado terminal.
 */
export function canReview(status: ManifestationStatus): boolean {
  return nextStatuses(status).includes('under_review');
}

/** Responder (under_review → answered) só existe a partir de `under_review`. */
export function canAnswer(status: ManifestationStatus): boolean {
  return nextStatuses(status).includes('answered');
}

/** Arquivar (→ dismissed) existe de `received` e de `under_review`, de mais nenhum. */
export function canDismiss(status: ManifestationStatus): boolean {
  return nextStatuses(status).includes('dismissed');
}

/**
 * ⭐⭐ O guarda de anonimato, PURO — o espelho da lei do banco (reaproveitada do
 * `whistle`). Uma manifestação anônima nunca carrega o cidadão: se `isAnonymous`,
 * `reporterId` é forçado a `null`, aconteça o que acontecer com o valor que
 * chegou. No banco isto é o gatilho de inserção (descarta `auth.uid()`) mais a
 * CHECK constraint; aqui, no domínio, é a mesma verdade escrita uma segunda vez
 * para a tela nunca inventar.
 */
export function redactReporter(manifestation: Manifestation): Manifestation {
  if (!manifestation.isAnonymous) return manifestation;
  if (manifestation.reporterId === null) return manifestation;
  return { ...manifestation, reporterId: null };
}

/**
 * ⭐ Encerrar exige resposta: uma transição para estado TERMINAL
 * (`answered`/`dismissed`) requer a `response` escrita. Espelho puro da regra do
 * gatilho `ombuds.guard_manifestation_update()`.
 */
export function requiresResponse(_from: ManifestationStatus, to: ManifestationStatus): boolean {
  return isTerminal(to);
}

/** ⭐ As naturezas válidas da Lei 13.460 — física do método, não vocabulário. */
export function isManifestationType(value: unknown): value is ManifestationType {
  return typeof value === 'string' && (MANIFESTATION_TYPES as readonly string[]).includes(value);
}

const ASSUNTO_MAX = 200;
const DESC_MAX = 8000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma manifestação nova (sempre nasce `received`).
 *
 * Assunto e descrição obrigatórios; a natureza obrigatória e uma das cinco da
 * Lei 13.460; anonimato é um booleano (só `true` liga — ausência/qualquer outra
 * coisa nasce `false`, o padrão honesto). Nasce com `id`/`protocol` vazios,
 * `reporterId` `null` e `response` vazia — o protocolo e o cidadão quem carimba é
 * o SERVIDOR (e o cidadão só se NÃO for anônima).
 */
export function validateNewManifestation(input: NewManifestationInput): Validation<Manifestation> {
  const problems: Problem[] = [];

  if (!isManifestationType(input.manifestationType)) {
    problems.push({
      field: 'manifestationType',
      message: 'Informe a natureza da manifestação (reclamação, denúncia, sugestão, elogio ou informação).',
    });
  }

  const subject = texto(input.subject);
  if (subject === null) {
    problems.push({ field: 'subject', message: 'Informe o assunto da manifestação.' });
  } else if (subject.length > ASSUNTO_MAX) {
    problems.push({ field: 'subject', message: `Assunto com no máximo ${ASSUNTO_MAX} caracteres.` });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Descreva a sua manifestação.' });
  } else if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
  }

  const isAnonymous = input.isAnonymous === true;

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      // ⭐ Nasce sem protocolo — quem carimba a identidade pública é o servidor.
      protocol: '',
      manifestationType: input.manifestationType as ManifestationType,
      subject: subject!,
      description: description!,
      isAnonymous,
      // ⭐⭐ Nasce sem cidadão — mesmo NÃO-anônima, quem carimba é o servidor.
      reporterId: null,
      status: 'received',
      response: '',
    },
  };
}
