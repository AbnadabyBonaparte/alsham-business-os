import type {
  MaintenanceOrder,
  MntPriority,
  NewOrderInput,
  OrderKind,
  OrderStatus,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 17 — Manutenção.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). O relógio entra por
 * parâmetro — o pacote não olha o calendário sozinho.
 */

/**
 * ⭐ Espelho de `mnt.allowed_transition()` no `0032_mnt.sql` — há teste que
 * lê a migration e compara. `done → in_progress` EXISTE (o ops mantido);
 * `cancelled` é terminal; `open → done` existe (o pequeno reparo se
 * registra depois de feito).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [OrderStatus, OrderStatus])[] = [
  ['open', 'in_progress'],
  ['in_progress', 'open'],
  ['open', 'done'],
  ['in_progress', 'done'],
  ['open', 'cancelled'],
  ['in_progress', 'cancelled'],
  ['done', 'in_progress'],
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t);
}

export function canStart(status: OrderStatus): boolean {
  return canTransition(status, 'in_progress') && status === 'open';
}

export function canComplete(status: OrderStatus): boolean {
  return canTransition(status, 'done');
}

export function canCancel(status: OrderStatus): boolean {
  return canTransition(status, 'cancelled');
}

/** ⭐ A volta de done: o MESMO serviço à bancada. */
export function canReopen(status: OrderStatus): boolean {
  return status === 'done' && canTransition(status, 'in_progress');
}

export function canEditOrder(status: OrderStatus): boolean {
  return status === 'open' || status === 'in_progress';
}

/** ⭐ Concluir exige o relato — a recusa com nome, decidida aqui. */
export function whyCannotComplete(order: MaintenanceOrder, note: string): string | null {
  if (!canComplete(order.status)) {
    return 'A ordem não está em condição de ser concluída.';
  }
  if (note.trim().length === 0) {
    return 'Concluir exige o relato do que foi feito: conserto sem relato é conserto que ninguém confere.';
  }
  return null;
}

const DIA_MS = 86_400_000;

function dataUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

/** A próxima devida de UMA preventiva concluída — `null` sem recorrência. */
export function nextDueOn(order: MaintenanceOrder): string | null {
  if (order.kind !== 'preventive' || order.status !== 'done') return null;
  if (order.recurrenceDays === null || order.completedAt === null) return null;
  const base = dataUtc(order.completedAt) + order.recurrenceDays * DIA_MS;
  return new Date(base).toISOString().slice(0, 10);
}

export interface PreventiveDue {
  readonly order: MaintenanceOrder;
  readonly nextDueOn: string;
  readonly daysUntilDue: number;
}

/**
 * ⭐ A fila da preventiva: a identidade da rotina é (título, alvo) —
 * carimbada, sem cadastro de plano. Vale a conclusão MAIS RECENTE de cada
 * rotina; rotina que já tem ordem ABERTA não cobra de novo (cobrar em
 * dobro é o engano da régua, aqui no reparo). Negativo = atrasada.
 */
