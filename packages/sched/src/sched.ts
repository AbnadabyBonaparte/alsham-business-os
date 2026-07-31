/**
 * O motor puro do Módulo 54 — Cronogramas.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se um marco pode ser concluído, reaberto
 * ou cancelado.
 *
 * ⭐ **O DIVERGE do `dem`/`bud`, RE-PERGUNTADO.** O `ALLOWED_TRANSITIONS` abaixo
 * é o espelho de `sched.allowed_transition()` no `0069_sched.sql`, e um teste lê
 * a migration e confere que os dois dizem a mesma coisa. A divergência: aqui
 * `done → planned` REABRE (um marco concluído por engano é correção de rota — a
 * física do `ops`), enquanto no `dem`/`bud` o fim é terminal.
 */
import type {
  Milestone,
  MilestoneStatus,
  MilestoneSummary,
  NewMilestoneInput,
  Problem,
  Validation,
} from './types.ts';

/**
 * ⭐ planned→done, planned→cancelled, done→planned (⭐ O REABRIR), done→cancelled.
 * `cancelled` é TERMINAL; `done` REABRE de propósito (o DIVERGE do dem/bud).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [MilestoneStatus, MilestoneStatus])[] = [
  ['planned', 'done'],
  ['planned', 'cancelled'],
  ['done', 'planned'],
  ['done', 'cancelled'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly MilestoneStatus[] = ['planned', 'done', 'cancelled'];

export function canTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: MilestoneStatus): readonly MilestoneStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Concluir (planned→done) só existe para o marco planejado. */
export function canComplete(status: MilestoneStatus): boolean {
  return status === 'planned';
}

/** ⭐ Reabrir (done→planned) só existe para o marco CONCLUÍDO — o DIVERGE. */
export function canReopen(status: MilestoneStatus): boolean {
  return status === 'done';
}

/** Cancelar existe do planejamento e da conclusão (mas não do já cancelado). */
export function canCancel(status: MilestoneStatus): boolean {
  return status === 'planned' || status === 'done';
}

const ORDEM: Record<MilestoneStatus, number> = {
  planned: 0,
  done: 1,
  cancelled: 2,
};

/**
 * Planejados primeiro, depois concluídos, depois cancelados; dentro, por data
 * prevista (os sem data ao fim), depois por título.
 */
export function orderMilestones(milestones: readonly Milestone[]): readonly Milestone[] {
  return [...milestones].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    if (a.dueOn !== b.dueOn) {
      if (a.dueOn === null) return 1;
      if (b.dueOn === null) return -1;
      return a.dueOn < b.dueOn ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
}

export function summarizeMilestones(milestones: readonly Milestone[]): MilestoneSummary {
  return {
    total: milestones.length,
    planned: milestones.filter((m) => m.status === 'planned').length,
    done: milestones.filter((m) => m.status === 'done').length,
    cancelled: milestones.filter((m) => m.status === 'cancelled').length,
  };
}

const TITULO_MAX = 200;
const NOME_MAX = 200;
// AAAA-MM-DD — a data prevista é opcional, mas quando vem, vem no formato ISO.
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** AAAA-MM-DD é um calendário de verdade? (rejeita 2027-13-40, 2027-02-30, …). */
function ehDataReal(iso: string): boolean {
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (mes! < 1 || mes! > 12 || dia! < 1 || dia! > 31) return false;
  const d = new Date(Date.UTC(ano!, mes! - 1, dia!));
  return (
    d.getUTCFullYear() === ano && d.getUTCMonth() === mes! - 1 && d.getUTCDate() === dia
  );
}

/**
 * Valida um marco novo (sempre nasce `planned`).
 * O título é obrigatório; o projeto (id solto) é obrigatório; a data prevista é
 * OPCIONAL (vira null). Nasce sem carimbos, com `id` vazio — a pura camada nunca
 * inventa dado do servidor.
 */
export function validateNewMilestone(input: NewMilestoneInput): Validation<Milestone> {
  const problems: Problem[] = [];

  const projectId = texto(input.projectId);
  if (projectId === null) {
    problems.push({ field: 'projectId', message: 'Vincule o marco a um projeto.' });
  }

  const projectName = texto(input.projectName) ?? '';

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o título do marco.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  if (projectName.length > NOME_MAX) {
    problems.push({ field: 'projectName', message: `Nome do projeto com no máximo ${NOME_MAX} caracteres.` });
  }

  // Data prevista OPCIONAL: ausência, null ou string em branco viram null.
  let dueOn: string | null = null;
  const dataBruta = input.dueOn === undefined || input.dueOn === null ? null : texto(input.dueOn);
  if (dataBruta !== null) {
    if (!DATA_ISO.test(dataBruta) || !ehDataReal(dataBruta)) {
      problems.push({ field: 'dueOn', message: 'Data prevista inválida (use AAAA-MM-DD).' });
    } else {
      dueOn = dataBruta;
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      projectId: projectId!,
      projectName,
      title: title!,
      dueOn,
      status: 'planned',
      cancelReason: '',
    },
  };
}
