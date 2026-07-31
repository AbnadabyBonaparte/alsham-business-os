/**
 * O motor puro do Módulo 84 — Créditos de Compensação (Creditbalance).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `loyalty`, o `timesheet`, o `cash`): o
 * crédito de energia é fato consumado — nasce e nunca muda. Por isso este motor
 * NÃO TEM transições de ciclo de vida, NÃO TEM `ALLOWED_TRANSITIONS`, NÃO TEM
 * `canTransition`. A ausência é a lei: o teste lê o `0099_creditbalance.sql` e
 * confere que a migration também não declara `allowed_transition` e não tem
 * coluna de status.
 *
 * ⭐⭐ A DIREÇÃO mora no TIPO (`credit_type`), a "sinal do tipo" do `loyalty`:
 * `generated` soma, `consumed` subtrai; `quantityKwh` é SEMPRE > 0. O saldo é
 * `Σ(generated) − Σ(consumed)` (`computeBalance`) — a mesma conta da VIEW
 * `creditbalance.subscription_balances`.
 *
 * ⭐⭐ A TERCEIRA RESPOSTA ao "pode ficar negativo?": consumir mais que o saldo é
 * RECUSADO (`canConsume`). O RESULTADO é o mesmo do `loyalty` e do `invest`, mas
 * o ARGUMENTO é PRÓPRIO, e não copiado: no SCEE um crédito só existe porque
 * energia excedente foi FISICAMENTE gerada e injetada — registrar saldo negativo
 * inventaria energia inexistente (a razão infísica do `esg`: energia não se
 * deve, se gera). O gatilho do banco confere o mesmo somando INTRA-schema.
 *
 * ⛔ FORA deste motor, por decisão de canon: NÃO expira crédito por relógio (o
 * SCEE dá 60 meses — sem cron fingido, Lei 7; a baixa por validade, quando
 * construída, é um `consumed` com motivo) e NÃO calcula abatimento na fatura (é
 * o `dre`/`cash`, FORA).
 */
import type {
  CreditEntry,
  CreditType,
  NewEntryInput,
  Problem,
  SubscriptionBalance,
  Validation,
} from './types.ts';

/** As duas direções possíveis — a régua fechada do `credit_type`. */
export const CREDIT_TYPES: readonly CreditType[] = ['generated', 'consumed'];

/**
 * O saldo do livro: `Σ(generated) − Σ(consumed)`. A mesma conta da VIEW do
 * banco. Nunca chute — sempre soma. Livro vazio dá zero.
 */
export function computeBalance(entries: readonly CreditEntry[]): number {
  return entries.reduce(
    (saldo, e) => saldo + (e.creditType === 'generated' ? e.quantityKwh : -e.quantityKwh),
    0,
  );
}

/**
 * Pode consumir (compensar) `qty` kWh deste livro? Só se `qty` for positivo E
 * não passar do saldo. ⭐⭐ A TERCEIRA RESPOSTA, por física própria: não se
 * compensa com energia que não se gerou. O gatilho do banco faz a mesma conta
 * somando INTRA-schema.
 */
export function canConsume(entries: readonly CreditEntry[], qty: number): boolean {
  if (!Number.isFinite(qty) || qty <= 0) return false;
  return qty <= computeBalance(entries);
}

/**
 * Agrupa o livro por assinatura e calcula o saldo de cada uma. Cada assinatura
 * vira uma linha com o saldo (Σ generated − Σ consumed), a contagem de
 * `generated` e a de `consumed`. Espelha a VIEW
 * `creditbalance.subscription_balances`. A assinatura pode ser `null` (o balcão
 * geral do tenant) — vira uma linha própria. Ordem estável.
 */
export function summarizeBySubscription(entries: readonly CreditEntry[]): SubscriptionBalance[] {
  // A chave do Map guarda a assinatura de conta; o sentinela representa o NULL
  // (o balcão geral), mas o `subscriptionId` devolvido é sempre o original.
  const SENTINELA = '~::null';
  const mapa = new Map<
    string,
    { subscriptionId: string | null; balanceKwh: number; generatedCount: number; consumedCount: number }
  >();
  for (const e of entries) {
    const chave = e.subscriptionId ?? SENTINELA;
    const atual =
      mapa.get(chave) ??
      { subscriptionId: e.subscriptionId, balanceKwh: 0, generatedCount: 0, consumedCount: 0 };
    if (e.creditType === 'generated') {
      atual.balanceKwh += e.quantityKwh;
      atual.generatedCount += 1;
    } else {
      atual.balanceKwh -= e.quantityKwh;
      atual.consumedCount += 1;
    }
    mapa.set(chave, atual);
  }
  return [...mapa.entries()]
    .map(([, v]) => ({
      subscriptionId: v.subscriptionId,
      balanceKwh: v.balanceKwh,
      generatedCount: v.generatedCount,
      consumedCount: v.consumedCount,
    }))
    .sort((a, b) => {
      // O balcão geral (assinatura null) fica sempre por último; as assinaturas
      // reais entre si por ordem estável do id.
      if (a.subscriptionId === null) return b.subscriptionId === null ? 0 : 1;
      if (b.subscriptionId === null) return -1;
      return a.subscriptionId.localeCompare(b.subscriptionId);
    });
}

const REASON_MAX = 1000;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

function isCreditType(valor: unknown): valor is CreditType {
  return valor === 'generated' || valor === 'consumed';
}

/**
 * Valida um lançamento novo. O tipo é obrigatório; a quantidade tem de ser um
 * número finito estritamente positivo (o CHECK do banco confere `quantity_kwh >
 * 0`, e o sinal mora no TIPO). ⭐ Diferente do `loyalty`, a quantidade NÃO
 * precisa ser inteira — é kWh, e a fração é leitura real. A assinatura (id
 * solto), o nome e o motivo são OPCIONAIS. Nasce com `id` vazio: a pura camada
 * nunca inventa dado do servidor.
 *
 * ⚠️ Este validador NÃO confere o saldo — a regra "consumir mais que o saldo é
 * recusado" mora em `canConsume` (e no gatilho do banco), porque depende do
 * livro inteiro da assinatura, que a validação de um único input não vê.
 */
export function validateNewEntry(input: NewEntryInput): Validation<CreditEntry> {
  const problems: Problem[] = [];

  // Tipo: generated ou consumed, obrigatório.
  if (!isCreditType(input.creditType)) {
    problems.push({ field: 'creditType', message: 'O tipo deve ser generated (gerado) ou consumed (consumido).' });
  }

  // Quantidade: número finito, ESTRITAMENTE positivo. Zero é linha muda;
  // negativo não existe — o sinal é o tipo. NÃO exige inteiro (é kWh).
  const qtd = input.quantityKwh;
  if (typeof qtd !== 'number' || !Number.isFinite(qtd)) {
    problems.push({ field: 'quantityKwh', message: 'Informe a quantidade em kWh do lançamento (número).' });
  } else if (qtd <= 0) {
    problems.push({ field: 'quantityKwh', message: 'A quantidade em kWh deve ser maior que zero.' });
  }

  // Assinatura (id solto) — OPCIONAL: o NULL é o balcão geral do tenant.
  const subscriptionId = texto(input.subscriptionId);

  // Nome da assinatura carimbado pela tela — opcional (vira '').
  const subscriptionName = texto(input.subscriptionName) ?? '';

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

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      creditType: input.creditType as CreditType,
      quantityKwh: qtd as number,
      subscriptionId,
      subscriptionName,
      reason,
    },
  };
}
