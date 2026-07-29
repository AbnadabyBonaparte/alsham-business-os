import type {
  BoardColumn,
  Deliverable,
  NewStage,
  NewWorkOrder,
  OrderStatus,
  PipelineStage,
  StageId,
  WorkOrder,
} from './types.ts';

/**
 * O motor da esteira — **puro**.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca calcula qual é a próxima etapa nem se um
 * botão pode aparecer. Se `apps/` inteiro sumisse, nenhuma regra deste
 * arquivo sumiria junto.
 *
 * O que este arquivo **não** faz, e é deliberado: ele não executa o
 * movimento. Mover a OS é mudar a etapa E escrever a trilha na mesma
 * transação, e isso vive em `ops.advance_order()` / `ops.skip_stage()` /
 * `ops.send_back_order()`, no banco. Aqui está a mesma regra, para a tela
 * poder antecipar a resposta sem chutar — e há teste que compara os dois
 * lados.
 */

/**
 * ⭐ **AS TRANSIÇÕES PERMITIDAS.** Espelho exato de `ops.allowed_transition()`
 * em `supabase/migrations/0018_ops.sql` §3.1, e há teste que lê aquele arquivo
 * e compara par a par. Mudar um lado só reprova.
 *
 * **A divergência do `ap` está na última linha.** No Módulo 3, `settled` é
 * terminal: um título quitado que volta a ser devido é documento NOVO, porque
 * dinheiro tem identidade por documento. Aqui, `done → in_progress` existe —
 * uma entrega devolvida é o MESMO trabalho, e uma segunda OS partiria em duas
 * a história de um serviço só.
 *
 * ⛔ **O que NÃO diverge:** `cancelled` continua terminal, como no `ap`.
 * Cancelar é dizer "este trabalho não será feito"; retomar é decidir fazer um
 * trabalho, e aí é OS nova. Copiar aqui foi decisão, não inércia.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [OrderStatus, OrderStatus])[] = [
  ['open', 'in_progress'],
  ['open', 'done'],
  ['open', 'cancelled'],
  ['in_progress', 'done'],
  ['in_progress', 'cancelled'],
  ['done', 'in_progress'],
] as const;

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** Para onde esta OS pode ir a partir de onde está. */
export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t);
}

/** A OS ainda está na esteira? */
export function isOnTheLine(status: OrderStatus): boolean {
  return status === 'open' || status === 'in_progress';
}

export function canCancel(status: OrderStatus): boolean {
  return canTransition(status, 'cancelled');
}

export function canComplete(status: OrderStatus): boolean {
  return canTransition(status, 'done');
}

/**
 * As etapas de uma esteira, na ordem.
 *
 * ⚠️ Ordena por `position`, nunca pela ordem em que vieram do banco. Uma lista
 * que chega desordenada e é exibida como veio é o defeito mais barato de
 * cometer e o mais caro de perceber: a esteira parece certa até o dia em que
 * alguém reordena.
 */
export function orderedStages(stages: readonly PipelineStage[]): readonly PipelineStage[] {
  return [...stages].sort((a, b) => a.position - b.position);
}

/** A próxima etapa depois desta, ou `null` se esta é a última. */
export function nextStage(
  stages: readonly PipelineStage[],
  currentId: StageId | null,
): PipelineStage | null {
  if (currentId === null) return null;
  const ordenadas = orderedStages(stages);
  const atual = ordenadas.find((s) => s.id === currentId);
  if (atual === undefined) return null;
  return ordenadas.find((s) => s.position > atual.position) ?? null;
}

/** As etapas ANTERIORES à atual — os destinos válidos de uma devolução. */
export function stagesBefore(
  stages: readonly PipelineStage[],
  currentId: StageId | null,
): readonly PipelineStage[] {
  const ordenadas = orderedStages(stages);
  // OS que já saiu da esteira (concluída) não tem etapa atual: devolver pode
  // mandá-la para qualquer etapa, e é assim que a reabertura acontece.
  if (currentId === null) return ordenadas;
  const atual = ordenadas.find((s) => s.id === currentId);
  if (atual === undefined) return [];
  return ordenadas.filter((s) => s.position < atual.position);
}

/** Esta é a última etapa da esteira? Daqui a OS se conclui, não avança. */
export function isLastStage(
  stages: readonly PipelineStage[],
  currentId: StageId | null,
): boolean {
  return currentId !== null && nextStage(stages, currentId) === null;
}

/**
 * ⭐ **A PERMISSÃO QUE DEPENDE DO DESENHO DO TENANT.**
 *
 * Passar de uma etapa marcada `requiresApproval` é decisão e exige
 * `ops.order.decide`. Das demais, `ops.order.manage` basta.
 *
 * Repare no que esta função **não** faz: ela não procura pela palavra
 * "aprovação" no nome da etapa. Quem decide o que é decisão é o tenant, no
 * desenho — e uma esteira em inglês, em espanhol ou com a etapa chamada "ok do
 * cliente" funciona igual.
 */
export function permissionToAdvance(stage: PipelineStage): 'ops.order.decide' | 'ops.order.manage' {
  return stage.requiresApproval ? 'ops.order.decide' : 'ops.order.manage';
}

/** Motivo pelo qual avançar não é possível agora, ou `null` se é. */
export function whyCannotAdvance(
  order: WorkOrder,
  stages: readonly PipelineStage[],
): string | null {
  if (!isOnTheLine(order.status)) {
    return 'Esta OS não está mais na esteira.';
  }
  if (isLastStage(stages, order.currentStageId)) {
    return 'Esta é a última etapa da esteira: daqui a OS se conclui, não avança.';
  }
  return null;
}

