/**
 * O motor puro do Módulo 51 — Distribuição / Despacho (Dispatch).
 *
 * ⭐⭐ A física é a do ATO PONTUAL (o `recv`, o `sec`, o `perf`): o despacho é
 * fato consumado — nasce e nunca muda. Por isso este motor NÃO TEM transições
 * de ciclo de vida, NÃO TEM `ALLOWED_TRANSITIONS`, NÃO TEM `canTransition`. A
 * ausência é a lei: um teste lê o `0066_disp.sql` e confere que a migration
 * também não declara `allowed_transition` nem coluna de status.
 *
 * ⭐ O espelho INVERTIDO do `recv`: o `recv` é a CHEGADA (a doca de entrada), o
 * `disp` é a SAÍDA (a doca de expedição). Mesma física do ato pontual imutável;
 * um teste lê as DUAS migrations e assina que ambas são atos imutáveis.
 */
import type {
  Dispatch,
  DispatchSummary,
  NewDispatchInput,
  Problem,
  Validation,
} from './types.ts';

/** Do mais recente ao mais antigo — a leitura do livro. Tiebreak estável por id. */
export function orderDispatches(dispatches: readonly Dispatch[]): readonly Dispatch[] {
  return [...dispatches].sort((a, b) => {
    if (a.dispatchedOn !== b.dispatchedOn) return a.dispatchedOn < b.dispatchedOn ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

/** Conta as linhas e soma as quantidades — todo número é length/soma, nunca chute. */
export function summarizeDispatches(dispatches: readonly Dispatch[]): DispatchSummary {
  return {
    total: dispatches.length,
    totalQuantity: dispatches.reduce((soma, d) => soma + d.quantity, 0),
  };
}

const DESTINATION_MAX = 300;
const CENTER_NAME_MAX = 200;
const CARRIER_MAX = 200;
const NOTE_MAX = 1000;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um despacho novo. O destino é obrigatório; a quantidade tem de ser um
 * número > 0; o dia é obrigatório no formato ISO. O centro de distribuição é
 * OPCIONAL (id solto + nome), assim como a transportadora e a nota — um despacho
 * pode não ter centro (retirada direta, amostra). Nasce com `id` vazio: a pura
 * camada nunca inventa dado do servidor.
 */
export function validateNewDispatch(input: NewDispatchInput): Validation<Dispatch> {
  const problems: Problem[] = [];

  const destination = texto(input.destination);
  if (destination === null) {
    problems.push({ field: 'destination', message: 'Informe o destino do despacho.' });
  } else if (destination.length > DESTINATION_MAX) {
    problems.push({ field: 'destination', message: `Destino com no máximo ${DESTINATION_MAX} caracteres.` });
  }

  // Quantidade: número finito e estritamente positivo. Não se despacha nulo.
  const quantidade = input.quantity;
  if (typeof quantidade !== 'number' || !Number.isFinite(quantidade)) {
    problems.push({ field: 'quantity', message: 'Informe a quantidade despachada.' });
  } else if (quantidade <= 0) {
    problems.push({ field: 'quantity', message: 'A quantidade despachada tem de ser maior que zero.' });
  }

  // O dia do despacho é obrigatório, no formato ISO. Passado é permitido.
  const dispatchedOn = texto(input.dispatchedOn);
  if (dispatchedOn === null) {
    problems.push({ field: 'dispatchedOn', message: 'Informe o dia do despacho.' });
  } else if (!DATA_ISO.test(dispatchedOn)) {
    problems.push({ field: 'dispatchedOn', message: 'A data deve estar no formato AAAA-MM-DD.' });
  }

  // Centro de distribuição OPCIONAL: id solto (texto/uuid) + nome carimbado pela tela.
  const dcCenterId = texto(input.dcCenterId);
  const centerNameBruto = texto(input.dcCenterName);
  let dcCenterName = '';
  if (centerNameBruto !== null) {
    if (centerNameBruto.length > CENTER_NAME_MAX) {
      problems.push({ field: 'dcCenterName', message: `Nome do centro com no máximo ${CENTER_NAME_MAX} caracteres.` });
    } else {
      dcCenterName = centerNameBruto;
    }
  }

  // Transportadora opcional.
  const carrierBruto = texto(input.carrier);
  let carrier = '';
  if (carrierBruto !== null) {
    if (carrierBruto.length > CARRIER_MAX) {
      problems.push({ field: 'carrier', message: `Transportadora com no máximo ${CARRIER_MAX} caracteres.` });
    } else {
      carrier = carrierBruto;
    }
  }

  // Nota opcional.
  const notaBruta = texto(input.note);
  let note = '';
  if (notaBruta !== null) {
    if (notaBruta.length > NOTE_MAX) {
      problems.push({ field: 'note', message: `Nota com no máximo ${NOTE_MAX} caracteres.` });
    } else {
      note = notaBruta;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      dcCenterId,
      dcCenterName,
      destination: destination!,
      carrier,
      quantity: quantidade as number,
      dispatchedOn: dispatchedOn!,
      note,
    },
  };
}
