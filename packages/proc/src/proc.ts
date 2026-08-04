import type {
  BoardColumn,
  FormalDecision,
  NewProcess,
  NewStage,
  Process,
  ProcessStatus,
  StageId,
  WorkflowStage,
} from './types.ts';

/**
 * O motor do processo administrativo — **puro**.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca calcula qual é a próxima etapa nem se um botão
 * pode aparecer. Se `apps/` inteiro sumisse, nenhuma regra deste arquivo sumiria.
 *
 * O que este arquivo **não** faz, e é deliberado: ele não executa o movimento.
 * Mover o processo é mudar a etapa E escrever a trilha na mesma transação, e
 * isso vive em `proc.advance_process()` / `proc.skip_stage()` /
 * `proc.send_back_process()`, no banco. Aqui está a mesma regra, para a tela
 * poder antecipar a resposta — e há teste que compara os dois lados.
 */

/**
 * ⭐ **AS TRANSIÇÕES PERMITIDAS.** Espelho exato de `proc.allowed_transition()`
 * em `supabase/migrations/0105_proc.sql` §3.1, e há teste que lê aquele arquivo
 * e compara par a par. Mudar um lado só reprova.
 *
 * ⭐⭐ **A divergência do `ops` está na AUSÊNCIA.** No `ops`, `done → in_progress`
 * existe: uma entrega devolvida é o mesmo trabalho. Aqui, os três desfechos
 * formais (`deferred`/`denied`/`dismissed`) são o ATO DE IMPÉRIO — e são
 * DEFINITIVOS. Não há saída de nenhum deles. Um processo decidido que volta é um
 * RECURSO ou um NOVO protocolo, jamais a reabertura do ato consumado.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ProcessStatus, ProcessStatus])[] = [
  ['open', 'in_progress'],
  ['open', 'deferred'],
  ['open', 'denied'],
  ['open', 'dismissed'],
  ['in_progress', 'deferred'],
  ['in_progress', 'denied'],
  ['in_progress', 'dismissed'],
] as const;

/** Os três desfechos formais — o subconjunto terminal. */
export const FORMAL_DECISIONS: readonly FormalDecision[] = ['deferred', 'denied', 'dismissed'] as const;

export function canTransition(from: ProcessStatus, to: ProcessStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** Para onde este processo pode ir a partir de onde está. */
export function nextStatuses(from: ProcessStatus): readonly ProcessStatus[] {
  return ALLOWED_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t);
}

/** O processo ainda tramita? */
export function isInTransit(status: ProcessStatus): boolean {
  return status === 'open' || status === 'in_progress';
}

/**
 * O desfecho é uma decisão formal terminal?
 *
 * ⭐⭐ É a garantia, em função, de que os três desfechos são definitivos:
 * `isDecided` é `true` para os três e nada sai deles (`nextStatuses` vazio).
 */
export function isDecided(status: ProcessStatus): boolean {
  return status === 'deferred' || status === 'denied' || status === 'dismissed';
}

/** Este processo pode ser decidido agora? Só quem tramita. */
export function canDecide(status: ProcessStatus): boolean {
  return isInTransit(status);
}

/**
 * As etapas de um rito, na ordem.
 *
 * ⚠️ Ordena por `position`, nunca pela ordem em que vieram do banco.
 */
export function orderedStages(stages: readonly WorkflowStage[]): readonly WorkflowStage[] {
  return [...stages].sort((a, b) => a.position - b.position);
}

/** A próxima etapa depois desta, ou `null` se esta é a última. */
export function nextStage(
  stages: readonly WorkflowStage[],
  currentId: StageId | null,
): WorkflowStage | null {
  if (currentId === null) return null;
  const ordenadas = orderedStages(stages);
  const atual = ordenadas.find((s) => s.id === currentId);
  if (atual === undefined) return null;
  return ordenadas.find((s) => s.position > atual.position) ?? null;
}

/** As etapas ANTERIORES à atual — os destinos válidos de uma devolução. */
export function stagesBefore(
  stages: readonly WorkflowStage[],
  currentId: StageId | null,
): readonly WorkflowStage[] {
  const ordenadas = orderedStages(stages);
  // ⭐⭐ Processo decidido saiu do rito e NÃO se devolve (o DIVERGE do ops):
  // sem etapa atual, não há destino de devolução. É o oposto do ops, onde a OS
  // concluída podia voltar para qualquer etapa.
  if (currentId === null) return [];
  const atual = ordenadas.find((s) => s.id === currentId);
  if (atual === undefined) return [];
  return ordenadas.filter((s) => s.position < atual.position);
}

/** Esta é a última etapa do rito? Daqui o processo se decide, não avança. */
export function isLastStage(
  stages: readonly WorkflowStage[],
  currentId: StageId | null,
): boolean {
  return currentId !== null && nextStage(stages, currentId) === null;
}

/**
 * ⭐ **A PERMISSÃO QUE DEPENDE DO DESENHO DO TENANT.**
 *
 * Passar de uma etapa marcada `requiresApproval` é decisão e exige
 * `proc.process.decide`. Das demais, `proc.process.manage` basta.
 *
 * Repare no que esta função **não** faz: ela não procura pela palavra
 * "aprovação" no nome da etapa. Quem decide o que é decisão é o tenant, no
 * desenho — e um rito em espanhol ou com a etapa chamada "parecer final"
 * funciona igual.
 */
export function permissionToAdvance(
  stage: WorkflowStage,
): 'proc.process.decide' | 'proc.process.manage' {
  return stage.requiresApproval ? 'proc.process.decide' : 'proc.process.manage';
}