/** Motivo pelo qual pular não é possível agora, ou `null` se é. */
export function whyCannotSkip(
  order: WorkOrder,
  stages: readonly PipelineStage[],
): string | null {
  if (!isOnTheLine(order.status)) {
    return 'Esta OS não está mais na esteira.';
  }
  const atual = stages.find((s) => s.id === order.currentStageId);
  if (atual === undefined) return 'Etapa atual desconhecida.';
  if (!atual.skippable) {
    return `A etapa "${atual.name}" não foi desenhada como pulável nesta esteira.`;
  }
  if (isLastStage(stages, order.currentStageId)) {
    return 'Esta é a última etapa da esteira: não há para onde pular.';
  }
  return null;
}

/**
 * ⭐ **A PRÓXIMA VERSÃO DE UM ENTREGÁVEL.**
 *
 * Refazer cria versão nova; nunca edita. A numeração é por (OS, tipo) — a
 * segunda arte é `arte v2` mesmo que já existam cinco versões da legenda.
 *
 * ⚠️ Este número é uma SUGESTÃO da tela, não a garantia. Quem garante é o
 * `unique (tenant_id, order_id, kind, version)` do banco: duas refações
 * simultâneas calculariam a mesma "v2" aqui, e é lá que a segunda é recusada
 * em vez de sobrescrever a primeira.
 */
export function nextVersion(
  deliverables: readonly Deliverable[],
  orderId: string,
  kind: string,
): number {
  const doTipo = deliverables.filter((d) => d.orderId === orderId && d.kind === kind);
  if (doTipo.length === 0) return 1;
  return Math.max(...doTipo.map((d) => d.version)) + 1;
}

/** A versão corrente de cada tipo de entregável de uma OS. */
export function latestDeliverables(
  deliverables: readonly Deliverable[],
): readonly Deliverable[] {
  const porTipo = new Map<string, Deliverable>();
  for (const d of deliverables) {
    const atual = porTipo.get(d.kind);
    if (atual === undefined || d.version > atual.version) porTipo.set(d.kind, d);
  }
  return [...porTipo.values()].sort((a, b) => a.kind.localeCompare(b.kind, 'pt-BR'));
}

/**
 * O QUADRO: uma coluna por etapa da esteira, com as OS que estão em cada uma.
 *
 * ⭐ As colunas vêm das etapas DO TENANT. Não há um quadro de colunas fixas com
 * as etapas encaixadas nele — é o inverso, e é a Lei das Etapas chegando à
 * tela.
 *
 * OS fora da esteira (concluída ou cancelada) **não entra em coluna nenhuma**:
 * ela não está em etapa alguma, e pendurá-la na última fingiria que está.
 */
export function buildBoard(
  stages: readonly PipelineStage[],
  orders: readonly WorkOrder[],
): readonly BoardColumn[] {
  return orderedStages(stages).map((stage) => ({
    stage,
    orders: orders.filter((o) => isOnTheLine(o.status) && o.currentStageId === stage.id),
  }));
}

/** Uma OS está vencida? Comparação de string em `AAAA-MM-DD` — ISO ordena. */
export function isOverdue(order: WorkOrder, today: string): boolean {
  if (order.dueDate === null) return false;
  if (!isOnTheLine(order.status)) return false;
  return order.dueDate < today;
}

/** O erro de validação de uma OS nova, ou `null` se ela está boa. */
export function validateNewOrder(input: NewWorkOrder): string | null {
  if (input.title.trim().length === 0) {
    return 'A OS precisa de um título.';
  }
  if (input.pipelineId.trim().length === 0) {
    return 'A OS precisa nascer numa esteira.';
  }
  if (input.dueDate != null && input.dueDate.trim().length > 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      return 'O prazo precisa estar no formato AAAA-MM-DD.';
    }
  }
  return null;
}

/**
 * O erro de validação de uma esteira nova, ou `null`.
 *
 * ⚠️ Uma esteira precisa de PELO MENOS UMA etapa. Esteira vazia aceita OS que
 * nasce sem etapa nenhuma — e a coerência do banco recusaria, mas com um erro
 * de chave estrangeira que ninguém entende. Aqui a recusa tem frase.
 */
export function validateStages(stages: readonly NewStage[]): string | null {
  if (stages.length === 0) {
    return 'A esteira precisa de pelo menos uma etapa.';
  }
  for (const s of stages) {
    if (s.name.trim().length === 0) return 'Toda etapa precisa de um nome.';
  }
  const nomes = stages.map((s) => s.name.trim().toLowerCase());
  if (new Set(nomes).size !== nomes.length) {
    return 'Duas etapas com o mesmo nome na mesma esteira só geram engano.';
  }
  const posicoes = stages.map((s) => s.position);
  if (new Set(posicoes).size !== posicoes.length) {
    return 'Duas etapas não podem ocupar a mesma posição.';
  }
  return null;
}

/** Um resumo do andamento, para o painel. Contagem, nunca estimativa. */
export function summarizeOrders(orders: readonly WorkOrder[], today: string): {
  readonly total: number;
  readonly onTheLine: number;
  readonly done: number;
  readonly cancelled: number;
  readonly overdue: number;
} {
  return {
    total: orders.length,
    onTheLine: orders.filter((o) => isOnTheLine(o.status)).length,
    done: orders.filter((o) => o.status === 'done').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    overdue: orders.filter((o) => isOverdue(o, today)).length,
  };
}
