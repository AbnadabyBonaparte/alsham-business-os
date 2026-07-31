/**
 * O motor puro do Módulo 43 — Fornecedores.
 *
 * ⭐ A física é a do `mall` (relação comercial que volta), re-perguntada: o
 * fornecedor NÃO é gente contratada (o `hr`, onde `terminated` é terminal) — é
 * relação de compra. Quem a empresa deixou de usar e volta a comprar é o MESMO
 * fornecedor. Então `archived → active` EXISTE. O `ALLOWED_TRANSITIONS` abaixo
 * é o espelho de `vendor.allowed_transition()` no `0058_vendor.sql`, e um teste
 * lê a migration e confere que os dois dizem a mesma coisa.
 */
import type {
  NewSupplierInput,
  Problem,
  Supplier,
  SupplierStatus,
  SupplierSummary,
  Validation,
} from './types.ts';

/** active ↔ archived. O fornecedor volta (o DIVERGE do hr). */
export const ALLOWED_TRANSITIONS: readonly (readonly [SupplierStatus, SupplierStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly SupplierStatus[] = ['active', 'archived'];

export function canTransition(from: SupplierStatus, to: SupplierStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: SupplierStatus): readonly SupplierStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

export function canArchive(status: SupplierStatus): boolean {
  return canTransition(status, 'archived');
}

export function canReopen(status: SupplierStatus): boolean {
  return canTransition(status, 'active');
}

/** Ativos primeiro, depois por nome — a leitura do cadastro vivo. */
export function orderSuppliers(suppliers: readonly Supplier[]): readonly Supplier[] {
  const peso = (s: SupplierStatus): number => (s === 'active' ? 0 : 1);
  return [...suppliers].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.name.localeCompare(b.name);
  });
}

export function summarizeSuppliers(suppliers: readonly Supplier[]): SupplierSummary {
  return {
    total: suppliers.length,
    active: suppliers.filter((s) => s.status === 'active').length,
    archived: suppliers.filter((s) => s.status === 'archived').length,
  };
}

const NOME_MAX = 200;
const SEGMENTO_MAX = 120;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um cadastro novo. O nome é obrigatório; o segmento é OPCIONAL (um
 * fornecedor sem categoria é honesto). Nasce ativo, com `id` vazio — a pura
 * camada nunca inventa dado do servidor.
 */
export function validateNewSupplier(input: NewSupplierInput): Validation<Supplier> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do fornecedor.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  // Segmento é opcional: ausente vira '' (vazio), não um erro.
  const segmentoBruto = texto(input.segment);
  let segment = '';
  if (segmentoBruto !== null) {
    if (segmentoBruto.length > SEGMENTO_MAX) {
      problems.push({ field: 'segment', message: `Segmento com no máximo ${SEGMENTO_MAX} caracteres.` });
    } else {
      segment = segmentoBruto;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { id: '', name: name!, segment, status: 'active' },
  };
}
