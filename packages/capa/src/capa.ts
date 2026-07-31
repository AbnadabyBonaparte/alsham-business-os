/**
 * O motor puro do Módulo 65 — CAPA (Ações Corretivas e Preventivas).
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma ação pode ser verificada ou
 * fechada.
 *
 * ⭐ **O TIPO é CHECK — física do método, não vocabulário de casa.**
 * `corrective` × `preventive` é o que a norma CAPA define: a lição do `mnt`
 * (corretiva/preventiva) e do `nps` (0–10). `validateNewAction` recusa
 * qualquer valor fora dos dois — não é campo de texto do tenant.
 *
 * ⭐ **O CICLO de 3 estados foi ESCOLHIDO de propósito.** `open → verified →
 * closed`, e NÃO o `open → closed` direto: **sem passar por `verified`, não
 * fecha.** É exatamente a VERIFICAÇÃO — a nota de quem confirmou que a ação
 * pegou — que separa este módulo de um marco de cronograma (`sched`) genérico,
 * que só é "feito". Permitir fechar direto reduziria a CAPA a um "feito" sem
 * prova, o que a norma proíbe. `closed` é TERMINAL (a física do `proj`): uma
 * ação que volta é ação nova. O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `capa.allowed_transition()` no `0080_capa.sql`, e um teste lê a migration e
 * confere que os dois dizem a mesma coisa.
 */
import type {
  Action,
  ActionSummary,
  CapaStatus,
  CapaType,
  NewActionInput,
  Problem,
  Validation,
  VerifyInput,
} from './types.ts';

/** open → verified → closed. Sem open → closed direto: sem verificação, não fecha. */
export const ALLOWED_TRANSITIONS: readonly (readonly [CapaStatus, CapaStatus])[] = [
  ['open', 'verified'],
  ['verified', 'closed'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly CapaStatus[] = ['open', 'verified', 'closed'];

/** Os dois tipos que a física do método CAPA admite. Nada além disto. */
export const ALL_TYPES: readonly CapaType[] = ['corrective', 'preventive'];

export function canTransition(from: CapaStatus, to: CapaStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: CapaStatus): readonly CapaStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Verificar existe só do aberto — é o primeiro ato do ciclo. */
export function canVerify(status: CapaStatus): boolean {
  return status === 'open';
}

/**
 * ⭐ Fechar existe SÓ do verificado — nunca do aberto. Sem verificação, não
 * fecha: é o que faz a CAPA não ser um marco genérico.
 */
export function canClose(status: CapaStatus): boolean {
  return status === 'verified';
}

const ORDEM: Record<CapaStatus, number> = {
  open: 0,
  verified: 1,
  closed: 2,
};

/** Abertas primeiro, depois verificadas, depois fechadas; dentro, por prazo. */
export function orderActions(actions: readonly Action[]): readonly Action[] {
  return [...actions].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    // dueDate null vai para o fim de cada grupo.
    if (a.dueDate === b.dueDate) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

export function summarizeActions(actions: readonly Action[]): ActionSummary {
  return {
    total: actions.length,
    open: actions.filter((a) => a.status === 'open').length,
    verified: actions.filter((a) => a.status === 'verified').length,
    closed: actions.filter((a) => a.status === 'closed').length,
  };
}

const DESC_MAX = 4000;
const RESP_MAX = 200;
const NOTE_MAX = 2000;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** `yyyy-mm-dd` bem-formada ou `null`. Prazo é opcional. */
function dataOuNull(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function ehTipo(valor: unknown): valor is CapaType {
  return valor === 'corrective' || valor === 'preventive';
}

/**
 * Valida uma ação nova. Nasce `open`, com `verificationNote` vazia e `id`
 * vazio — a pura camada nunca inventa dado do servidor.
 *
 * ⭐ `actionType` é OBRIGATÓRIO e tem de ser `corrective` ou `preventive` — é a
 * física do método (CHECK), não vocabulário do tenant: qualquer outra coisa é
 * recusada. Descrição e responsável são texto livre obrigatório. Prazo e
 * vínculo ao `nc` (id solto) são opcionais.
 */
export function validateNewAction(input: NewActionInput): Validation<Action> {
  const problems: Problem[] = [];

  if (!ehTipo(input.actionType)) {
    problems.push({
      field: 'actionType',
      message: 'O tipo deve ser corretiva (corrective) ou preventiva (preventive).',
    });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Descreva a ação.' });
  } else if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
  }

  const responsible = texto(input.responsible);
  if (responsible === null) {
    problems.push({ field: 'responsible', message: 'Informe o responsável.' });
  } else if (responsible.length > RESP_MAX) {
    problems.push({ field: 'responsible', message: `Responsável com no máximo ${RESP_MAX} caracteres.` });
  }

  // Opcionais: prazo (data ou null) e vínculo ao nc (id solto ou null).
  const dueDate = dataOuNull(input.dueDate);
  const ncEntryId = texto(input.ncEntryId);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      actionType: input.actionType as CapaType,
      description: description!,
      responsible: responsible!,
      dueDate,
      ncEntryId,
      status: 'open',
      verificationNote: '',
    },
  };
}

/**
 * Valida a verificação de uma ação.
 *
 * ⭐ A nota é OBRIGATÓRIA e não pode ser em branco: quem confirmou que a ação
 * funcionou é o que faz a CAPA não ser um marco genérico. Sem nota, não há
 * verificação — e sem verificação, não há fechamento.
 */
export function validateVerification(input: VerifyInput): Validation<{ verificationNote: string }> {
  const problems: Problem[] = [];

  const verificationNote = texto(input.verificationNote);
  if (verificationNote === null) {
    problems.push({
      field: 'verificationNote',
      message: 'Registre a nota da verificação: quem confirmou que a ação funcionou.',
    });
  } else if (verificationNote.length > NOTE_MAX) {
    problems.push({ field: 'verificationNote', message: `Nota com no máximo ${NOTE_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: { verificationNote: verificationNote! } };
}
