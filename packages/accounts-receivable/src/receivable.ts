import type {
  NewReceivableInput,
  Problem,
  Receivable,
  ReceivableStatus,
  Validation,
} from './types.ts';

/**
 * ⭐ **O CICLO DE VIDA DO TÍTULO A RECEBER.**
 *
 * Espelho exato de `ar.allowed_transition()` em `supabase/migrations/0010_ar.sql`,
 * e há um teste (`lifecycle.test.ts`) que LÊ AQUELE ARQUIVO e compara par a par.
 *
 * A tabela é a do Módulo 3 com os nomes trocados — e isso foi **conferido, não
 * copiado**. A pergunta mais fácil de errar era `received → cancelled`, e ela
 * foi feita de novo:
 *
 * ⛔ **`received → cancelled` NÃO EXISTE.** No `ap`, cancelar um título pago
 * apagaria a fronteira entre *"não devíamos isso"* e *"pagamos isso"*. Aqui
 * apagaria a fronteira entre *"não tínhamos a receber"* e **"recebemos o
 * dinheiro"** — e o segundo é mais grave, porque o dinheiro entrou na conta. Se
 * o recebimento tem de voltar (devolução, chargeback, cheque devolvido), ele
 * volta primeiro e só então o documento se cancela. Dois atos, dois registros.
 *
 * ⛔ **`cancelled` é terminal.** Se voltarem a dever, é documento NOVO.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ReceivableStatus, ReceivableStatus])[] = [
  ['open', 'partially_received'],
  ['open', 'received'],
  ['open', 'cancelled'],
  ['partially_received', 'received'],
  ['partially_received', 'open'],
  ['partially_received', 'cancelled'],
  ['received', 'partially_received'],
  ['received', 'open'],
];

/**
 * A transição é permitida?
 *
 * Ficar no mesmo estado é sempre permitido — não é transição, é o título
 * parado.
 */
export function canTransition(from: ReceivableStatus, to: ReceivableStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

/** Para onde este título pode ir a partir de onde está. Ordem estável. */
export function nextStatuses(from: ReceivableStatus): readonly ReceivableStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/**
 * O título pode ser cancelado a partir de onde está?
 *
 * Duas perguntas diferentes moram aqui, e a tela precisa das duas: *o ciclo de
 * vida permite?* e *esta pessoa pode?*. A segunda é do banco — há trigger que
 * exige `ar.receivable.cancel`. Esta função responde só a primeira, e é honesta
 * sobre isso.
 */
export function canCancel(status: ReceivableStatus): boolean {
  return canTransition(status, 'cancelled') && status !== 'cancelled';
}

/**
 * ⭐⭐ **O estado que o valor recebido IMPLICA — e a divergência do módulo.**
 *
 * O `ap` tem `statusForSettlement`, e a diferença entre as duas funções é uma
 * linha de comentário e nenhuma linha de código: **lá, receber a mais não
 * deveria acontecer (há `payables_no_overpay` no banco); aqui, acontece o tempo
 * todo e é aceito.**
 *
 * Ver `0010_ar.sql` §2.1 para as razões. Em resumo: pagar a mais é erro de quem
 * paga, e o sistema que paga pode recusar. Receber a mais é o que o pagador fez
 * — arredondou, incluiu juros que este módulo não modela, quitou dois
 * documentos numa transferência só. O dinheiro já está na conta, e recusar
 * obrigaria o operador a **mentir sobre o que entrou**.
 *
 * ⚠️ Não decide sobre título cancelado: cancelamento é ato de gente, não
 * consequência de aritmética.
 */
export function statusForReceipt(
  amountCents: number,
  receivedAmountCents: number,
  current: ReceivableStatus = 'open',
): ReceivableStatus {
  if (current === 'cancelled') return 'cancelled';
  if (receivedAmountCents <= 0) return 'open';
  // `>=`, e não `===`: receber a maior continua sendo "recebido".
  if (receivedAmountCents >= amountCents) return 'received';
  return 'partially_received';
}

/**
 * O saldo a receber.
 *
 * ⭐ **Nunca negativo, e é consequência direta da divergência.** Quando entrou
 * mais do que o devido, "a receber" é **zero** — não um número negativo. O
 * excedente é crédito do pagador, e tratá-lo é a capacidade *Cobrança*, que
 * está **NÃO CONSTRUÍDA**. Devolver negativo aqui faria a tela somar um valor
 * sem sentido no total em aberto.
 *
 * Zero para título cancelado: não se tem a receber o que não vale.
 */
export function outstandingCents(receivable: Receivable): number {
  if (receivable.status === 'cancelled') return 0;
  return Math.max(0, receivable.amountCents - receivable.receivedAmountCents);
}

/**
 * Entrou mais do que o devido?
 *
 * Existe para a tela poder MOSTRAR o fato em vez de escondê-lo. Um excedente
 * invisível é um número que não bate e ninguém sabe por quê.
 */
export function overpaidCents(receivable: Receivable): number {
  if (receivable.status === 'cancelled') return 0;
  return Math.max(0, receivable.receivedAmountCents - receivable.amountCents);
}

/** Está vencido em relação à data informada? O relógio vem de fora — função pura. */
export function isOverdue(receivable: Receivable, today: string): boolean {
  if (receivable.status === 'received' || receivable.status === 'cancelled') return false;
  return receivable.dueDate < today;
}

const REF_MAX = 120;
const NOME_MAX = 200;
const DESCRICAO_MAX = 500;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * **A validação de um título a receber novo.** Pura: nem banco, nem rede, nem
 * relógio.
 *
 * Devolve **todos** os problemas de uma vez, não o primeiro.
 *
 * O que NÃO se valida aqui, e por quê — as mesmas recusas do Módulo 3, porque a
 * pergunta é a mesma vestida do outro lado:
 *
 *   · **vencimento no passado não é erro.** Título vencido a receber é o caso
 *     mais comum de quem começa a usar o sistema — quem migra tem gaveta cheia
 *     deles, e é justamente o que ele quer cobrar;
 *   · **o pagador não é obrigatório.** Há crédito a receber sem contraparte
 *     nomeada, e exigir o nome faria a pessoa digitar "-";
 *   · **`settlementMethod` é texto livre e não tem lista.** Instrumento de
 *     cobrança é de um país e de uma década. Ver o ANTI-VIÉS em `0010_ar.sql`;
 *   · **o identificador fiscal não tem formato.** Nem 11 dígitos, nem 14, nem
 *     dígito verificador — a mesma decisão do `crm` e do `ap`.
 */
export function validateNewReceivable(input: NewReceivableInput): Validation<Receivable> {
  const problems: Problem[] = [];

  const externalRef = texto(input.externalRef);
  if (externalRef === null) {
    problems.push({ field: 'externalRef', message: 'Informe a referência do documento.' });
  } else if (externalRef.length > REF_MAX) {
    problems.push({
      field: 'externalRef',
      message: `A referência não pode passar de ${REF_MAX} caracteres.`,
    });
  }

  const dueDate = texto(input.dueDate);
  if (dueDate === null) {
    problems.push({ field: 'dueDate', message: 'Informe o vencimento.' });
  } else if (!isIsoDate(dueDate)) {
    problems.push({ field: 'dueDate', message: 'O vencimento deve estar no formato AAAA-MM-DD.' });
  }

  const amountCents = input.amountCents;
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    problems.push({
      field: 'amountCents',
      message: 'O valor deve ser um número inteiro de centavos.',
    });
  } else if (amountCents <= 0) {
    problems.push({ field: 'amountCents', message: 'O valor a receber tem de ser maior que zero.' });
  }

  const currency = texto(input.currency);
  if (currency === null) {
    problems.push({ field: 'currency', message: 'Informe a moeda.' });
  } else if (!/^[A-Z]{3}$/.test(currency)) {
    problems.push({
      field: 'currency',
      message: 'A moeda deve ser o código ISO de três letras maiúsculas (ex.: BRL, USD, EUR).',
    });
  }

  const payerName = texto(input.payerName);
  if (payerName !== null && payerName.length > NOME_MAX) {
    problems.push({
      field: 'payerName',
      message: `O nome do pagador não pode passar de ${NOME_MAX} caracteres.`,
    });
  }

  const description = texto(input.description) ?? '';
  if (description.length > DESCRICAO_MAX) {
    problems.push({
      field: 'description',
      message: `A descrição não pode passar de ${DESCRICAO_MAX} caracteres.`,
    });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      externalRef: externalRef as string,
      dueDate: dueDate as string,
      amountCents: amountCents as number,
      receivedAmountCents: 0,
      currency: currency as string,
      payerName,
      counterpartyTaxId: texto(input.counterpartyTaxId),
      description,
      settlementMethod: texto(input.settlementMethod),
      // Título nasce aberto. Nasce recebido quem não precisa deste módulo.
      status: 'open',
    },
  };
}