/** Motivo pelo qual avançar não é possível agora, ou `null` se é. */
export function whyCannotAdvance(
  process: Process,
  stages: readonly WorkflowStage[],
): string | null {
  if (!isInTransit(process.status)) {
    return 'Este processo já foi decidido: não tramita mais.';
  }
  if (isLastStage(stages, process.currentStageId)) {
    return 'Esta é a última etapa do rito: daqui o processo se decide, não avança.';
  }
  return null;
}

/** Motivo pelo qual pular não é possível agora, ou `null` se é. */
export function whyCannotSkip(
  process: Process,
  stages: readonly WorkflowStage[],
): string | null {
  if (!isInTransit(process.status)) {
    return 'Este processo já foi decidido: não tramita mais.';
  }
  const atual = stages.find((s) => s.id === process.currentStageId);
  if (atual === undefined) return 'Etapa atual desconhecida.';
  if (!atual.skippable) {
    return `A etapa "${atual.name}" não foi desenhada como pulável neste rito.`;
  }
  if (isLastStage(stages, process.currentStageId)) {
    return 'Esta é a última etapa do rito: não há para onde pular.';
  }
  return null;
}

/**
 * O QUADRO: uma coluna por etapa do rito, com os processos que estão em cada uma.
 *
 * ⭐ As colunas vêm das etapas DO TENANT. Processo decidido **não entra em
 * coluna nenhuma**: ele saiu do rito, e pendurá-lo na última fingiria que está.
 */
export function buildBoard(
  stages: readonly WorkflowStage[],
  processes: readonly Process[],
): readonly BoardColumn[] {
  return orderedStages(stages).map((stage) => ({
    stage,
    processes: processes.filter(
      (p) => isInTransit(p.status) && p.currentStageId === stage.id,
    ),
  }));
}

/** Um processo está vencido? Comparação de string em `AAAA-MM-DD` — ISO ordena. */
export function isOverdue(process: Process, today: string): boolean {
  if (process.dueDate === null) return false;
  if (!isInTransit(process.status)) return false;
  return process.dueDate < today;
}

/** O erro de validação de um processo novo, ou `null` se ele está bom. */
export function validateNewProcess(input: NewProcess): string | null {
  if (input.subject.trim().length === 0) {
    return 'O processo precisa de um objeto (assunto).';
  }
  if (input.workflowId.trim().length === 0) {
    return 'O processo precisa nascer num rito.';
  }
  // ⭐ O número de protocolo é obrigatório — é a identidade pública do processo,
  // o DIVERGE do ops. Mas o FORMATO é livre: cada órgão tem a convenção dele.
  if (input.protocolNumber.trim().length === 0) {
    return 'O processo precisa de um número de protocolo — a identidade que o cidadão cita.';
  }
  if (input.interestedPartyName.trim().length === 0) {
    return 'O processo é sempre o pedido de alguém: informe o interessado.';
  }
  if (input.dueDate != null && input.dueDate.trim().length > 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      return 'O prazo precisa estar no formato AAAA-MM-DD.';
    }
  }
  return null;
}

/**
 * O erro de validação de um despacho de decisão formal, ou `null`.
 *
 * ⭐ Decisão administrativa sem motivação é nula (Lei 9.784/99 art. 50): o
 * despacho é obrigatório, no banco (o porteiro) e aqui (a tela antecipa).
 */
export function validateDecision(decision: FormalDecision, despacho: string): string | null {
  if (!FORMAL_DECISIONS.includes(decision)) {
    return 'A decisão precisa ser deferir, indeferir ou arquivar.';
  }
  if (despacho.trim().length === 0) {
    return 'A decisão formal exige o despacho: decidir sem motivar é ato nulo.';
  }
  return null;
}

/**
 * O erro de validação de um rito novo, ou `null`.
 *
 * ⚠️ Um rito precisa de PELO MENOS UMA etapa. Rito vazio aceita processo que
 * nasce sem etapa nenhuma — e a coerência do banco recusaria, mas com um erro
 * de chave estrangeira que ninguém entende. Aqui a recusa tem frase.
 */
export function validateStages(stages: readonly NewStage[]): string | null {
  if (stages.length === 0) {
    return 'O rito precisa de pelo menos uma etapa.';
  }
  for (const s of stages) {
    if (s.name.trim().length === 0) return 'Toda etapa precisa de um nome.';
  }
  const nomes = stages.map((s) => s.name.trim().toLowerCase());
  if (new Set(nomes).size !== nomes.length) {
    return 'Duas etapas com o mesmo nome no mesmo rito só geram engano.';
  }
  const posicoes = stages.map((s) => s.position);
  if (new Set(posicoes).size !== posicoes.length) {
    return 'Duas etapas não podem ocupar a mesma posição.';
  }
  return null;
}

/** Um resumo do andamento, para o painel. Contagem, nunca estimativa. */
export function summarizeProcesses(
  processes: readonly Process[],
  today: string,
): {
  readonly total: number;
  readonly inTransit: number;
  readonly deferred: number;
  readonly denied: number;
  readonly dismissed: number;
  readonly overdue: number;
} {
  return {
    total: processes.length,
    inTransit: processes.filter((p) => isInTransit(p.status)).length,
    deferred: processes.filter((p) => p.status === 'deferred').length,
    denied: processes.filter((p) => p.status === 'denied').length,
    dismissed: processes.filter((p) => p.status === 'dismissed').length,
    overdue: processes.filter((p) => isOverdue(p, today)).length,
  };
}
