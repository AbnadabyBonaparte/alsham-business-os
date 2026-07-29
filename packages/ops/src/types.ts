/**
 * Os tipos do Módulo 7 — Esteira de Produção.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐ **A LEI DAS ETAPAS vive neste arquivo, por ausência.** Procure por um
 * `type Stage = 'briefing' | 'criação' | ...` — não existe, e não pode existir.
 * A etapa é DADO DO TENANT: uma linha de `ops.pipeline_stages` com o nome que
 * a empresa escolheu. Congelar as etapas num tipo transformaria a esteira de
 * uma agência na obrigação de uma construtora.
 *
 * O que É união fechada aqui: o STATUS da OS e o TIPO de movimento — porque
 * esses são do produto, não do cliente. A distinção é a etapa toda.
 *
 * @see supabase/migrations/0018_ops.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-OPS-SPEC.md — o fluxo de negócio
 */

/** Identificadores. Aliases nominais para o que no banco é `uuid`. */
export type PipelineId = string;
export type StageId = string;
export type OrderId = string;
export type TenantId = string;

/**
 * O estado de uma esteira. Arquivar é status — esteira que já rodou OS é
 * história, e apagá-la deixaria as ordens órfãs de contexto.
 */
export type PipelineStatus = 'active' | 'archived';

/**
 * O estado de uma ordem de serviço.
 *
 * `cancelled` é **status**, nunca `delete`: a OS cancelada continua na lista e
 * continua no banco, com a trilha inteira. Uma OS que some não deixa aprender
 * nada com ela.
 */
export type OrderStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

/**
 * O tipo de um movimento na trilha.
 *
 * ⭐ `skipped` é o que faz a Lei das Etapas ser verificável: uma etapa pulada
 * fica REGISTRADA, com quem pulou, quando e por quê. Sem esta linha, pular
 * seria indistinguível de cumprir — e é exatamente essa distinção que o dono
 * precisa enxergar.
 */
export type MovementKind =
  | 'opened'
  | 'advanced'
  | 'skipped'
  | 'sent-back'
  | 'completed'
  | 'cancelled'
  | 'deliverable-registered';

/**
 * Uma etapa da esteira, como o tenant a desenhou.
 *
 * Os dois campos que fazem a esteira ser desenho e não decoração:
 *
 * - `requiresApproval` — passar daqui é DECISÃO, e exige `ops.order.decide`.
 *   É o que dá sentido mecânico à etapa "aprovação" sem que "aprovação" vire
 *   um nome mágico dentro do código.
 * - `skippable` — a etapa pode não se aplicar a esta OS. Uma esteira sem
 *   etapas puláveis obriga o operador a mentir, e trilha que mente é pior que
 *   trilha que falta.
 */
export interface PipelineStage {
  readonly id: StageId;
  readonly pipelineId: PipelineId;
  /** A ordem na esteira. Contígua não é exigência — só a ordem importa. */
  readonly position: number;
  /** O nome que o TENANT escolheu. Ver o cabeçalho deste arquivo. */
  readonly name: string;
  readonly requiresApproval: boolean;
  readonly skippable: boolean;
}

/** Uma esteira desenhada por um tenant. */
export interface Pipeline {
  readonly id: PipelineId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string;
  readonly status: PipelineStatus;
}

/**
 * Uma ordem de serviço.
 *
 * `currentStageId` é nulo quando a OS saiu da esteira — concluída ou
 * cancelada. É a mesma coerência que o `check` do schema impõe.
 */
export interface WorkOrder {
  readonly id: OrderId;
  readonly tenantId: TenantId;
  readonly pipelineId: PipelineId;
  readonly currentStageId: StageId | null;
  readonly title: string;
  /**
   * O que é este trabalho. TEXTO LIVRE.
   *
   * ⭐ Chamou-se `briefing` até a guarda anti-viés do próprio módulo reprovar
   * o nome: "briefing" é vocabulário de agência, e uma construtora tem
   * descrição de serviço, uma oficina tem o relato do cliente, um escritório
   * tem o objeto do processo. É o MESMO campo. A etapa "briefing" continua
   * existindo — como nome de ETAPA, escolhido pelo tenant, que é onde
   * vocabulário de ofício deve morar.
   */
  readonly description: string;
  readonly assigneeUserId: string | null;
  /** `AAAA-MM-DD`. Trabalho sem prazo existe. */
  readonly dueDate: string | null;
  readonly status: OrderStatus;
}

/**
 * Uma linha da trilha — imutável por contrato, nas três camadas do banco.
 *
 * ⭐ **`fromStageName` e `toStageName` são o carimbo, e não redundância.** A
 * etapa é dado vivo do tenant: renomeia, reordena, some. O id sozinho faria a
 * trilha de 2026 ser lida com o vocabulário de 2028 — ou desaparecer junto com
 * a etapa. É a regra "a trilha sobrevive ao dado" do CORE-SPEC §4.
 */
export interface OrderMovement {
  readonly id: string;
  readonly orderId: OrderId;
  readonly kind: MovementKind;
  readonly fromStageId: StageId | null;
  readonly fromStageName: string | null;
  readonly toStageId: StageId | null;
  readonly toStageName: string | null;
  /** A razão do ato: por que pulou, o que refazer, o que ficou combinado. */
  readonly note: string;
  readonly occurredAt: string;
  readonly actorUserId: string | null;
}

/**
 * Uma versão de um entregável.
 *
 * **Minerado do kraken-v2** (`content_piece_versions`) — e a peça central da
 * mina é `instruction`: o pedido que gerou ESTA versão. Uma pilha de versões
 * sem o motivo de cada uma é um monte de arquivos, não um histórico.
 *
 * ⛔ `reference` é TEXTO — um link, um caminho de rede, um número de processo.
 * **Não há upload de arquivo**, e a ausência é decisão declarada: *Storage &
 * Arquivos* é capacidade do Core na Taxonomia §3, e está NÃO CONSTRUÍDA.
 */
export interface Deliverable {
  readonly id: string;
  readonly orderId: OrderId;
  readonly stageId: StageId | null;
  readonly stageName: string | null;
  /** TEXTO LIVRE: "arte", "laudo", "planta baixa", "orçamento". */
  readonly kind: string;
  readonly reference: string;
  readonly version: number;
  /** O pedido que gerou esta versão. Vazio na primeira. */
  readonly instruction: string;
}

/** O que se precisa saber para abrir uma OS. */
export interface NewWorkOrder {
  readonly pipelineId: PipelineId;
  readonly title: string;
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

/** Uma coluna do quadro: a etapa e as OS que estão nela. */
export interface BoardColumn {
  readonly stage: PipelineStage;
  readonly orders: readonly WorkOrder[];
}
