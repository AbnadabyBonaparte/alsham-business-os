/**
 * O motor puro do Módulo 78 — Gestão de Vulnerabilidades.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma vulnerabilidade pode avançar,
 * reavaliar ou encerrar, nem se a resposta de encerramento é suficiente.
 *
 * ⭐ **A identidade é a do `nc`/`capa`, re-perguntada:** a vulnerabilidade é um
 * FATO CONSTATADO num sistema do tenant. `validateNewVuln` devolve o registro
 * pronto para nascer `open`; encerrar exige a resposta escrita.
 *
 * ⭐⭐ **O DIVERGE do `nc`, ASSINADO — e é o que faz este módulo NÃO ser o `nc`
 * de novo (copiar sem pensar e divergir sem escrever são o mesmo erro):**
 *   • o `nc` fecha com UMA saída (`open → closed`, com a nota de verificação);
 *   • a vulnerabilidade tem DUAS respostas terminais — `remediated` (corrigi-a)
 *     e `accepted_risk` (decidi conviver com ela). O risco aceito é próprio da
 *     segurança: quando o custo de corrigir supera o do risco, aceitar é uma
 *     decisão legítima e registrada, não um esquecimento;
 *   • e a SEVERIDADE 1–5 é CHECK argumentado no banco (a física do método —
 *     precedente `risk`/`vperf`/`nps`).
 *
 * `ALLOWED_TRANSITIONS` abaixo é o espelho de `vuln.allowed_transition()` no
 * `0093_vuln.sql`, e um teste lê a migration e confere que os dois dizem a mesma
 * coisa.
 */
import type {
  NewVulnInput,
  Problem,
  Validation,
  VulnStatus,
  Vulnerability,
} from './types.ts';

/**
 * ⭐ open→in_progress, in_progress→open (reavaliar), open→accepted_risk,
 * in_progress→remediated, in_progress→accepted_risk. `remediated` e
 * `accepted_risk` são TERMINAIS (as duas respostas, com justificativa).
 * Espelho de `vuln.allowed_transition()` no `0093_vuln.sql`.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [VulnStatus, VulnStatus])[] = [
  ['open', 'in_progress'],
  ['in_progress', 'open'],
  ['open', 'accepted_risk'],
  ['in_progress', 'remediated'],
  ['in_progress', 'accepted_risk'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly VulnStatus[] = [
  'open',
  'in_progress',
  'remediated',
  'accepted_risk',
];

/** ⭐⭐ As DUAS respostas terminais: corrigir, ou aceitar o risco. */
export const TERMINAL_STATUSES: readonly VulnStatus[] = ['remediated', 'accepted_risk'];

export function canTransition(from: VulnStatus, to: VulnStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: VulnStatus): readonly VulnStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Um estado terminal não tem saída — a vulnerabilidade que reaparece é registro novo. */
export function isTerminal(status: VulnStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * ⭐⭐ Encerrar (chegar a um terminal) exige a RESPOSTA escrita. `requiresResolution`
 * é `true` sempre que o destino é terminal — a nota de remediação ou a
 * justificativa do risco aceito. A física é a mesma nas duas saídas.
 */
export function requiresResolution(from: VulnStatus, to: VulnStatus): boolean {
  return from !== to && isTerminal(to);
}

const ORDEM: Record<VulnStatus, number> = {
  open: 0,
  in_progress: 1,
  remediated: 2,
  accepted_risk: 3,
};

/**
 * A leitura ordena as VIVAS primeiro (abertas, depois em progresso), e dentro de
 * cada grupo as mais SEVERAS primeiro (severidade 1–5, decrescente); empate
 * desfeito pelo título. As encerradas (remediated/accepted_risk) vão ao fim.
 */
export function orderBySeverity(vulns: readonly Vulnerability[]): readonly Vulnerability[] {
  return [...vulns].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    if (b.severity !== a.severity) return b.severity - a.severity;
    return a.title.localeCompare(b.title);
  });
}

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;
const AFFECTED_MAX = 400;
const PLAN_MAX = 4000;
const SEVERITY_MIN = 1;
const SEVERITY_MAX = 5;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * A régua 1–5: aceita só inteiro dentro do intervalo. `2.5`, `0`, `6` e `"3"`
 * são recusados — a física do método não admite meio-ponto nem fora da escala.
 */
function severidade(valor: unknown, problems: Problem[]): number | null {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    problems.push({ field: 'severity', message: `Informe um inteiro de ${SEVERITY_MIN} a ${SEVERITY_MAX}.` });
    return null;
  }
  if (valor < SEVERITY_MIN || valor > SEVERITY_MAX) {
    problems.push({ field: 'severity', message: `Severidade entre ${SEVERITY_MIN} e ${SEVERITY_MAX}.` });
    return null;
  }
  return valor;
}

/**
 * Valida uma vulnerabilidade nova. Título e descrição são obrigatórios; a
 * severidade é obrigatória na régua 1–5 (inteiro); o sistema afetado, o plano de
 * remediação e o vínculo ao incidente são OPCIONAIS. Nasce ABERTA, com `id`
 * vazio e sem resposta — a pura camada nunca inventa dado do servidor, e a
 * vulnerabilidade só ganha resposta quando ALGUÉM a encerra.
 */
export function validateNewVuln(input: NewVulnInput): Validation<Vulnerability> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o título da vulnerabilidade.' });
  } else if (title.length > TITLE_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITLE_MAX} caracteres.` });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Descreva o desvio constatado.' });
  } else if (description.length > DESCRIPTION_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESCRIPTION_MAX} caracteres.` });
  }

  const severity = severidade(input.severity, problems);

  // Sistema afetado é opcional: ausente vira '' (vazio), não um erro.
  const affectedBruto = texto(input.affectedSystem);
  let affectedSystem = '';
  if (affectedBruto !== null) {
    if (affectedBruto.length > AFFECTED_MAX) {
      problems.push({ field: 'affectedSystem', message: `Sistema afetado com no máximo ${AFFECTED_MAX} caracteres.` });
    } else {
      affectedSystem = affectedBruto;
    }
  }

  // Plano de remediação é opcional: ausente vira '' (vazio), não um erro.
  const planoBruto = texto(input.remediationPlan);
  let remediationPlan = '';
  if (planoBruto !== null) {
    if (planoBruto.length > PLAN_MAX) {
      problems.push({ field: 'remediationPlan', message: `Plano de remediação com no máximo ${PLAN_MAX} caracteres.` });
    } else {
      remediationPlan = planoBruto;
    }
  }

  // Vínculo ao incidente por id solto: opcional, ausente vira null.
  const incidentId = texto(input.incidentId);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      title: title!,
      description: description!,
      affectedSystem,
      severity: severity!,
      remediationPlan,
      incidentId,
      status: 'open',
      resolution: '',
    },
  };
}
