/**
 * O motor puro do Módulo 63 — Não Conformidades.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma NC pode ser fechada, nem se a
 * nota de verificação é suficiente.
 *
 * ⭐ **A identidade é a do `occ` (Módulo 16), re-perguntada:** a não
 * conformidade é um FATO CONSTATADO — o desvio nasce IMUTÁVEL. `validateNewEntry`
 * devolve o registro pronto para nascer aberto; nada nele se reescreve depois.
 * Recorrência é NC NOVA (por `previousEntryId` solto), nunca reabertura — por
 * isso `ALLOWED_TRANSITIONS` tem UM par só, e `closed` é terminal.
 *
 * ⭐⭐ **O DIVERGE do `occ`, ASSINADO — e é o que faz este módulo NÃO ser o `occ`
 * de novo (copiar sem pensar e divergir sem escrever são o mesmo erro):**
 *   • o `occ` encerra com um DESFECHO livre — o que aconteceu;
 *   • a NC fecha com uma **NOTA DE VERIFICAÇÃO** — quem conferiu que a causa foi
 *     corrigida. `validateClosure` EXIGE essa nota (não em branco). A Qualidade
 *     não fecha uma NC porque "resolveu"; fecha porque ALGUÉM VERIFICOU que a
 *     correção pegou. Sem a nota, fechar é arquivar sem conferir.
 *
 * `ALLOWED_TRANSITIONS` abaixo é o espelho de `nc.allowed_transition()` no
 * `0078_nc.sql`, e um teste lê a migration e confere que os dois dizem a mesma
 * coisa.
 */
import type {
  ClosureInput,
  Entry,
  EntrySummary,
  NcStatus,
  NewEntryInput,
  Problem,
  Validation,
} from './types.ts';

/** UM par só: open → closed. closed é TERMINAL (a física do occ; recorrência é NC nova). */
export const ALLOWED_TRANSITIONS: readonly (readonly [NcStatus, NcStatus])[] = [
  ['open', 'closed'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly NcStatus[] = ['open', 'closed'];

export function canTransition(from: NcStatus, to: NcStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: NcStatus): readonly NcStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Fechar existe só da aberta. Fechada é terminal — não se fecha de novo. */
export function canClose(status: NcStatus): boolean {
  return status === 'open';
}

const ORDEM: Record<NcStatus, number> = {
  open: 0,
  closed: 1,
};

/** Abertas primeiro, depois fechadas; dentro, mantém a ordem por origem. */
export function orderEntries(entries: readonly Entry[]): readonly Entry[] {
  return [...entries].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.origin.localeCompare(b.origin);
  });
}

export function summarizeEntries(entries: readonly Entry[]): EntrySummary {
  return {
    total: entries.length,
    open: entries.filter((e) => e.status === 'open').length,
    closed: entries.filter((e) => e.status === 'closed').length,
  };
}

const ORIGIN_MAX = 200;
const DESCRIPTION_MAX = 4000;
const ROOT_CAUSE_MAX = 4000;
const VERIFICATION_MAX = 2000;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma NC nova. A origem e a descrição são obrigatórias; a causa raiz, o
 * vínculo ao CAPA e o antecedente de recorrência são OPCIONAIS. Nasce ABERTA,
 * com `id` vazio e sem nota de verificação — a pura camada nunca inventa dado
 * do servidor, e a NC só ganha nota quando ALGUÉM a fecha.
 */
export function validateNewEntry(input: NewEntryInput): Validation<Entry> {
  const problems: Problem[] = [];

  const origin = texto(input.origin);
  if (origin === null) {
    problems.push({ field: 'origin', message: 'Informe a origem da não conformidade.' });
  } else if (origin.length > ORIGIN_MAX) {
    problems.push({ field: 'origin', message: `Origem com no máximo ${ORIGIN_MAX} caracteres.` });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Descreva o desvio constatado.' });
  } else if (description.length > DESCRIPTION_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESCRIPTION_MAX} caracteres.` });
  }

  // Causa raiz é opcional: ausente vira '' (vazio), não um erro.
  const rootCauseBruta = texto(input.rootCause);
  let rootCause = '';
  if (rootCauseBruta !== null) {
    if (rootCauseBruta.length > ROOT_CAUSE_MAX) {
      problems.push({ field: 'rootCause', message: `Causa raiz com no máximo ${ROOT_CAUSE_MAX} caracteres.` });
    } else {
      rootCause = rootCauseBruta;
    }
  }

  // Vínculo ao CAPA por id solto: opcional, ausente vira null.
  const capaActionId = texto(input.capaActionId);
  // Antecedente de recorrência por id solto: opcional, ausente vira null.
  const previousEntryId = texto(input.previousEntryId);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      origin: origin!,
      description: description!,
      rootCause,
      capaActionId,
      previousEntryId,
      status: 'open',
      verificationNote: '',
    },
  };
}

/**
 * Valida o fechamento de uma NC. ⭐⭐ **O DIVERGE do `occ`:** a NOTA DE
 * VERIFICAÇÃO é OBRIGATÓRIA (não em branco) — quem conferiu que a causa foi
 * corrigida. Sem ela, fechar é arquivar sem conferir, e o motor recusa.
 */
export function validateClosure(input: ClosureInput): Validation<{ readonly verificationNote: string }> {
  const problems: Problem[] = [];

  const verificationNote = texto(input.verificationNote);
  if (verificationNote === null) {
    problems.push({
      field: 'verificationNote',
      message: 'Informe a nota de verificação: quem conferiu que a causa foi corrigida.',
    });
  } else if (verificationNote.length > VERIFICATION_MAX) {
    problems.push({
      field: 'verificationNote',
      message: `Nota de verificação com no máximo ${VERIFICATION_MAX} caracteres.`,
    });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: { verificationNote: verificationNote! } };
}
