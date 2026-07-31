/**
 * O motor puro do Módulo 62 — Portfólio de projetos.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se um portfólio pode ser arquivado ou
 * se um projeto entra no agrupamento.
 *
 * ⭐ **A física é a do `vendor`/`dc` (registro que arquiva e volta),
 * re-perguntada:** o portfólio é uma LEITURA que se organiza — um agrupamento
 * que a empresa arquiva quando o ciclo executivo termina e reabre no seguinte.
 * É a MESMA leitura (obrigá-la a renascer partiria a lista de projetos em
 * dois). Então `archived → active` EXISTE — o DIVERGE dos fins TERMINAIS do
 * `proj` (Módulo 53), onde `completed`/`cancelled` não reabrem. O
 * `ALLOWED_TRANSITIONS` abaixo é o espelho de `pfolio.allowed_transition()`
 * no `0077_pfolio.sql`, e um teste lê a migration e confere que os dois dizem
 * a mesma coisa.
 */
import type {
  Member,
  NewMemberInput,
  NewPortfolioInput,
  Portfolio,
  PortfolioStatus,
  PortfolioSummary,
  Problem,
  Validation,
} from './types.ts';

/** active ↔ archived, os dois sentidos. O portfólio volta (o DIVERGE do proj). */
export const ALLOWED_TRANSITIONS: readonly (readonly [PortfolioStatus, PortfolioStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly PortfolioStatus[] = ['active', 'archived'];

export function canTransition(from: PortfolioStatus, to: PortfolioStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: PortfolioStatus): readonly PortfolioStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Arquivar existe do ativo. */
export function canArchive(status: PortfolioStatus): boolean {
  return canTransition(status, 'archived');
}

/** Restaurar (reabrir) existe do arquivado — o portfólio volta. */
export function canRestore(status: PortfolioStatus): boolean {
  return canTransition(status, 'active');
}

const ORDEM: Record<PortfolioStatus, number> = {
  active: 0,
  archived: 1,
};

/** Ativos primeiro, depois arquivados; dentro, por nome. */
export function orderPortfolios(portfolios: readonly Portfolio[]): readonly Portfolio[] {
  return [...portfolios].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.name.localeCompare(b.name);
  });
}

export function summarizePortfolios(portfolios: readonly Portfolio[]): PortfolioSummary {
  return {
    total: portfolios.length,
    active: portfolios.filter((p) => p.status === 'active').length,
    archived: portfolios.filter((p) => p.status === 'archived').length,
  };
}

const NOME_MAX = 200;
const DESC_MAX = 2000;
const NOME_PROJETO_MAX = 200;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um portfólio novo. O nome é obrigatório; a descrição é OPCIONAL (um
 * portfólio sem descrição é honesto). Nasce ativo, com `id` vazio — a pura
 * camada nunca inventa dado do servidor.
 */
export function validateNewPortfolio(input: NewPortfolioInput): Validation<Portfolio> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do portfólio.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  // Descrição é opcional: ausente vira '' (vazio), não um erro.
  const descBruta = texto(input.description);
  let description = '';
  if (descBruta !== null) {
    if (descBruta.length > DESC_MAX) {
      problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    } else {
      description = descBruta;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { id: '', name: name!, description, status: 'active' },
  };
}

/**
 * Valida um membro novo (o vínculo portfólio↔projeto). Portfólio e projeto são
 * obrigatórios; o nome do projeto é carimbado pela tela e OPCIONAL (ausente
 * vira vazio). Nasce com `id` vazio.
 */
export function validateNewMember(input: NewMemberInput): Validation<Member> {
  const problems: Problem[] = [];

  const portfolioId = texto(input.portfolioId);
  if (portfolioId === null) {
    problems.push({ field: 'portfolioId', message: 'Informe o portfólio.' });
  }

  const projectId = texto(input.projectId);
  if (projectId === null) {
    problems.push({ field: 'projectId', message: 'Informe o projeto.' });
  }

  const projectNameBruto = texto(input.projectName);
  let projectName = '';
  if (projectNameBruto !== null) {
    if (projectNameBruto.length > NOME_PROJETO_MAX) {
      problems.push({ field: 'projectName', message: `Nome do projeto com no máximo ${NOME_PROJETO_MAX} caracteres.` });
    } else {
      projectName = projectNameBruto;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { id: '', portfolioId: portfolioId!, projectId: projectId!, projectName },
  };
}
