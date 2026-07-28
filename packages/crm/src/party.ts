import type {
  Interaction,
  NewInteractionInput,
  NewPartyInput,
  Party,
  PartyKind,
  PartyStatus,
  Problem,
  Validation,
} from './types.ts';

/**
 * ⭐ **O CICLO DE VIDA DA CONTRAPARTE.**
 *
 * Espelho exato de `crm.allowed_transition()` em `0009_crm.sql`, e há um teste
 * (`lifecycle.test.ts`) que LÊ AQUELE ARQUIVO e compara par a par. Mesma
 * arquitetura do Módulo 3, e pelas mesmas razões: regra que só vive no
 * TypeScript não protege quem escreve SQL à mão; regra que só vive no SQL faz
 * a tela descobrir o "não" depois do round-trip. O teste é a terceira peça.
 *
 * ⚠️ **AQUI O CICLO DIFERE DO MÓDULO 3 DE PROPÓSITO, E A DIFERENÇA É A LIÇÃO.**
 *
 * Lá, `cancelled` é TERMINAL: um título que volta a ser devido é documento
 * NOVO, com referência nova, porque dinheiro tem identidade por documento.
 *
 * Aqui, `archived → active` **existe**. Uma contraparte que volta é a MESMA
 * pessoa. Obrigá-la a nascer de novo criaria uma segunda linha para alguém que
 * é um só — e partiria o histórico de contato em dois, que é exatamente o que
 * este módulo existe para manter inteiro.
 *
 * Copiar a regra do módulo anterior "por consistência" teria sido o erro.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [PartyStatus, PartyStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/**
 * A transição é permitida?
 *
 * Ficar no mesmo estado é sempre permitido — não é transição, é a contraparte
 * parada. Quem consulta isto para desenhar botão precisa que "nada muda" nunca
 * seja um erro.
 */
export function canTransition(from: PartyStatus, to: PartyStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

/** Dá para arquivar a partir de onde está? */
export function canArchive(status: PartyStatus): boolean {
  return status === 'active';
}

/** Dá para trazer de volta? */
export function canRestore(status: PartyStatus): boolean {
  return status === 'archived';
}

const NOME_MAX = 200;
const TAX_ID_MAX = 64;
const CONTATO_MAX = 160;
const NOTA_MAX = 2000;
const TAG_MAX = 40;
const TAGS_MAX = 20;
const CANAL_MAX = 60;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

const KINDS: readonly PartyKind[] = ['person', 'org'];

/**
 * Normaliza as etiquetas: apara, descarta vazias, remove repetidas, ordena.
 *
 * ⚠️ **Não há lista de etiquetas válidas, e não vai haver.** Cada empresa
 * recorta a carteira dela do jeito dela; uma lista fechada aqui seria o
 * vocabulário de UM cliente virando obrigação de todos (Lei anti-viés).
 *
 * A ordenação é para que duas gravações do mesmo conjunto produzam o mesmo
 * array — e é o que faz o gatilho de `crm.party.updated` não disparar por
 * causa de ordem.
 */
export function normalizeTags(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const limpas = valor
    .map((t) => texto(t))
    .filter((t): t is string => t !== null)
    .map((t) => t.slice(0, TAG_MAX));
  return [...new Set(limpas)].sort();
}

/**
 * **A validação de uma contraparte nova.** Pura: nem banco, nem rede, nem relógio.
 *
 * Devolve **todos** os problemas de uma vez, não o primeiro.
 *
 * O que NÃO se valida aqui, e por quê:
 *
 *   · **o identificador fiscal não tem formato.** Nada de 11-ou-14 dígitos,
 *     nada de dígito verificador, nada de máscara. Validar CPF/CNPJ aqui
 *     amarraria o produto ao Brasil — e é o erro mais fácil de cometer neste
 *     módulo inteiro;
 *   · **o telefone não tem formato.** Nem DDD, nem código de país, nem
 *     contagem de dígitos. Formato de telefone é de um país;
 *   · **o e-mail só precisa parecer um e-mail.** Um `@` com coisa dos dois
 *     lados. Regex de e-mail "completa" recusa endereços válidos, e quem paga
 *     é o usuário que tem um deles.
 */
export function validateNewParty(input: NewPartyInput): Validation<Party> {
  const problems: Problem[] = [];

  const kind = texto(input.kind);
  if (kind === null || !(KINDS as readonly string[]).includes(kind)) {
    problems.push({ field: 'kind', message: 'Diga se é uma pessoa ou uma organização.' });
  }

  const displayName = texto(input.displayName);
  if (displayName === null) {
    problems.push({ field: 'displayName', message: 'Informe o nome.' });
  } else if (displayName.length > NOME_MAX) {
    problems.push({
      field: 'displayName',
      message: `O nome não pode passar de ${NOME_MAX} caracteres.`,
    });
  }

  const taxId = texto(input.taxId);
  if (taxId !== null && taxId.length > TAX_ID_MAX) {
    problems.push({
      field: 'taxId',
      message: `O identificador não pode passar de ${TAX_ID_MAX} caracteres.`,
    });
  }

  const email = texto(input.email);
  if (email !== null && !/^[^@\s]+@[^@\s]+$/.test(email)) {
    problems.push({ field: 'email', message: 'O e-mail não parece um e-mail.' });
  }
  if (email !== null && email.length > CONTATO_MAX) {
    problems.push({ field: 'email', message: `O e-mail não pode passar de ${CONTATO_MAX} caracteres.` });
  }

  const phone = texto(input.phone);
  if (phone !== null && phone.length > CONTATO_MAX) {
    problems.push({ field: 'phone', message: `O telefone não pode passar de ${CONTATO_MAX} caracteres.` });
  }

  const tags = normalizeTags(input.tags);
  if (tags.length > TAGS_MAX) {
    problems.push({ field: 'tags', message: `No máximo ${TAGS_MAX} etiquetas.` });
  }

  const note = texto(input.note) ?? '';
  if (note.length > NOTA_MAX) {
    problems.push({ field: 'note', message: `A observação não pode passar de ${NOTA_MAX} caracteres.` });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      kind: kind as PartyKind,
      displayName: displayName as string,
      taxId,
      email,
      phone,
      tags,
      note,
      // Contraparte nasce ativa. Nasce arquivada quem não precisa deste módulo.
      status: 'active',
    },
  };
}

