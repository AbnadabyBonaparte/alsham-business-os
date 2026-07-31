/**
 * O motor puro do Módulo 79 — Resposta a Incidentes de Segurança.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se um incidente pode avançar na timeline
 * ou fechar. O relógio entra POR PARÂMETRO — o pacote não olha o calendário
 * sozinho (como o `isExpiredAsOf` do `fiscalcert`).
 *
 * ⭐ O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `secincident.allowed_transition()` no `0094_secincident.sql`, e um teste lê a
 * migration e confere que os dois dizem a mesma coisa — e assina o DIVERGE com
 * o `occ` (que tem UM par, contra os CINCO estados daqui).
 */
import type {
  IncidentStatus,
  NewActionInput,
  NewIncidentInput,
  Problem,
  SecurityIncident,
  Validation,
} from './types.ts';

/**
 * ⭐ O ciclo NIST linear + o atalho de falso-positivo. Espelho de
 * `secincident.allowed_transition()` no `0094_secincident.sql`. `closed` é
 * TERMINAL.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [IncidentStatus, IncidentStatus])[] = [
  ['detected', 'contained'],
  ['detected', 'closed'],
  ['contained', 'eradicated'],
  ['eradicated', 'recovered'],
  ['recovered', 'closed'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly IncidentStatus[] = [
  'detected',
  'contained',
  'eradicated',
  'recovered',
  'closed',
];

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: IncidentStatus): readonly IncidentStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** `closed` é o único estado terminal. */
export function isClosed(status: IncidentStatus): boolean {
  return status === 'closed';
}

/**
 * O conteúdo só muda enquanto o incidente está aberto — `closed` congela (é
 * história). A física do `risk`, o DIVERGE do `occ` (imutável desde o
 * nascimento).
 */
export function canEditContent(status: IncidentStatus): boolean {
  return status !== 'closed';
}

/**
 * ⭐ Fechar exige a nota de encerramento. `requiresCloseNote` é `true` quando o
 * destino é `closed` — nos dois caminhos que chegam lá (`detected → closed` e
 * `recovered → closed`).
 */
export function requiresCloseNote(_from: IncidentStatus, to: IncidentStatus): boolean {
  return to === 'closed';
}

/**
 * A leitura da fila: os incidentes ainda ABERTOS antes dos fechados; dentro de
 * cada grupo, os mais SEVEROS primeiro; empate desfeito pela detecção mais
 * recente.
 */
export function orderIncidents(incidents: readonly SecurityIncident[]): readonly SecurityIncident[] {
  return [...incidents].sort((a, b) => {
    const aClosed = a.status === 'closed' ? 1 : 0;
    const bClosed = b.status === 'closed' ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    if (a.severity !== b.severity) return b.severity - a.severity;
    return b.detectedAt.localeCompare(a.detectedAt);
  });
}

export interface IncidentSummary {
  readonly total: number;
  readonly open: number;
  readonly closed: number;
}

/** O resumo conta por estado — todo número é `.length`, nunca chute (Lei 7). */
export function summarizeIncidents(incidents: readonly SecurityIncident[]): IncidentSummary {
  let closed = 0;
  for (const i of incidents) {
    if (i.status === 'closed') closed += 1;
  }
  return { total: incidents.length, open: incidents.length - closed, closed };
}

const TITULO_MAX = 200;
const DESC_MAX = 8000;
const CAMPO_MAX = 4000;
const REGUA_MIN = 1;
const REGUA_MAX = 5;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * A régua 1–5: aceita só inteiro dentro do intervalo. `2.5`, `0`, `6` e `"3"`
 * são recusados — a física do método não admite meio-ponto nem fora da escala.
 */
function reguaUmACinco(valor: unknown, campo: string, problems: Problem[]): number | null {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    problems.push({ field: campo, message: `Informe um inteiro de ${REGUA_MIN} a ${REGUA_MAX}.` });
    return null;
  }
  if (valor < REGUA_MIN || valor > REGUA_MAX) {
    problems.push({ field: campo, message: `Valor entre ${REGUA_MIN} e ${REGUA_MAX}.` });
    return null;
  }
  return valor;
}

/**
 * Valida um incidente novo (sempre nasce `detected`).
 *
 * Título e descrição obrigatórios; `severity` obrigatória na régua 1–5
 * (inteiro); `attackVector`/`affectedData` opcionais (ausentes viram `''`);
 * `detectedAt` opcional, ISO válido e NÃO no futuro — o relógio entra POR
 * PARÂMETRO (`nowIso`), nunca lido aqui.
 */
export function validateNewIncident(
  input: NewIncidentInput,
  nowIso: string,
): Validation<SecurityIncident> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Dê um título ao incidente.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Descreva o que foi constatado.' });
  } else if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
  }

  const severity = reguaUmACinco(input.severity, 'severity', problems);

  let attackVector = texto(input.attackVector) ?? '';
  if (attackVector.length > CAMPO_MAX) {
    problems.push({ field: 'attackVector', message: `Vetor de ataque com no máximo ${CAMPO_MAX} caracteres.` });
    attackVector = attackVector.slice(0, CAMPO_MAX);
  }

  let affectedData = texto(input.affectedData) ?? '';
  if (affectedData.length > CAMPO_MAX) {
    problems.push({ field: 'affectedData', message: `Dados comprometidos com no máximo ${CAMPO_MAX} caracteres.` });
    affectedData = affectedData.slice(0, CAMPO_MAX);
  }

  const detectedAt = texto(input.detectedAt) ?? nowIso;
  if (Number.isNaN(Date.parse(detectedAt))) {
    problems.push({ field: 'detectedAt', message: 'Quando foi detectado — data/hora válidas.' });
  } else if (detectedAt > nowIso) {
    problems.push({
      field: 'detectedAt',
      message: 'A detecção não mora no futuro: registre quando tiver sido detectado.',
    });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      title: title!,
      description: description!,
      attackVector,
      affectedData,
      severity: severity!,
      detectedAt,
      status: 'detected',
      closeNote: '',
    },
  };
}

/**
 * Valida uma ação de resposta nova: `actionTaken` é obrigatório — um passo da
 * timeline sem o que foi feito não é passo.
 */
export function validateNewAction(input: NewActionInput): Validation<{ actionTaken: string }> {
  const limpo = texto(input.actionTaken);
  if (limpo === null) {
    return {
      ok: false,
      problems: [{ field: 'actionTaken', message: 'A ação de resposta registra o que foi FEITO — escreva.' }],
    };
  }
  return { ok: true, value: { actionTaken: limpo } };
}
