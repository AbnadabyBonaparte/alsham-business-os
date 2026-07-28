import type {
  NewPayableInput,
  Payable,
  PayableStatus,
  Problem,
  Validation,
} from './types.ts';

/**
 * ⭐ **O CICLO DE VIDA DO TÍTULO — a regra de negócio deste módulo.**
 *
 * Esta constante é o espelho exato de `ap.allowed_transition()` em
 * `supabase/migrations/0007_ap.sql`, e há um teste (`lifecycle.test.ts`) que LÊ
 * AQUELE ARQUIVO e compara par a par. Se as duas listas divergirem, o teste
 * quebra antes de o CI chegar no banco.
 *
 * Existir nos dois lugares é deliberado, não descuido:
 *
 *   · regra que só vive no TypeScript não protege quem escreve SQL à mão nem o
 *     correio, que grava sem passar pela tela;
 *   · regra que só vive no SQL faz a tela descobrir o "não" depois do
 *     round-trip, e obriga o formulário a adivinhar o que pode oferecer.
 *
 * As duas existem. O teste é a terceira peça, e é ela que faz disso arquitetura
 * em vez de duplicação.
 *
 * ⛔ **`settled → cancelled` não existe.** Cancelar um título já pago apagaria a
 * fronteira entre *"não devíamos isso"* e *"pagamos isso"*. Se o pagamento tem
 * de voltar, ele volta primeiro (estorno para `open`) e só então o documento se
 * cancela. Dois atos, dois registros.
 *
 * ⛔ **`cancelled` é terminal.** Se voltarmos a dever, é documento NOVO, com
 * referência nova — não o mesmo título ressuscitado.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [PayableStatus, PayableStatus])[] = [
  ['open', 'partially_settled'],
  ['open', 'settled'],
  ['open', 'cancelled'],
  ['partially_settled', 'settled'],
  ['partially_settled', 'open'],
  ['partially_settled', 'cancelled'],
  ['settled', 'partially_settled'],
  ['settled', 'open'],
];

/**
 * A transição é permitida?
 *
 * Ficar no mesmo estado é sempre permitido — não é transição, é o título
 * parado. Quem consulta isto para desenhar botão precisa que "nada muda" nunca
 * seja um erro.
 */
export function canTransition(from: PayableStatus, to: PayableStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

/** Para onde este título pode ir a partir de onde está. Ordem estável. */
export function nextStatuses(from: PayableStatus): readonly PayableStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/**
 * O estado que o valor liquidado IMPLICA.
 *
 * O estado e o valor contam a mesma história, ou um dos dois mente — e o banco
 * tem um `check` (`payables_status_coherent`) que recusa a mentira. Esta função
 * é o mesmo raciocínio antes da ida ao banco.
 *
 * ⚠️ Não decide sobre título cancelado: cancelamento é ato de gente, não
 * consequência de aritmética. Quem chamar com um título cancelado recebe
 * `cancelled` de volta, e é isso.
 */
export function statusForSettlement(
  amountCents: number,
  settledAmountCents: number,
  current: PayableStatus = 'open',
): PayableStatus {
  if (current === 'cancelled') return 'cancelled';
  if (settledAmountCents <= 0) return 'open';
  if (settledAmountCents >= amountCents) return 'settled';
  return 'partially_settled';
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
 * **A validação de um título novo.** Pura: nem banco, nem rede, nem relógio.
 *
 * Devolve **todos** os problemas de uma vez, não o primeiro. Formulário que
 * revela um erro por vez faz o usuário descobrir o quinto na quinta tentativa —
 * e o custo de juntar a lista aqui é zero.
 *
 * O que NÃO se valida aqui, e por quê:
 *
 *   · **vencimento no passado não é erro.** Título atrasado é o caso mais
 *     comum de quem começa a usar o sistema — quem migra tem gaveta cheia
 *     deles. Recusar seria impedir a entrada do que já existe;
 *   · **fornecedor não é obrigatório.** Há despesa sem contraparte nomeada, e
 *     exigir o nome faria a pessoa digitar "-";
 *   · **`paymentMethod` é texto livre e não tem lista.** Instrumento de
 *     pagamento é de um país e de uma década. Ver o ANTI-VIÉS em `0007_ap.sql`.
 */
export function validateNewPayable(input: NewPayableInput): Validation<Payable> {
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
    problems.push({ field: 'amountCents', message: 'O valor devido tem de ser maior que zero.' });
  }

  const currency = texto(input.currency);
  if (currency === null) {
    problems.push({ field: 'currency', message: 'Informe a moeda.' });
  } else if (!/^[A-Z]{3}$/.test(currency)) {
    // Sem default, e sem lista de moedas "aceitas": presumir BRL é viés de
    // país, e manter uma lista é manter uma lista.
    problems.push({
      field: 'currency',
      message: 'A moeda deve ser o código ISO de três letras maiúsculas (ex.: BRL, USD, EUR).',
    });
  }

  const supplierName = texto(input.supplierName);
  if (supplierName !== null && supplierName.length > NOME_MAX) {
    problems.push({
      field: 'supplierName',
      message: `O nome do fornecedor não pode passar de ${NOME_MAX} caracteres.`,
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
      settledAmountCents: 0,
      currency: currency as string,
      supplierName,
      counterpartyTaxId: texto(input.counterpartyTaxId),
      description,
      paymentMethod: texto(input.paymentMethod),
      // Título nasce aberto. Nasce liquidado quem não precisa deste módulo.
      status: 'open',
    },
  };
}

/**
 * A data existe no calendário?
 *
 * `new Date('2026-02-30')` não lança — ele *rola* para 2 de março, silenciosamente.
 * Por isso a volta: monta e confere se o que voltou é o que entrou.
 */
function isIsoDate(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime())) return false;
  return data.toISOString().slice(0, 10) === valor;
}

/**
 * O título pode ser cancelado a partir de onde está?
 *
 * Duas perguntas diferentes moram aqui, e a tela precisa das duas: *o ciclo de
 * vida permite?* e *esta pessoa pode?*. A segunda é do banco — há trigger que
 * exige `ap.payable.cancel`, porque policy de UPDATE não enxerga o estado
 * anterior. Esta função responde só a primeira, e é honesta sobre isso.
 */
export function canCancel(status: PayableStatus): boolean {
  return canTransition(status, 'cancelled') && status !== 'cancelled';
}

/** Está vencido em relação à data informada? O relógio vem de fora — função pura. */
export function isOverdue(payable: Payable, today: string): boolean {
  if (payable.status === 'settled' || payable.status === 'cancelled') return false;
  return payable.dueDate < today;
}

/** O saldo devedor. Zero para título cancelado: não se deve o que não vale. */
export function outstandingCents(payable: Payable): number {
  if (payable.status === 'cancelled') return 0;
  return payable.amountCents - payable.settledAmountCents;
}
