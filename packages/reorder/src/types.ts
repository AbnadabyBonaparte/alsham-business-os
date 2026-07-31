/**
 * Tipos puros do Módulo 47 — Estoque Mínimo (ponto de reabastecimento).
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a REGRA de estoque
 * mínimo (o produto + a quantidade mínima) e o seu ciclo de vida.
 *
 * ⭐ Note o que NÃO existe aqui: nenhum campo de saldo atual, nenhuma leitura
 * do `inv`. Este módulo guarda a CONFIGURAÇÃO; o saldo vem de fora, na tela.
 */

/** O ciclo de vida da regra. `active ↔ archived` (o DIVERGE do hr). */
export type RuleStatus = 'active' | 'archived';

/** Uma regra de estoque mínimo. Campos carimbados pelo servidor nascem vazios. */
export interface Rule {
  readonly id: string;
  /** Produto/categoria TEXTO LIVRE — vocabulário do tenant. Obrigatório. */
  readonly product: string;
  /** Vínculo SOLTO ao item de estoque, quando houver. `null` se não houver. */
  readonly invItemId: string | null;
  /** Nome do item carimbado pela tela — texto livre. Pode ser vazio. */
  readonly invItemName: string;
  /** O ponto de reabastecimento — a quantidade mínima desejada. `>= 0`. */
  readonly minimumQuantity: number;
  readonly status: RuleStatus;
}

/** A entrada crua de uma regra nova — os campos vêm do formulário. */
export interface NewRuleInput {
  readonly product?: unknown;
  readonly invItemId?: unknown;
  readonly invItemName?: unknown;
  readonly minimumQuantity?: unknown;
}

/** Um resumo contável do cadastro. Todo número é `.length`, nunca chute. */
export interface RuleSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