export function buildPreventiveQueue(
  orders: readonly MaintenanceOrder[],
  todayIso: string,
  windowDays: number,
): readonly PreventiveDue[] {
  const chave = (o: MaintenanceOrder) => `${o.title.toLowerCase()}|${o.target.toLowerCase()}`;

  const abertas = new Set(
    orders.filter((o) => o.status === 'open' || o.status === 'in_progress').map(chave),
  );

  const ultimaPorRotina = new Map<string, MaintenanceOrder>();
  for (const o of orders) {
    if (o.kind !== 'preventive' || o.status !== 'done') continue;
    if (o.recurrenceDays === null || o.completedAt === null) continue;
    const k = chave(o);
    const atual = ultimaPorRotina.get(k);
    if (!atual || (atual.completedAt ?? '') < o.completedAt) {
      ultimaPorRotina.set(k, o);
    }
  }

  const fila: PreventiveDue[] = [];
  for (const [k, o] of ultimaPorRotina) {
    if (abertas.has(k)) continue;
    const due = nextDueOn(o)!;
    const dias = Math.round((dataUtc(due) - dataUtc(todayIso)) / DIA_MS);
    if (dias <= windowDays) {
      fila.push({ order: o, nextDueOn: due, daysUntilDue: dias });
    }
  }
  return fila.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

/** A ordem do quadro: prioridade do tenant, depois chegada. */
export function orderBoard(
  orders: readonly MaintenanceOrder[],
  priorities: readonly MntPriority[],
): readonly MaintenanceOrder[] {
  const posicao = new Map(priorities.map((p) => [p.id, p.position]));
  return [...orders].sort((a, b) => {
    const pa = a.priorityId !== null ? (posicao.get(a.priorityId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const pb = b.priorityId !== null ? (posicao.get(b.priorityId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
}

const TITULO_MAX = 200;
const ALVO_MAX = 200;
const DESC_MAX = 4000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export function validateNewOrder(input: NewOrderInput): Validation<MaintenanceOrder> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Dê um título à ordem.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const kind = input.kind;
  if (kind !== 'corrective' && kind !== 'preventive') {
    problems.push({ field: 'kind', message: 'A manutenção é corretiva ou preventiva.' });
  }

  const target = texto(input.target);
  if (target === null) {
    problems.push({ field: 'target', message: 'Informe o alvo — o que vai ser mantido.' });
  } else if (target.length > ALVO_MAX) {
    problems.push({ field: 'target', message: `Alvo com no máximo ${ALVO_MAX} caracteres.` });
  }

  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  const rawRec = input.recurrenceDays;
  let recurrenceDays: number | null = null;
  if (rawRec !== undefined && rawRec !== null && rawRec !== '' && rawRec !== 0) {
    if (typeof rawRec === 'number' && Number.isInteger(rawRec) && rawRec > 0) {
      recurrenceDays = rawRec;
    } else {
      problems.push({ field: 'recurrenceDays', message: 'Recorrência em dias inteiros, maior que zero.' });
    }
  }
  if (recurrenceDays !== null && kind !== 'preventive') {
    problems.push({
      field: 'recurrenceDays',
      message: 'Recorrência é da PREVENTIVA — a corretiva responde à falha, não ao calendário.',
    });
  }

  const rawCost = input.costCents;
  const costCents =
    typeof rawCost === 'number' && Number.isInteger(rawCost) && rawCost >= 0 ? rawCost : null;
  if (rawCost !== undefined && rawCost !== null && rawCost !== '' && costCents === null) {
    problems.push({ field: 'costCents', message: 'Custo em centavos inteiros.' });
  }
  let currency = texto(input.currency)?.toUpperCase() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'Moeda ISO de três letras, ou vazia.' });
    currency = null;
  }
  if (costCents !== null && currency === null) {
    problems.push({ field: 'currency', message: 'Custo informado exige a moeda.' });
  }
  if (costCents === null && currency !== null) {
    problems.push({ field: 'costCents', message: 'Moeda informada exige o custo.' });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      title: title!,
      description,
      kind: kind as OrderKind,
      target: target!,
      assetId: null,
      priorityId: texto(input.priorityId),
      assigneeUserId: null,
      recurrenceDays,
      costCents,
      currency,
      status: 'open',
      completedAt: null,
      completionNote: '',
    },
  };
}

export interface MntSummary {
  readonly total: number;
  readonly openish: number;
  readonly preventiveDue: number;
}

export function summarizeOrders(
  orders: readonly MaintenanceOrder[],
  todayIso: string,
): MntSummary {
  let openish = 0;
  for (const o of orders) {
    if (o.status === 'open' || o.status === 'in_progress') openish += 1;
  }
  const devidas = buildPreventiveQueue(orders, todayIso, 0).length;
  return { total: orders.length, openish, preventiveDue: devidas };
}
