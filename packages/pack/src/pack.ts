import type {
  NewPackageInput,
  NewUseInput,
  Package,
  PackageBalance,
  Problem,
  Use,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 100 — Pacotes.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a RLS
 * e os gatilhos do `0115_pack.sql`; o pacote avisa antes, com a MESMA régua.
 *
 * ⭐⭐ O pacote fechado de sessões — a física do `loyalty`/`invest`: o saldo é
 * cálculo do livro (nunca coluna), e consumir mais que o saldo é recusado. O
 * DIVERGE do loyalty: o pacote é amarrado a UM serviço e UM cliente, com o
 * total congelado na compra — não uma carteira fungível.
 */

/**
 * ⭐ O saldo de um pacote: `remaining = total − usos`. É o espelho da VIEW
 * `pack.package_balances` (security_invoker). NUNCA coluna — sempre cálculo.
 */
export function balanceOf(totalSessions: number, usedCount: number): PackageBalance {
  return {
    totalSessions,
    usedCount,
    remaining: totalSessions - usedCount,
  };
}

/**
 * ⭐⭐ A TERCEIRA RESPOSTA, na régua de tela: só se pode dar baixa se ainda
 * resta sessão. Quem impede de verdade é o gatilho do banco (soma INTRA-schema);
 * isto é o aviso antes do erro, para a tela não oferecer o que o banco recusaria.
 */
export function canConsume(balance: PackageBalance): boolean {
  return balance.remaining > 0;
}

export function isExhausted(balance: PackageBalance): boolean {
  return balance.remaining <= 0;
}

/** O mapa de pacotes: os com saldo primeiro, depois por nome do cliente. */
export function orderPackages(packages: readonly Package[]): readonly Package[] {
  return [...packages].sort((a, b) => a.clientName.localeCompare(b.clientName));
}

export interface PackSummary {
  readonly total: number;
  readonly totalSessions: number;
}

export function summarize(packages: readonly Package[]): PackSummary {
  let totalSessions = 0;
  for (const p of packages) totalSessions += p.totalSessions;
  return { total: packages.length, totalSessions };
}

const TEXTO_MAX = 200;
const SERVICE_MAX = 200;
const NOTE_MAX = 500;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida a compra de um pacote novo. `clientId`, `service` e `totalSessions`
 * são OBRIGATÓRIOS — não há pacote sem cliente (o dono), sem serviço (o que se
 * compra) nem sem total (a trave). Ainda assim `clientId` é ID SOLTO: a
 * validação confere que a tela informou um valor, nunca que a linha existe no
 * crm (isso é integridade de outro schema). `totalSessions` deve ser inteiro
 * > 0 — um pacote de zero sessões não é pacote.
 */
export function validateNewPackage(input: NewPackageInput): Validation<Package> {
  const problems: Problem[] = [];

  const clientId = texto(input.clientId);
  if (clientId === null) {
    problems.push({ field: 'clientId', message: 'Informe o cliente (id solto ao crm).' });
  }

  const service = texto(input.service);
  if (service === null) {
    problems.push({ field: 'service', message: 'Informe o serviço do pacote.' });
  } else if (service.length > SERVICE_MAX) {
    problems.push({ field: 'service', message: `Serviço com no máximo ${SERVICE_MAX} caracteres.` });
  }

  const clientName = texto(input.clientName) ?? '';
  if (clientName.length > TEXTO_MAX) {
    problems.push({ field: 'clientName', message: `Nome do cliente com no máximo ${TEXTO_MAX} caracteres.` });
  }

  const note = texto(input.note) ?? '';
  if (note.length > NOTE_MAX) {
    problems.push({ field: 'note', message: `Observação com no máximo ${NOTE_MAX} caracteres.` });
  }

  let totalSessions = 0;
  if (input.totalSessions === undefined || input.totalSessions === null) {
    problems.push({ field: 'totalSessions', message: 'Informe o total de sessões (inteiro > 0).' });
  } else {
    const t = input.totalSessions;
    if (typeof t !== 'number' || !Number.isInteger(t) || t <= 0) {
      problems.push({ field: 'totalSessions', message: 'O total de sessões é um inteiro maior que zero.' });
    } else {
      totalSessions = t;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      clientId: clientId!,
      clientName,
      service: service!,
      totalSessions,
      note,
    },
  };
}

/**
 * Valida o registro de um uso. `packageId` é obrigatório (a que pacote se dá
 * baixa) e `usedOn` é a data do uso — obrigatória (o fato tem quando). Note que
 * a régua de saldo NÃO mora aqui: é o gatilho do banco que recusa consumir mais
 * que a trave (soma INTRA-schema, autoridade única). Aqui só validamos a forma.
 */
export function validateNewUse(input: NewUseInput): Validation<Use> {
  const problems: Problem[] = [];

  const packageId = texto(input.packageId);
  if (packageId === null) {
    problems.push({ field: 'packageId', message: 'Informe o pacote a que se dá baixa.' });
  }

  const usedOn = texto(input.usedOn);
  if (usedOn === null) {
    problems.push({ field: 'usedOn', message: 'Informe a data do uso.' });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(usedOn)) {
    problems.push({ field: 'usedOn', message: 'A data do uso deve estar no formato AAAA-MM-DD.' });
  }

  const note = texto(input.note) ?? '';
  if (note.length > NOTE_MAX) {
    problems.push({ field: 'note', message: `Observação com no máximo ${NOTE_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      packageId: packageId!,
      usedOn: usedOn!,
      note,
    },
  };
}
