/**
 * O motor puro do Módulo 72 — Catálogo de Produtos.
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; nunca decide se um produto pode ser arquivado.
 *
 * O `ALLOWED_TRANSITIONS` é o espelho EXATO de `catalog.allowed_transition()`
 * no `0087_catalog.sql` (teste lê e compara). `active ↔ archived` é reversível:
 * o produto descontinuado que a loja volta a vender é o MESMO produto (a física
 * do vendor/mall — o DIVERGE do hr, onde `terminated` é terminal).
 */
import type {
  NewProductInput,
  Problem,
  Product,
  ProductStatus,
  ProductSummary,
  Validation,
} from './types.ts';

/** ⭐ active ↔ archived (a física do vendor — o produto volta ao catálogo). */
export const ALLOWED_TRANSITIONS: readonly (readonly [ProductStatus, ProductStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export const ALL_STATUSES: readonly ProductStatus[] = ['active', 'archived'];

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

/** Só o produto ativo pode ser arquivado (tirado do catálogo vivo). */
export function canArchive(status: ProductStatus): boolean {
  return status === 'active';
}

/** Só o produto arquivado pode voltar ao catálogo. */
export function canRestore(status: ProductStatus): boolean {
  return status === 'archived';
}

export function summarizeProducts(products: readonly Product[]): ProductSummary {
  return {
    total: products.length,
    active: products.filter((p) => p.status === 'active').length,
    archived: products.filter((p) => p.status === 'archived').length,
  };
}

const NAME_MAX = 200;
const SKU_MAX = 120;
const CURRENCY_LEN = 3;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um produto novo (nasce `active`). O nome é obrigatório; o SKU é TEXTO
 * LIVRE opcional (`''` quando ausente); o preço é inteiro `>= 0` (0 permitido —
 * um brinde é honesto; negativo recusado); a moeda tem 3 letras. Nasce com `id`
 * vazio.
 */
export function validateNewProduct(input: NewProductInput): Validation<Product> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do produto.' });
  } else if (name.length > NAME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });
  }

  // ⭐ SKU: OPCIONAL, texto livre. Ausente vira ''.
  let sku = '';
  const skuBruto = texto(input.sku);
  if (skuBruto !== null) {
    if (skuBruto.length > SKU_MAX) {
      problems.push({ field: 'sku', message: `SKU com no máximo ${SKU_MAX} caracteres.` });
    } else {
      sku = skuBruto;
    }
  }

  // Preço de tabela: inteiro em centavos, >= 0 (0 permitido; negativo recusado).
  let priceCents = 0;
  if (input.priceCents === undefined || input.priceCents === null) {
    priceCents = 0;
  } else if (typeof input.priceCents !== 'number' || !Number.isInteger(input.priceCents)) {
    problems.push({ field: 'priceCents', message: 'O preço deve ser um valor inteiro em centavos.' });
  } else if (input.priceCents < 0) {
    problems.push({ field: 'priceCents', message: 'O preço não pode ser negativo.' });
  } else {
    priceCents = input.priceCents;
  }

  // Moeda: 3 letras (ISO-4217). Ausente assume BRL, o default do schema.
  let currency = 'BRL';
  if (input.currency === undefined || input.currency === null || input.currency === '') {
    currency = 'BRL';
  } else {
    const c = texto(input.currency);
    if (c === null || c.length !== CURRENCY_LEN) {
      problems.push({ field: 'currency', message: 'A moeda deve ter 3 letras (ex.: BRL).' });
    } else {
      currency = c.toUpperCase();
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      name: name!,
      sku,
      priceCents,
      currency,
      status: 'active',
    },
  };
}
