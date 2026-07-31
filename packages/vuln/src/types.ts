/**
 * Tipos puros do Módulo 78 — Gestão de Vulnerabilidades.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * vulnerabilidade constatada nos SISTEMAS DO TENANT e o seu ciclo
 * (`open → in_progress → remediated/accepted_risk`) — com as DUAS respostas
 * terminais.
 *
 * ⭐ **O RECORTE — a vulnerabilidade DO TENANT, não da plataforma:** metade do
 * Domain Segurança da Informação é a ALSHAM cuidando da própria infra (IAM = o
 * RBAC do Core; Cofre = o Vault; SIEM/Backup = operação da plataforma) e fica
 * FORA. O que sobra de GENUÍNO pro tenant gerenciar dentro do produto: as
 * vulnerabilidades encontradas nos sistemas DELE, com severidade e status de
 * remediação.
 *
 * ⭐ **A identidade é a do `nc`/`capa` (fato constatado + remediação):** a
 * vulnerabilidade é um DESVIO constatado (como a Não Conformidade), e encerrar
 * exige a NOTA de resposta (quem corrigiu, ou por que decidiu conviver com ela).
 *
 * ⭐⭐ **O DIVERGE, assinado — a severidade 1–5 CHECK e a SEGUNDA resposta
 * terminal:** além de `remediated` (corrigi-a), existe `accepted_risk` (decidi
 * conviver com ela — o risco aceito, comum em segurança quando o custo de
 * corrigir supera o do risco). As duas exigem a justificativa escrita e são
 * TERMINAIS. Uma vulnerabilidade que reaparece é registro NOVO (a física do
 * `nc`/`proj`).
 *
 * @see supabase/migrations/0093_vuln.sql
 * @see docs/canon/MODULO-VULN-SPEC.md
 */

/**
 * O estado de uma vulnerabilidade.
 *
 * ⭐ `open → in_progress → remediated/accepted_risk`, com a volta
 * `in_progress → open` (reavaliar). `remediated` e `accepted_risk` são as DUAS
 * respostas TERMINAIS (com justificativa): corrigir, ou aceitar o risco. Uma
 * vulnerabilidade que reaparece é registro novo — não há reabertura de fim.
 */
export type VulnStatus = 'open' | 'in_progress' | 'remediated' | 'accepted_risk';

/** Uma vulnerabilidade: o registro do desvio constatado num sistema do tenant. */
export interface Vulnerability {
  readonly id: string;
  /** O título curto da vulnerabilidade. Obrigatório. */
  readonly title: string;
  /** A descrição do desvio constatado. Obrigatória. */
  readonly description: string;
  /**
   * O sistema afetado, TEXTO LIVRE opcional — `''` quando ausente. Nunca um
   * enum: o inventário de sistemas de um tenant não é o de outro.
   */
  readonly affectedSystem: string;
  /** 1–5 (régua do método — CHECK argumentado no banco). */
  readonly severity: number;
  /** Plano de remediação TEXTO LIVRE opcional — `''` quando ausente. */
  readonly remediationPlan: string;
  /**
   * Vínculo OPCIONAL ao incidente de segurança (`secincident`) por ID SOLTO —
   * sem FK cross-schema. `null` quando ainda não há incidente ligado.
   */
  readonly incidentId: string | null;
  readonly status: VulnStatus;
  /**
   * ⭐⭐ A resposta escrita ao encerrar: a NOTA DE REMEDIAÇÃO (quem corrigiu) OU
   * a JUSTIFICATIVA do risco aceito. `''` enquanto a vulnerabilidade está
   * aberta ou em progresso.
   */
  readonly resolution: string;
}

/** A entrada crua de uma vulnerabilidade nova — os campos vêm do formulário. */
export interface NewVulnInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly affectedSystem?: unknown;
  readonly severity?: unknown;
  readonly remediationPlan?: unknown;
  readonly incidentId?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
