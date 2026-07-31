/**
 * O motor puro do Módulo 50 — Centros de Distribuição.
 *
 * ⭐ A física é a do `vendor` (ativo/relação que volta), re-perguntada: um
 * centro de distribuição NÃO é gente contratada (o `hr`, onde `terminated` é
 * terminal) — é ativo de operação. O CD que a empresa desativou e volta a
 * operar é o MESMO centro. Então `archived → active` EXISTE. O
 * `ALLOWED_TRANSITIONS` abaixo é o espelho de `dc.allowed_transition()` no
 * `0065_dc.sql`, e um teste lê a migration e confere que os dois dizem a
 * mesma coisa.
 */
import type {
  Center,
  CenterStatus,
  CenterSummary,
  NewCenterInput,
  Problem,
  Validation,
} from './types.ts';

/** active ↔ archived. O CD volta (o DIVERGE do hr). */
export const ALLOWED_TRANSITIONS: readonly (readonly [CenterStatus, CenterStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly CenterStatus[] = ['active', 'archived'];

export function canTransition(from: CenterStatus, to: CenterStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: CenterStatus): readonly CenterStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

export function canArchive(status: CenterStatus): boolean {
  return canTransition(status, 'archived');
}

export function canReopen(status: CenterStatus): boolean {
  return canTransition(status, 'active');
}

/** Ativos primeiro, depois por nome — a leitura do cadastro vivo. */
export function orderCenters(centers: readonly Center[]): readonly Center[] {
  const peso = (s: CenterStatus): number => (s === 'active' ? 0 : 1);
  return [...centers].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.name.localeCompare(b.name);
  });
}

export function summarizeCenters(centers: readonly Center[]): CenterSummary {
  return {
    total: centers.length,
    active: centers.filter((c) => c.status === 'active').length,
    archived: centers.filter((c) => c.status === 'archived').length,
  };
}

const NOME_MAX = 200;
const ADDRESS_MAX = 300;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um cadastro novo. O nome é obrigatório; o endereço é OPCIONAL (um CD
 * sem endereço cadastrado é honesto). Nasce ativo, com `id` vazio — a pura
 * camada nunca inventa dado do servidor.
 */
export function validateNewCenter(input: NewCenterInput): Validation<Center> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do centro de distribuição.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  // Endereço é opcional: ausente vira '' (vazio), não um erro.
  const enderecoBruto = texto(input.address);
  let address = '';
  if (enderecoBruto !== null) {
    if (enderecoBruto.length > ADDRESS_MAX) {
      problems.push({ field: 'address', message: `Endereço com no máximo ${ADDRESS_MAX} caracteres.` });
    } else {
      address = enderecoBruto;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { id: '', name: name!, address, status: 'active' },
  };
}
