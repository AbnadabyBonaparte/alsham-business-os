import type {
  Deliverable,
  OrderMovement,
  OrderStatus,
  Pipeline,
  PipelineStage,
  WorkOrder,
} from '@alsham/ops';

/** Uma esteira com as etapas dela, que é como a tela sempre precisa. */
export interface PipelineWithStages {
  readonly pipeline: Pipeline;
  readonly stages: readonly PipelineStage[];
}

/**
 * A PORTA DE DADOS do Módulo 7.
 *
 * ⚠️ **Porta própria — Lei do Lego (CLAUDE.md §5.5.8), sétima aplicação.**
 *
 * ⭐ Repare no que esta interface **não** tem: nenhum `proximaEtapa`,
 * `podeAvancar` ou `proximaVersao`. Quem decide é `@alsham/ops`. A porta busca
 * e grava; ela nunca sabe para onde a OS vai.
 *
 * ⛔ E repare no que ela também não tem: nenhum método que APAGUE OS, trilha ou
 * entregável. As três tabelas não têm policy nem GRANT de DELETE. A única
 * exclusão que existe no módulo é a de ETAPA — redesenhar a esteira é
 * tentativa e erro —, e ela tem método próprio, com nome que diz o que faz.
 *
 * ⭐ **Os três movimentos são RPC, não `update`.** Mover a OS é mudar a etapa E
 * escrever a trilha na mesma transação, com o nome da etapa lido no servidor no
 * instante do ato. Um `update` daqui faria as duas escritas separadas — e a que
 * costuma faltar é a trilha.
 */
export interface OpsPort {
  readonly kind: 'mock' | 'supabase';

  /** As permissões `ops.*` do usuário no tenant atual. */
  listPermissions(): Promise<ReadonlySet<string>>;

  loadPipelines(): Promise<PipelineWithStages[]>;

  loadOrders(): Promise<WorkOrder[]>;

  /** A trilha e os entregáveis de UMA OS — o interior dela. */
  loadOrderDetail(orderId: string): Promise<{
    readonly movements: readonly OrderMovement[];
    readonly deliverables: readonly Deliverable[];
  }>;

  createPipeline(input: {
    readonly name: string;
    readonly description: string;
    readonly stages: readonly {
      readonly name: string;
      readonly position: number;
      readonly requiresApproval: boolean;
      readonly skippable: boolean;
    }[];
  }): Promise<{ pipelineId: string }>;

  /**
   * Abre uma OS **já validada** por `validateNewOrder()`.
   *
   * É isto que dispara `orders_emit_opened`: a primeira linha da trilha e o
   * `ops.order.opened` na caixa de saída do Core, na mesma transação.
   */
  createOrder(input: {
    readonly pipelineId: string;
    readonly stageId: string;
    readonly title: string;
    readonly description: string;
    readonly assigneeUserId: string | null;
    readonly dueDate: string | null;
  }): Promise<{ orderId: string }>;

  /** `ops.advance_order()` — a etapa e a trilha, juntas. */
  advance(input: { orderId: string; note: string }): Promise<void>;

  /** `ops.skip_stage()` — a razão é obrigatória, e o banco confere. */
  skip(input: { orderId: string; reason: string }): Promise<void>;

  /** `ops.send_back_order()` — a instrução é obrigatória, e o banco confere. */
  sendBack(input: { orderId: string; toStageId: string; instruction: string }): Promise<void>;

  /** Concluir e cancelar são `update` de status, como no `ap` e no `ar`. */
  updateStatus(input: { orderId: string; status: OrderStatus }): Promise<void>;

  /**
   * Registra uma versão de entregável. A versão vem calculada por
   * `nextVersion()`; quem GARANTE que não colide é o `unique` do banco.
   */
  registerDeliverable(input: {
    readonly orderId: string;
    readonly stageId: string | null;
    readonly stageName: string | null;
    readonly kind: string;
    readonly reference: string;
    readonly version: number;
    readonly instruction: string;
  }): Promise<void>;
}
