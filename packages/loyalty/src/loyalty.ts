/**
 * O motor puro do Módulo 74 — Fidelidade (Loyalty).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `timesheet`, o `pcost`, o `cash`): o
 * movimento de pontos é fato consumado — nasce e nunca muda. Por isso este motor
 * NÃO TEM transições de ciclo de vida, NÃO TEM `ALLOWED_TRANSITIONS`, NÃO TEM
 * `canTransition`. A ausência é a lei: o teste lê o `0089_loyalty.sql` e confere
 * que a migration também não declara `allowed_transition` e não tem coluna de
 * status.
 *
 * ⭐⭐ A DIREÇÃO mora no TIPO (`entry_type`), a "sinal do tipo" do `cash`: `earn`
 * soma, `redeem` subtrai; `points` é SEMPRE > 0. O saldo é `Σ(earn) − Σ(redeem)`
 * (`computeBalance`) — a mesma conta da VIEW `loyalty.customer_balances`.
 *
 * ⭐⭐ A TERCEIRA RESPOSTA ao "pode ficar negativo?": resgatar mais que o saldo é
 * RECUSADO (`canRedeem`) — a física do `invest`, re-perguntada para os pontos. O
 * gatilho do banco confere o mesmo somando INTRA-schema.
 *
 * ⛔ FORA deste motor, por decisão de canon: NÃO converte pontos↔dinheiro (regra
 * de acúmulo é configuração de campanha, capacidade futura) e NÃO expira pontos
 * por relógio (sem cron fingido — Lei 7; a baixa por validade, quando
 * construída, é um `redeem` com motivo).
 */
import type {
  CustomerBalance,
  EntryType,
  LoyaltyEntry,
  NewEntryInput,
  Problem,
  Validation,
} from './types.ts';

/** As duas direções possíveis — a régua fechada do `entry_type`. */
export const ENTRY_TYPES: readonly EntryType[] = ['earn', 'redeem'];

/**
 * O saldo do livro: `Σ(earn) − Σ(redeem)`. A mesma conta da VIEW do banco. Nunca
 * chute — sempre soma. Livro vazio dá zero.
 */
export function computeBalance(entries: readonly LoyaltyEntry[]): number {
  return entries.reduce(
    (saldo, e) => saldo + (e.entryType === 'earn' ? e.points : -e.points),
    0,
  );
}

/**
 * Pode resgatar `points` deste livro? Só se `points` for positivo E não passar
 * do saldo. ⭐⭐ A TERCEIRA RESPOSTA (a física do `invest`): ninguém resgata o que
 * não tem. O gatilho do banco faz a mesma conta somando INTRA-schema.
 */
export function canRedeem(entries: readonly LoyaltyEntry[], points: number): boolean {
  if (!Number.isFinite(points) || points <= 0) return false;
  return points <= computeBalance(entries);
}

/**
 * Agrupa o livro por cliente e calcula o saldo de cada um. Cada cliente vira uma
 * linha com o saldo (Σ earn − Σ redeem), a contagem de `earn` e a de `redeem`.
 * Espelha a VIEW `loyalty.customer_balances`. Ordem estável por `customerId`.
 */
export function summarizeByCustomer(entries: readonly LoyaltyEntry[]): CustomerBalance[] {
  const mapa = new Map<string, { balancePoints: number; earnCount: number; redeemCount: number }>();
  for (const e of entries) {
    const atual = mapa.get(e.customerId) ?? { balancePoints: 0, earnCount: 0, redeemCount: 0 };
    if (e.entryType === 'earn') {
      atual.balancePoints += e.points;
      atual.earnCount += 1;
    } else {
      atual.balancePoints -= e.points;
      atual.redeemCount += 1;
    }
    mapa.set(e.customerId, atual);
  }
  return [...mapa.entries()]
    .map(([customerId, v]) => ({
      customerId,
      balancePoints: v.balancePoints,
      earnCount: v.earnCount,
      redeemCount: v.redeemCount,
    }))
    .sort((a, b) => a.customerId.localeCompare(b.customerId));
}

const REASON_MAX = 1000;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

function isEntryType(valor: unknown): valor is EntryType {
  return valor === 'earn' || valor === 'redeem';
}

/**
 * Valida um movimento novo. O cliente (id solto) e o tipo são obrigatórios; os
 * pontos têm de ser um INTEIRO estritamente positivo (o CHECK do banco confere
 * `points > 0`, e o sinal mora no TIPO); o motivo e a origem (id solto) são
 * OPCIONAIS. Nasce com `id` vazio: a pura camada nunca inventa dado do servidor.
 *
 * ⚠️ Este validador NÃO confere o saldo — a regra "resgatar mais que o saldo é
 * recusado" mora em `canRedeem` (e no gatilho do banco), porque depende do livro
 * inteiro do cliente, que a validação de um único input não vê.
 */
export function validateNewEntry(input: NewEntryInput): Validation<LoyaltyEntry> {
  const problems: Problem[] = [];

  // Cliente: id solto obrigatório (não há ponto sem dono).
  const customerId = texto(input.customerId);
  if (customerId === null) {
    problems.push({ field: 'customerId', message: 'Informe o cliente do movimento de pontos.' });
  }

  // Nome do cliente carimbado pela tela — opcional (vira '').
  const customerName = texto(input.customerName) ?? '';

  // Tipo: earn ou redeem, obrigatório.
  if (!isEntryType(input.entryType)) {
    problems.push({ field: 'entryType', message: 'O tipo deve ser earn (ganhar) ou redeem (resgatar).' });
  }

  // Pontos: inteiro finito, ESTRITAMENTE positivo. Zero é linha muda; negativo
  // não existe — o sinal é o tipo. Corrigir é lançar o ato inverso.
  const pontos = input.points;
  if (typeof pontos !== 'number' || !Number.isFinite(pontos)) {
    problems.push({ field: 'points', message: 'Informe os pontos do movimento (número).' });
  } else if (!Number.isInteger(pontos)) {
    problems.push({ field: 'points', message: 'Os pontos devem ser um número inteiro.' });
  } else if (pontos <= 0) {
    problems.push({ field: 'points', message: 'Os pontos devem ser maiores que zero.' });
  }

  // Motivo opcional.
  const motivoBruto = texto(input.reason);
  let reason = '';
  if (motivoBruto !== null) {
    if (motivoBruto.length > REASON_MAX) {
      problems.push({ field: 'reason', message: `Motivo com no máximo ${REASON_MAX} caracteres.` });
    } else {
      reason = motivoBruto;
    }
  }

  // Origem (id solto) — OPCIONAL: nem todo movimento tem venda.
  const sourceId = texto(input.sourceId);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      customerId: customerId!,
      customerName,
      entryType: input.entryType as EntryType,
      points: pontos as number,
      reason,
      sourceId,
    },
  };
}
