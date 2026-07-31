/**
 * O motor puro do Módulo 47 — Estoque Mínimo.
 *
 * ⭐⭐ A DECISÃO-ESTRELA vive numa FUNÇÃO PURA, não numa consulta.
 *
 * A comparação "estoque atual < mínimo" é `needsReorder()` aqui embaixo — uma
 * função que recebe o saldo POR PARÂMETRO e o confronta com a regra. O saldo
 * NÃO é lido do `inv`: quem o traz é o chamador (um Server Action do portal),
 * que já leu o `inv` na tela. Este módulo nunca conhece o `inv`; o vínculo é
 * um id solto que a apresentação sabe resolver. É "módulo não conhece módulo"
 * levado ao limite — o acoplamento é ZERO, nem por evento.
 *
 * ⭐ A física do ciclo é a do `vendor` (configuração que volta), re-perguntada:
 * a regra NÃO é fato consumado (o `occ`, imutável) — é parametrização. Uma
 * regra que a empresa desligou e religa é a MESMA regra. Então `archived →
 * active` EXISTE. O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `reorder.allowed_transition()` no `0062_reorder.sql`, e um teste lê a
 * migration e confere que os dois dizem a mesma coisa.
 */
import type {
  NewRuleInput,
  Problem,
  Rule,
  RuleStatus,
  RuleSummary,
  Validation,
} from './types.ts';

/** active ↔ archived. A regra volta (o DIVERGE do hr). */
export const ALLOWED_TRANSITIONS: readonly (readonly [RuleStatus, RuleStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly RuleStatus[] = ['active', 'archived'];

export function canTransition(from: RuleStatus, to: RuleStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: RuleStatus): readonly RuleStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

export function canArchive(status: RuleStatus): boolean {
  return canTransition(status, 'archived');
}

export function canReopen(status: RuleStatus): boolean {
  return canTransition(status, 'active');
}

/** Ativas primeiro, depois por produto — a leitura do cadastro vivo. */
export function orderRules(rules: readonly Rule[]): readonly Rule[] {
  const peso = (s: RuleStatus): number => (s === 'active' ? 0 : 1);
  return [...rules].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.product.localeCompare(b.product);
  });
}

export function summarizeRules(rules: readonly Rule[]): RuleSummary {
  return {
    total: rules.length,
    active: rules.filter((r) => r.status === 'active').length,
    archived: rules.filter((r) => r.status === 'archived').length,
  };
}

// ---------------------------------------------------------------------------
// ⭐⭐ A CAMADA DE APRESENTAÇÃO — a comparação, alimentada de FORA
// ---------------------------------------------------------------------------

/**
 * A regra dispara reabastecimento? Recebe o saldo atual POR PARÂMETRO — este
 * módulo nunca o lê do `inv`. É a demonstração arquitetural do módulo: a
 * comparação é pura, e o dado do outro módulo entra por quem chama.
 */
export function needsReorder(currentQuantity: number, rule: Rule): boolean {
  return currentQuantity < rule.minimumQuantity;
}

/**
 * Dadas as regras e um mapa de saldos (`invItemId → saldo`) fornecido de FORA
 * pelo chamador — nunca lido daqui —, devolve as regras ATIVAS que estão
 * abaixo do mínimo. Regra arquivada não sugere; regra sem item vinculado ou
 * sem saldo informado não tem como comparar, e fica de fora (não se chuta).
 */
export function flagLowStock(
  rules: readonly Rule[],
  quantitiesByItem: ReadonlyMap<string, number>,
): readonly Rule[] {
  return rules.filter((rule) => {
    if (rule.status !== 'active') return false;
    if (rule.invItemId === null) return false;
    const saldo = quantitiesByItem.get(rule.invItemId);
    if (saldo === undefined) return false;
    return needsReorder(saldo, rule);
  });
}

const PRODUTO_MAX = 200;
const ITEM_NOME_MAX = 200;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma regra nova. O produto e a quantidade mínima são obrigatórios; o
 * vínculo com o item de estoque é OPCIONAL (nem todo produto é um item do
 * `inv`). Nasce ativa, com `id` vazio — a pura camada nunca inventa dado do
 * servidor.
 */
export function validateNewRule(input: NewRuleInput): Validation<Rule> {
  const problems: Problem[] = [];

  const product = texto(input.product);
  if (product === null) {
    problems.push({ field: 'product', message: 'Informe o produto.' });
  } else if (product.length > PRODUTO_MAX) {
    problems.push({ field: 'product', message: `Produto com no máximo ${PRODUTO_MAX} caracteres.` });
  }

  // A quantidade mínima é OBRIGATÓRIA e NUNCA negativa (a mesma lei do CHECK).
  const q = input.minimumQuantity;
  if (typeof q !== 'number' || !Number.isFinite(q)) {
    problems.push({ field: 'minimumQuantity', message: 'Informe a quantidade mínima.' });
  } else if (q < 0) {
    problems.push({ field: 'minimumQuantity', message: 'A quantidade mínima não pode ser negativa.' });
  }

  // O vínculo com o item de estoque é opcional — id solto, sem FK.
  const invItemId = texto(input.invItemId);

  // O nome do item é opcional: ausente vira '' (vazio), não um erro.
  const nomeBruto = texto(input.invItemName);
  let invItemName = '';
  if (nomeBruto !== null) {
    if (nomeBruto.length > ITEM_NOME_MAX) {
      problems.push({ field: 'invItemName', message: `Nome do item com no máximo ${ITEM_NOME_MAX} caracteres.` });
    } else {
      invItemName = nomeBruto;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      product: product!,
      invItemId,
      invItemName,
      minimumQuantity: q as number,
      status: 'active',
    },
  };
}