/**
 * A data existe no calendário?
 *
 * `new Date('2026-02-30')` não lança — ele *rola* para 2 de março,
 * silenciosamente. Por isso a volta: monta e confere se o que voltou é o que
 * entrou.
 */
function isIsoDate(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime())) return false;
  return data.toISOString().slice(0, 10) === valor;
}

/** Um resumo honesto da carteira, para a tela mostrar sem inventar número. */
export interface ReceivableSummary {
  readonly open: number;
  readonly overdue: number;
  /** Soma do saldo a receber, por moeda. Nunca inclui excedente. */
  readonly outstandingByCurrency: Readonly<Record<string, number>>;
  /** Soma do que entrou a maior, por moeda. Zero quando não houve. */
  readonly overpaidByCurrency: Readonly<Record<string, number>>;
}

/**
 * ⚠️ Soma **por moeda**, e nunca no total.
 *
 * Somar BRL com USD daria um número que não existe. É a mesma decisão que a
 * tela do Módulo 3 tomou, e vale mais aqui: contas a receber em mais de uma
 * moeda é o caso de quem exporta, que é exatamente o cliente que um schema
 * com moeda presumida teria excluído.
 */
export function summarizeReceivables(
  receivables: readonly Receivable[],
  today: string,
): ReceivableSummary {
  const abertos = receivables.filter(
    (r) => r.status === 'open' || r.status === 'partially_received',
  );

  const outstanding: Record<string, number> = {};
  const overpaid: Record<string, number> = {};

  for (const r of abertos) {
    const saldo = outstandingCents(r);
    if (saldo > 0) outstanding[r.currency] = (outstanding[r.currency] ?? 0) + saldo;
  }
  for (const r of receivables) {
    const excedente = overpaidCents(r);
    if (excedente > 0) overpaid[r.currency] = (overpaid[r.currency] ?? 0) + excedente;
  }

  return {
    open: abertos.length,
    overdue: abertos.filter((r) => isOverdue(r, today)).length,
    outstandingByCurrency: outstanding,
    overpaidByCurrency: overpaid,
  };
}
