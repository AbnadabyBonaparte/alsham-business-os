/**
 * O motor puro do Módulo 64 — Auditorias (de qualidade).
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma auditoria pode ser concluída ou
 * se um achado é válido.
 *
 * ⭐ **A física dos fins é a do `proj` (Módulo 53), re-perguntada:** a auditoria
 * tem ciclo `planned → completed`/`cancelled`, e os dois fins são TERMINAIS —
 * auditoria encerrada não reabre; a próxima é auditoria NOVA. O
 * `ALLOWED_TRANSITIONS` abaixo é o espelho de `audit.allowed_transition()` no
 * `0079_audit.sql`, e um teste lê a migration e confere que os dois dizem a
 * mesma coisa. Cancelar exige RAZÃO (a assimetria do `proj`); concluir tem nota
 * opcional.
 *
 * ⭐ **O achado é IMUTÁVEL** (fato constatado, a física da Qualidade): validá-lo
 * é só produzir a linha; corrigir é registrar outro. E ele carrega DOIS vínculos
 * de NATUREZA DIFERENTE, de propósito — à auditoria por FK COMPOSTA INTRA-schema
 * (peça do próprio módulo), ao `nc` (Módulo 63) por ID SOLTO opcional
 * (cross-module, sem FK). A pura camada nunca inventa nem lê o schema alheio.
 */
import type {
  Audit,
  AuditStatus,
  AuditSummary,
  CancelInput,
  Finding,
  NewAuditInput,
  NewFindingInput,
  Problem,
  Validation,
} from './types.ts';

/** planned → completed | cancelled. Os dois fins TERMINAIS (a física do proj). */
export const ALLOWED_TRANSITIONS: readonly (readonly [AuditStatus, AuditStatus])[] = [
  ['planned', 'completed'],
  ['planned', 'cancelled'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly AuditStatus[] = ['planned', 'completed', 'cancelled'];

export function canTransition(from: AuditStatus, to: AuditStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: AuditStatus): readonly AuditStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Concluir só existe da planejada. */
export function canComplete(status: AuditStatus): boolean {
  return status === 'planned';
}

/** Cancelar só existe da planejada. */
export function canCancel(status: AuditStatus): boolean {
  return status === 'planned';
}

const ORDEM: Record<AuditStatus, number> = {
  planned: 0,
  completed: 1,
  cancelled: 2,
};

/**
 * Planejadas primeiro, depois concluídas, depois canceladas; dentro de cada
 * estado, por data agendada (a sem data ao fim) e, empatando, por tipo.
 */
export function orderAudits(audits: readonly Audit[]): readonly Audit[] {
  return [...audits].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    if (a.scheduledFor !== b.scheduledFor) {
      if (a.scheduledFor === null) return 1;
      if (b.scheduledFor === null) return -1;
      return a.scheduledFor.localeCompare(b.scheduledFor);
    }
    return a.auditType.localeCompare(b.auditType);
  });
}

export function summarizeAudits(audits: readonly Audit[]): AuditSummary {
  return {
    total: audits.length,
    planned: audits.filter((a) => a.status === 'planned').length,
    completed: audits.filter((a) => a.status === 'completed').length,
    cancelled: audits.filter((a) => a.status === 'cancelled').length,
  };
}

const TIPO_MAX = 120;
const ESCOPO_MAX = 2000;
const DESC_MAX = 4000;
const RAZAO_MAX = 2000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Normaliza a data agendada. Aceita uma string ISO `yyyy-mm-dd`; qualquer outra
 * coisa (ausente, vazia, formato estranho, não-string) vira `null` — auditoria
 * sem data é honesta.
 */
function dataAgendada(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null) return null;
  return ISO_DATE.test(t) ? t : null;
}

/**
 * Valida uma auditoria nova. Tipo e escopo são obrigatórios (texto livre); a
 * data agendada é OPCIONAL (vira `null` se ausente ou fora do formato ISO).
 * Nasce planejada, com `id` vazio, `cancelReason`/`outcomeNote` vazios — a pura
 * camada nunca inventa dado do servidor.
 */
export function validateNewAudit(input: NewAuditInput): Validation<Audit> {
  const problems: Problem[] = [];

  const auditType = texto(input.auditType);
  if (auditType === null) {
    problems.push({ field: 'auditType', message: 'Informe o tipo da auditoria.' });
  } else if (auditType.length > TIPO_MAX) {
    problems.push({ field: 'auditType', message: `Tipo com no máximo ${TIPO_MAX} caracteres.` });
  }

  const scope = texto(input.scope);
  if (scope === null) {
    problems.push({ field: 'scope', message: 'Informe o escopo da auditoria.' });
  } else if (scope.length > ESCOPO_MAX) {
    problems.push({ field: 'scope', message: `Escopo com no máximo ${ESCOPO_MAX} caracteres.` });
  }

  const scheduledFor = dataAgendada(input.scheduledFor);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      auditType: auditType!,
      scope: scope!,
      scheduledFor,
      status: 'planned',
      cancelReason: '',
      outcomeNote: '',
    },
  };
}

/**
 * Valida um achado novo. Auditoria e descrição são obrigatórios; o vínculo ao
 * `nc` é OPCIONAL e por ID SOLTO (ausente vira `null`). Nasce com `id` vazio — o
 * achado é imutável, mas a pura camada só monta a linha; quem a grava e a torna
 * imutável é o banco.
 */
export function validateNewFinding(input: NewFindingInput): Validation<Finding> {
  const problems: Problem[] = [];

  const auditId = texto(input.auditId);
  if (auditId === null) {
    problems.push({ field: 'auditId', message: 'Informe a auditoria do achado.' });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Descreva o achado.' });
  } else if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
  }

  // O vínculo ao nc é OPCIONAL (id solto): ausente vira null, não um erro.
  const ncEntryId = texto(input.ncEntryId);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { id: '', auditId: auditId!, description: description!, ncEntryId },
  };
}

/**
 * Valida o cancelamento de uma auditoria. ⭐ A razão é OBRIGATÓRIA — cancelar
 * exige justificar (a assimetria do `proj`: concluir tem nota opcional, cancelar
 * exige razão). Devolve a razão limpa.
 */
export function validateCancel(input: CancelInput): Validation<string> {
  const problems: Problem[] = [];

  const reason = texto(input.reason);
  if (reason === null) {
    problems.push({ field: 'reason', message: 'Informe a razão do cancelamento.' });
  } else if (reason.length > RAZAO_MAX) {
    problems.push({ field: 'reason', message: `Razão com no máximo ${RAZAO_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: reason! };
}
