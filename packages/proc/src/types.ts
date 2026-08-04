/**
 * Os tipos do Módulo 90 — Protocolo (processo administrativo).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐ **A LEI DAS ETAPAS vive neste arquivo, por ausência.** Procure por um
 * `type Stage = 'protocolado' | 'análise' | ...` — não existe, e não pode
 * existir. A etapa é DADO DO TENANT: uma linha de `proc.workflow_stages` com o
 * nome que o órgão escolheu. É a mesma física do `ops` (Módulo 7),
 * re-perguntada para o processo PÚBLICO.
 *
 * O que É união fechada aqui: o STATUS do processo e o TIPO de movimento —
 * porque esses são do produto, não do cliente. A distinção é a etapa toda.
 *
 * @see supabase/migrations/0105_proc.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-PROC-SPEC.md — o fluxo de negócio
 */

/** Identificadores. Aliases nominais para o que no banco é `uuid`. */
export type WorkflowId = string;
export type StageId = string;
export type ProcessId = string;
export type TenantId = string;

/** O estado de um rito. Arquivar é status — rito que já correu é história. */
export type WorkflowStatus = 'active' | 'archived';

/**
 * O estado de um processo administrativo.
 *
 * ⭐⭐ **A DECISÃO FORMAL É TERMINAL — o DIVERGE central do `ops`.** O `ops`
 * termina em `done`/`cancelled` neutros e `done` REABRE. O processo público
 * termina num ATO DE IMPÉRIO — `deferred` (deferido) · `denied` (indeferido) ·
 * `dismissed` (arquivado) — e o ato é DEFINITIVO. Um processo decidido que
 * volta é um RECURSO ou um NOVO protocolo, jamais a reabertura do ato.
 */
export type ProcessStatus =
  | 'open'
  | 'in_progress'
  | 'deferred'
  | 'denied'
  | 'dismissed';

/** Os três desfechos formais — o subconjunto terminal de `ProcessStatus`. */
export type FormalDecision = 'deferred' | 'denied' | 'dismissed';

/**
 * O tipo de um movimento na trilha.
 *
 * ⭐ `skipped` é o que faz a Lei das Etapas ser verificável. `decided` carimba
 * o despacho da decisão formal, imutável.
 */
export type MovementKind =
  | 'registered'
  | 'advanced'
  | 'skipped'
  | 'sent-back'
  | 'decided';

/**
 * Uma etapa do rito, como o órgão a desenhou.
 *
 * - `requiresApproval` — passar daqui é DECISÃO, e exige `proc.process.decide`.
 *   Quem diz o que é decisão é a coluna, nunca o nome da etapa.
 * - `skippable` — a etapa pode não se aplicar a este processo. Pular fica
 *   REGISTRADO.
 */
export interface WorkflowStage {
  readonly id: StageId;
  readonly workflowId: WorkflowId;
  /** A ordem no rito. Contígua não é exigência — só a ordem importa. */
  readonly position: number;
  /** O nome que o TENANT escolheu. Ver o cabeçalho deste arquivo. */
  readonly name: string;
  readonly requiresApproval: boolean;
  readonly skippable: boolean;
}

/** Um rito desenhado por um tenant. */
export interface Workflow {
  readonly id: WorkflowId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string;
  readonly status: WorkflowStatus;
}

/**
 * Um processo administrativo.
 *
 * ⭐ `protocolNumber` é a identidade PÚBLICA que o cidadão cita. É TEXTO LIVRE
 * (a casa numera, com a convenção dela) e único por tenant — o DIVERGE do
 * `ops`, que decidiu NÃO ter número.
 *
 * ⭐ `interestedPartyId`/`interestedPartyName` — o interessado, por id SOLTO +
 * nome carimbado (o padrão do `deal`). O processo público é SEMPRE o pedido de
 * alguém; a OS do `ops` não tinha requerente.
 *
 * `currentStageId` é nulo quando o processo saiu do rito — decidido.
 */
export interface Process {
  readonly id: ProcessId;
  readonly tenantId: TenantId;
  readonly workflowId: WorkflowId;
  readonly currentStageId: StageId | null;
  readonly protocolNumber: string;
  readonly interestedPartyId: string | null;
  readonly interestedPartyName: string;
  /** O objeto do processo. TEXTO LIVRE. */
  readonly subject: string;
  readonly description: string;
  readonly assigneeUserId: string | null;
  /** `AAAA-MM-DD`. Processo sem prazo existe. */
  readonly dueDate: string | null;
  readonly status: ProcessStatus;
  /** O despacho da decisão formal. Vazio enquanto o processo tramita. */
  readonly decisionNote: string;
}

/**
 * Uma linha da trilha — imutável por contrato, nas três camadas do banco.
 *
 * ⭐ `fromStageName`/`toStageName` são o carimbo, e não redundância: a etapa é
 * dado vivo do tenant, e o id sozinho faria a trilha de 2026 ser lida com o
 * vocabulário de 2028 — ou desaparecer junto com a etapa.
 */
export interface ProcessMovement {
  readonly id: string;
  readonly processId: ProcessId;
  readonly kind: MovementKind;
  readonly fromStageId: StageId | null;
  readonly fromStageName: string | null;
  readonly toStageId: StageId | null;
  readonly toStageName: string | null;
  /** A razão do ato: por que pulou, o que refazer, o despacho da decisão. */
  readonly note: string;
  readonly occurredAt: string;
  readonly actorUserId: string | null;
}

/** O que se precisa saber para registrar um processo. */
export interface NewProcess {
  readonly workflowId: WorkflowId;
  readonly protocolNumber: string;
  readonly interestedPartyName: string;
  readonly interestedPartyId?: string | null;
  readonly subject: string;
  readonly description?: string;
  readonly assigneeUserId?: string | null;
  readonly dueDate?: string | null;
}

/** O que se precisa saber para desenhar uma etapa. */
export interface NewStage {
  readonly name: string;
  readonly position: number;
  readonly requiresApproval: boolean;
  readonly skippable: boolean;
}

/** Uma coluna do quadro: a etapa e os processos que estão nela. */
export interface BoardColumn {
  readonly stage: WorkflowStage;
  readonly processes: readonly Process[];
}
