/**
 * O motor puro do Módulo 48 — Planejamento de Demanda.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se um plano pode ser publicado.
 *
 * ⭐ A física é a do `rfq`/`quote` (o documento que congela ao publicar),
 * RE-PERGUNTADA e com o DIVERGE assinado: `published` é TERMINAL — não há um
 * segundo ato (nada de `awarded`). O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `dem.allowed_transition()` no `0063_dem.sql`, e um teste lê a migration e
 * confere que os dois dizem a mesma coisa.
 */
import type {
  NewPlanInput,
  Plan,
  PlanLine,
  PlanStatus,
  PlanSummary,
  Problem,
  Validation,
} from './types.ts';

/**
 * ⭐ draft→published (publicar), draft→cancelled (abandonar o rascunho).
 * `published` e `cancelled` são TERMINAIS: o próximo período é plano novo.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [PlanStatus, PlanStatus])[] = [
  ['draft', 'published'],
  ['draft', 'cancelled'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly PlanStatus[] = ['draft', 'published', 'cancelled'];

export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: PlanStatus): readonly PlanStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** ⭐ Publicar (draft→published) só existe para o rascunho. */
export function canPublish(status: PlanStatus): boolean {
  return status === 'draft';
}

/** Cancelar (abandonar) só existe para o rascunho. */
export function canCancel(status: PlanStatus): boolean {
  return status === 'draft';
}

/** O conteúdo (período/linhas) só muda em rascunho — o publicado não se edita. */
export function canEditContent(status: PlanStatus): boolean {
  return status === 'draft';
}

const ORDEM: Record<PlanStatus, number> = {
  draft: 0,
  published: 1,
  cancelled: 2,
};

/** Rascunhos primeiro, depois publicados, depois cancelados; dentro, por período. */
export function orderPlans(plans: readonly Plan[]): readonly Plan[] {
  return [...plans].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.period.localeCompare(b.period);
  });
}

export function summarizePlans(plans: readonly Plan[]): PlanSummary {
  return {
    total: plans.length,
    draft: plans.filter((p) => p.status === 'draft').length,
    published: plans.filter((p) => p.status === 'published').length,
    cancelled: plans.filter((p) => p.status === 'cancelled').length,
  };
}

const PERIODO_MAX = 120;
const TITULO_MAX = 200;
const PRODUTO_MAX = 300;
const UNIDADE_MAX = 40;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Valida um plano novo (sempre nasce `draft`).
 * O período é obrigatório; o título é OPCIONAL (vira ''). Exige ao menos uma
 * linha válida — plano vazio não vai à cadeia. Erros de linha vêm com o índice
 * no campo (`lines.0.quantity`). Nasce com `id` vazio — a pura camada nunca
 * inventa dado do servidor.
 */
export function validateNewPlan(input: NewPlanInput): Validation<Plan> {
  const problems: Problem[] = [];

  const period = texto(input.period);
  if (period === null) {
    problems.push({ field: 'period', message: 'Informe o período do plano.' });
  } else if (period.length > PERIODO_MAX) {
    problems.push({ field: 'period', message: `Período com no máximo ${PERIODO_MAX} caracteres.` });
  }

  // Título é opcional: ausente vira '' (vazio), não um erro.
  let title = texto(input.title) ?? '';
  if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
    title = title.slice(0, TITULO_MAX);
  }

  const rawLines = Array.isArray(input.lines) ? input.lines : null;
  if (rawLines === null || rawLines.length === 0) {
    problems.push({ field: 'lines', message: 'Inclua ao menos uma linha no plano.' });
  }

  const lines: PlanLine[] = [];
  if (rawLines) {
    rawLines.forEach((raw, idx) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const prefix = `lines.${idx}`;

      const product = texto(row.product);
      if (product === null) {
        problems.push({ field: `${prefix}.product`, message: 'Descreva o produto planejado.' });
      } else if (product.length > PRODUTO_MAX) {
        problems.push({ field: `${prefix}.product`, message: `Produto com no máximo ${PRODUTO_MAX} caracteres.` });
      }

      const qty = numero(row.quantity);
      if (qty === null || qty <= 0) {
        problems.push({ field: `${prefix}.quantity`, message: 'Quantidade deve ser maior que zero.' });
      }

      // Unidade é opcional: ausente vira '' (texto livre).
      let unit = texto(row.unit) ?? '';
      if (unit.length > UNIDADE_MAX) {
        problems.push({ field: `${prefix}.unit`, message: `Unidade com no máximo ${UNIDADE_MAX} caracteres.` });
        unit = '';
      }

      if (product !== null && qty !== null && qty > 0) {
        lines.push({ lineNo: lines.length + 1, product, quantity: qty, unit });
      }
    });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      period: period!,
      title,
      status: 'draft',
      cancelReason: '',
      lines,
    },
  };
}
