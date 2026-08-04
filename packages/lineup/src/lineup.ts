/**
 * O motor puro do Módulo 95 — Programação/line-up.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide como a grade se ordena nem se um item é
 * válido.
 *
 * ⭐⭐ **A AGENDA É PLANO MUTÁVEL.** Repare no que este arquivo NÃO tem: nenhum
 * `SlotStatus`, nenhum `ALLOWED_TRANSITIONS`, nenhum `canComplete`/`canCancel`.
 * O item de line-up não tem ciclo de vida — se edita e se apaga (a física do
 * `gantt`/`edcal`). Copiar a máquina de estados do `sched` "por consistência"
 * seria o erro que o canon proíbe: a decisão vive por AUSÊNCIA de máquina.
 */
import type {
  LineupSummary,
  NewSlotInput,
  Problem,
  Slot,
  Validation,
} from './types.ts';

/**
 * ⭐ A leitura ordena a grade por POSIÇÃO (a ordenação manual do tenant), depois
 * por horário de início (os sem horário — TBD — ao fim), depois por título.
 * É o espelho do índice `lineup_slots_agenda_idx` da migration.
 */
export function orderSlots(slots: readonly Slot[]): readonly Slot[] {
  return [...slots].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (a.startsAt !== b.startsAt) {
      if (a.startsAt === null) return 1;
      if (b.startsAt === null) return -1;
      return a.startsAt < b.startsAt ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
}

export function summarizeLineup(slots: readonly Slot[]): LineupSummary {
  const scheduled = slots.filter((s) => s.startsAt !== null).length;
  return {
    total: slots.length,
    scheduled,
    tbd: slots.length - scheduled,
  };
}

const TITULO_MAX = 200;
const NOME_MAX = 200;
const PALCO_MAX = 200;
const ATRACAO_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Um instante ISO 8601 válido? (aceita null; rejeita lixo). */
function ehInstante(iso: string): boolean {
  const ms = Date.parse(iso);
  return !Number.isNaN(ms);
}

/**
 * Valida um item novo da grade.
 *
 * Obrigatórios: o evento (id solto) e o título. OPCIONAIS: palco, horário de
 * início/fim (o programa pode nascer TBD), atração, posição (default 0). A pura
 * camada nunca inventa dado do servidor — nasce com `id` vazio.
 *
 * Física do intervalo (a mesma da constraint): não há fim sem início, e o fim
 * não antecede o início.
 */
export function validateNewSlot(input: NewSlotInput): Validation<Slot> {
  const problems: Problem[] = [];

  const eventId = texto(input.eventId);
  if (eventId === null) {
    problems.push({ field: 'eventId', message: 'Vincule o item a um evento.' });
  }

  const eventName = texto(input.eventName) ?? '';
  if (eventName.length > NOME_MAX) {
    problems.push({ field: 'eventName', message: `Nome do evento com no máximo ${NOME_MAX} caracteres.` });
  }

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o título do item (a atração/sessão).' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const stage = texto(input.stage) ?? '';
  if (stage.length > PALCO_MAX) {
    problems.push({ field: 'stage', message: `Palco/trilha com no máximo ${PALCO_MAX} caracteres.` });
  }

  const performer = texto(input.performer) ?? '';
  if (performer.length > ATRACAO_MAX) {
    problems.push({ field: 'performer', message: `Atração/palestrante com no máximo ${ATRACAO_MAX} caracteres.` });
  }

  // Horário OPCIONAL: ausência, null ou string em branco viram null (TBD).
  let startsAt: string | null = null;
  const inicioBruto = input.startsAt === undefined || input.startsAt === null ? null : texto(input.startsAt);
  if (inicioBruto !== null) {
    if (!ehInstante(inicioBruto)) {
      problems.push({ field: 'startsAt', message: 'Horário de início inválido.' });
    } else {
      startsAt = inicioBruto;
    }
  }

  let endsAt: string | null = null;
  const fimBruto = input.endsAt === undefined || input.endsAt === null ? null : texto(input.endsAt);
  if (fimBruto !== null) {
    if (!ehInstante(fimBruto)) {
      problems.push({ field: 'endsAt', message: 'Horário de fim inválido.' });
    } else {
      endsAt = fimBruto;
    }
  }

  // Física do intervalo: sem início não há fim; o fim não antecede o início.
  if (endsAt !== null && startsAt === null) {
    problems.push({ field: 'endsAt', message: 'Não há fim sem início.' });
  } else if (startsAt !== null && endsAt !== null && Date.parse(endsAt) < Date.parse(startsAt)) {
    problems.push({ field: 'endsAt', message: 'O fim não pode anteceder o início.' });
  }

  // Posição OPCIONAL: default 0; inteiro >= 0.
  let position = 0;
  if (input.position !== undefined && input.position !== null && input.position !== '') {
    const n = Number(input.position);
    if (!Number.isInteger(n) || n < 0) {
      problems.push({ field: 'position', message: 'Posição deve ser um inteiro >= 0.' });
    } else {
      position = n;
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      eventId: eventId!,
      eventName,
      title: title!,
      stage,
      startsAt,
      endsAt,
      performer,
      position,
    },
  };
}