/**
 * **A validação de uma interação nova.** Pura.
 *
 * ⚠️ **Data futura NÃO é erro, e a decisão é do produto.** Registrar a visita
 * marcada para amanhã é uso legítimo — a interação diz *quando aconteceu ou vai
 * acontecer*, e quem separa "planejado" de "aconteceu" é a capacidade
 * *Follow-up*, que **NÃO está construída**. Recusar aqui seria impor uma
 * disciplina que o produto não oferece.
 */
export function validateNewInteraction(input: NewInteractionInput): Validation<Interaction> {
  const problems: Problem[] = [];

  const partyId = texto(input.partyId);
  if (partyId === null) {
    problems.push({ field: 'partyId', message: 'A interação precisa de uma contraparte.' });
  }

  const occurredAt = texto(input.occurredAt);
  if (occurredAt === null) {
    problems.push({ field: 'occurredAt', message: 'Informe quando aconteceu.' });
  } else if (Number.isNaN(new Date(occurredAt).getTime())) {
    problems.push({ field: 'occurredAt', message: 'A data do contato não é válida.' });
  }

  const channel = texto(input.channel);
  if (channel === null) {
    problems.push({ field: 'channel', message: 'Informe por onde foi o contato.' });
  } else if (channel.length > CANAL_MAX) {
    problems.push({ field: 'channel', message: `O canal não pode passar de ${CANAL_MAX} caracteres.` });
  }

  const note = texto(input.note) ?? '';
  if (note.length > NOTA_MAX) {
    problems.push({ field: 'note', message: `A anotação não pode passar de ${NOTA_MAX} caracteres.` });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      partyId: partyId as string,
      occurredAt: new Date(occurredAt as string).toISOString(),
      channel: channel as string,
      note,
    },
  };
}

/**
 * A busca da lista — **pura, e é o motivo de ela morar aqui.**
 *
 * Filtrar por texto e por estado é DECISÃO: define o que o operador encontra e
 * o que ele não encontra. Escrevê-la no componente faria a mesma pergunta ter
 * duas respostas no dia em que a busca também acontecesse no servidor.
 *
 * Procura em nome, identificador, e-mail e etiquetas — sem acento e sem caixa,
 * porque quem digita "acme" espera achar "ACME".
 */
export function matchesQuery(party: Party, query: string): boolean {
  const alvo = normalizeText(query);
  if (alvo.length === 0) return true;

  const campos = [party.displayName, party.taxId ?? '', party.email ?? '', ...party.tags];
  return campos.some((c) => normalizeText(c).includes(alvo));
}

/**
 * Sem acento, sem caixa, sem espaço sobrando.
 *
 * `NFD` + corte dos diacríticos é o mesmo caminho que o Módulo 1 já usa em
 * `normalizeText` — mas os dois pacotes **não se importam**: cada módulo carrega
 * a sua cópia de quatro linhas em vez de criar uma dependência entre módulos.
 * Compartilhar isto viraria a primeira exceção da Lei do Lego, e por economia
 * de quatro linhas.
 */
export function normalizeText(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Um resumo honesto da carteira, para a tela mostrar sem inventar número. */
export interface PartySummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
  readonly people: number;
  readonly orgs: number;
}

export function summarizeParties(parties: readonly Party[]): PartySummary {
  return {
    total: parties.length,
    active: parties.filter((p) => p.status === 'active').length,
    archived: parties.filter((p) => p.status === 'archived').length,
    people: parties.filter((p) => p.kind === 'person').length,
    orgs: parties.filter((p) => p.kind === 'org').length,
  };
}
