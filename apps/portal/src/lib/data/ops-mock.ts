import { PERMISSIONS, canTransition, nextStage, orderedStages } from '@alsham/ops';
import type {
  Deliverable,
  OrderMovement,
  OrderStatus,
  PipelineStage,
  WorkOrder,
} from '@alsham/ops';

import { DataPortError } from './port';
import type { OpsPort, PipelineWithStages } from './ops-port';

/**
 * Adapter MOCKADO do Módulo 7 — a tela se prova sem banco no ar.
 *
 * ⭐ **DUAS esteiras de ofícios diferentes, e isso é o dado de demonstração
 * fazendo o argumento do módulo.** Uma agência e uma manutenção predial, na
 * mesma tabela, sem uma linha de código diferente. Se a demonstração trouxesse
 * só a esteira de marketing, ela venderia a impressão exata que o cabeçalho do
 * `0018_ops.sql` recusa.
 *
 * ⚠️ **Lei anti-viés aplicada aos dados de exemplo.** Nenhum nome de cliente,
 * nenhuma marca, nenhuma ferramenta de terceiro. As referências de entregável
 * apontam para um domínio inválido de propósito.
 *
 * ⚠️ Este arquivo **não** contém regra de negócio própria — chama
 * `canTransition()` e `nextStage()` do pacote, porque um mock que aceita o que
 * o banco recusa faz a demonstração mentir sobre o produto.
 */

/** Data-base fixa: dado de demonstração não pode mudar conforme o dia. */
const HOJE = '2026-07-28';

function etapa(
  id: string,
  pipelineId: string,
  position: number,
  name: string,
  requiresApproval = false,
  skippable = false,
): PipelineStage {
  return { id, pipelineId, position, name, requiresApproval, skippable };
}

const ESTEIRAS: PipelineWithStages[] = [
  {
    pipeline: {
      id: 'pipe-conteudo',
      tenantId: 'tenant-demo',
      name: 'Produção de conteúdo',
      description: 'Da abertura à veiculação, com aprovação antes de publicar.',
      status: 'active',
    },
    stages: [
      etapa('st-abertura', 'pipe-conteudo', 0, 'abertura'),
      etapa('st-briefing', 'pipe-conteudo', 1, 'briefing', false, true),
      etapa('st-criacao', 'pipe-conteudo', 2, 'criação'),
      etapa('st-revisao', 'pipe-conteudo', 3, 'revisão'),
      etapa('st-aprovacao', 'pipe-conteudo', 4, 'aprovação', true, false),
      etapa('st-veiculacao', 'pipe-conteudo', 5, 'veiculação'),
    ],
  },
  {
    // ⭐ Outro ofício inteiro, na mesma tabela. É a prova do anti-viés na tela.
    pipeline: {
      id: 'pipe-manutencao',
      tenantId: 'tenant-demo',
      name: 'Ordem de manutenção',
      description: 'Chamado, vistoria e execução. A vistoria pode não se aplicar.',
      status: 'active',
    },
    stages: [
      etapa('st-chamado', 'pipe-manutencao', 0, 'chamado'),
      etapa('st-vistoria', 'pipe-manutencao', 1, 'vistoria', false, true),
      etapa('st-execucao', 'pipe-manutencao', 2, 'execução'),
    ],
  },
];

const ORDENS: WorkOrder[] = [
  {
    id: 'os-1',
    tenantId: 'tenant-demo',
    pipelineId: 'pipe-conteudo',
    currentStageId: 'st-criacao',
    title: 'Peça para a data comemorativa de setembro',
    description: 'Três formatos, com a mesma mensagem adaptada a cada canal.',
    assigneeUserId: null,
    dueDate: '2026-08-20',
    status: 'in_progress',
  },
  {
    id: 'os-2',
    tenantId: 'tenant-demo',
    pipelineId: 'pipe-conteudo',
    currentStageId: 'st-aprovacao',
    title: 'Revisão do material institucional',
    description: 'Atualizar dados e trocar as fotos antigas.',
    assigneeUserId: null,
    // Vencida de propósito: o selo de atraso precisa aparecer na demonstração.
    dueDate: '2026-07-10',
    status: 'in_progress',
  },
  {
    id: 'os-3',
    tenantId: 'tenant-demo',
    pipelineId: 'pipe-manutencao',
    currentStageId: 'st-execucao',
    title: 'Troca do quadro de luz do bloco B',
    description: 'Chamado aberto pela portaria.',
    assigneeUserId: null,
    dueDate: null,
    status: 'in_progress',
  },
  {
    id: 'os-4',
    tenantId: 'tenant-demo',
    pipelineId: 'pipe-conteudo',
    currentStageId: 'st-veiculacao',
    title: 'Campanha de julho',
    description: 'Entregue e publicada.',
    assigneeUserId: null,
    dueDate: '2026-07-01',
    status: 'done',
  },
];

/**
 * A trilha da `os-1`, contando uma história completa: abriu, andou, PULOU o
 * briefing com razão, e recebeu duas versões de arte — a segunda com a
 * instrução que a gerou.
 */
const TRILHA: Record<string, OrderMovement[]> = {
  'os-1': [
    {
      id: 'mv-1', orderId: 'os-1', kind: 'opened',
      fromStageId: null, fromStageName: null,
      toStageId: 'st-abertura', toStageName: 'abertura',
      note: '', occurredAt: `${HOJE}T09:00:00.000Z`, actorUserId: null,
    },
    {
      id: 'mv-2', orderId: 'os-1', kind: 'advanced',
      fromStageId: 'st-abertura', fromStageName: 'abertura',
      toStageId: 'st-briefing', toStageName: 'briefing',
      note: '', occurredAt: `${HOJE}T09:12:00.000Z`, actorUserId: null,
    },
    {
      id: 'mv-3', orderId: 'os-1', kind: 'skipped',
      fromStageId: 'st-briefing', fromStageName: 'briefing',
      toStageId: 'st-criacao', toStageName: 'criação',
      note: 'Este trabalho não tem briefing do cliente — a pauta veio pronta.',
      occurredAt: `${HOJE}T09:15:00.000Z`, actorUserId: null,
    },
    {
      id: 'mv-4', orderId: 'os-1', kind: 'deliverable-registered',
      fromStageId: null, fromStageName: null,
      toStageId: 'st-criacao', toStageName: 'criação',
      note: 'arte v1', occurredAt: `${HOJE}T11:30:00.000Z`, actorUserId: null,
    },
    {
      id: 'mv-5', orderId: 'os-1', kind: 'deliverable-registered',
      fromStageId: null, fromStageName: null,
      toStageId: 'st-criacao', toStageName: 'criação',
      note: 'arte v2 — tirar o telefone do rodapé',
      occurredAt: `${HOJE}T14:05:00.000Z`, actorUserId: null,
    },
  ],
  'os-2': [
    {
      id: 'mv-6', orderId: 'os-2', kind: 'opened',
      fromStageId: null, fromStageName: null,
      toStageId: 'st-abertura', toStageName: 'abertura',
      note: '', occurredAt: '2026-07-05T10:00:00.000Z', actorUserId: null,
    },
    {
      id: 'mv-7', orderId: 'os-2', kind: 'sent-back',
      fromStageId: 'st-aprovacao', fromStageName: 'aprovação',
      toStageId: 'st-revisao', toStageName: 'revisão',
      note: 'Os dados da página 3 estão desatualizados.',
      occurredAt: '2026-07-20T16:40:00.000Z', actorUserId: null,
    },
  ],
};

const ENTREGAVEIS: Record<string, Deliverable[]> = {
  'os-1': [
    {
      id: 'dl-1', orderId: 'os-1', stageId: 'st-criacao', stageName: 'criação',
      kind: 'arte', reference: 'https://exemplo.invalido/pasta/arte-v1',
      version: 1, instruction: '',
    },
    {
      id: 'dl-2', orderId: 'os-1', stageId: 'st-criacao', stageName: 'criação',
      kind: 'arte', reference: 'https://exemplo.invalido/pasta/arte-v2',
      version: 2, instruction: 'tirar o telefone do rodapé',
    },
    {
      id: 'dl-3', orderId: 'os-1', stageId: 'st-criacao', stageName: 'criação',
      kind: 'legenda', reference: 'https://exemplo.invalido/pasta/legenda-v1',
      version: 1, instruction: '',
    },
  ],
};

export function createOpsMockPort(): OpsPort {
  const esteiras = ESTEIRAS.map((e) => ({ ...e, stages: [...e.stages] }));
  const ordens = ORDENS.map((o) => ({ ...o }));
  const trilha: Record<string, OrderMovement[]> = Object.fromEntries(
    Object.entries(TRILHA).map(([k, v]) => [k, [...v]]),
  );
  const entregaveis: Record<string, Deliverable[]> = Object.fromEntries(
    Object.entries(ENTREGAVEIS).map(([k, v]) => [k, [...v]]),
  );
  let seq = 100;

  const acharOrdem = (orderId: string): WorkOrder => {
    const o = ordens.find((x) => x.id === orderId);
    if (o === undefined) throw new DataPortError('Ordem de serviço não encontrada.');
    return o;
  };

  const etapasDe = (pipelineId: string): readonly PipelineStage[] =>
    esteiras.find((e) => e.pipeline.id === pipelineId)?.stages ?? [];

  const registrarMovimento = (m: Omit<OrderMovement, 'id' | 'occurredAt'>) => {
    seq += 1;
    (trilha[m.orderId] ??= []).push({
      ...m,
      id: `mv-${seq}`,
      occurredAt: `${HOJE}T18:00:00.000Z`,
    });
  };

  const trocarOrdem = (orderId: string, patch: Partial<WorkOrder>) => {
    const i = ordens.findIndex((x) => x.id === orderId);
    ordens[i] = { ...ordens[i]!, ...patch };
  };

  return {
    kind: 'mock',

    async listPermissions() {
      // No modo demonstração o operador pode tudo — não há papel para consultar.
      return new Set(Object.values(PERMISSIONS));
    },

    async loadPipelines() {
      return esteiras.map((e) => ({ ...e, stages: orderedStages(e.stages) }));
    },

    async loadOrders() {
      return ordens.map((o) => ({ ...o }));
    },

    async loadOrderDetail(orderId: string) {
      return {
        movements: [...(trilha[orderId] ?? [])].reverse(),
        deliverables: [...(entregaveis[orderId] ?? [])],
      };
    },

    async createPipeline(input) {
      seq += 1;
      const id = `pipe-${seq}`;
      esteiras.push({
        pipeline: {
          id,
          tenantId: 'tenant-demo',
          name: input.name,
          description: input.description,
          status: 'active',
        },
        stages: input.stages.map((s, i) => etapa(
          `${id}-st-${i}`, id, s.position, s.name, s.requiresApproval, s.skippable,
        )),
      });
      return { pipelineId: id };
    },

    async createOrder(input) {
      seq += 1;
      const id = `os-${seq}`;
      ordens.push({
        id,
        tenantId: 'tenant-demo',
        pipelineId: input.pipelineId,
        currentStageId: input.stageId,
        title: input.title,
        description: input.description,
        assigneeUserId: input.assigneeUserId,
        dueDate: input.dueDate,
        status: 'open',
      });
      const et = etapasDe(input.pipelineId).find((s) => s.id === input.stageId);
      registrarMovimento({
        orderId: id, kind: 'opened',
        fromStageId: null, fromStageName: null,
        toStageId: input.stageId, toStageName: et?.name ?? null,
        note: '', actorUserId: null,
      });
      return { orderId: id };
    },

    async advance(input) {
      const o = acharOrdem(input.orderId);
      const etapas = etapasDe(o.pipelineId);
      const atual = etapas.find((s) => s.id === o.currentStageId);
      const proxima = nextStage(etapas, o.currentStageId);
      if (proxima === null) {
        throw new DataPortError('Esta é a última etapa da esteira: daqui a OS se conclui.');
      }
      registrarMovimento({
        orderId: o.id, kind: 'advanced',
        fromStageId: atual?.id ?? null, fromStageName: atual?.name ?? null,
        toStageId: proxima.id, toStageName: proxima.name,
        note: input.note, actorUserId: null,
      });
      trocarOrdem(o.id, { currentStageId: proxima.id, status: 'in_progress' });
    },

    async skip(input) {
      const o = acharOrdem(input.orderId);
      const etapas = etapasDe(o.pipelineId);
      const atual = etapas.find((s) => s.id === o.currentStageId);
      // ⭐ O mock recusa o que o banco recusa. Um mock permissivo faria a
      // demonstração prometer o que o produto não faz.
      if (atual === undefined || !atual.skippable) {
        throw new DataPortError(
          `A etapa "${atual?.name ?? '?'}" não foi desenhada como pulável nesta esteira.`,
        );
      }
      if (input.reason.trim().length === 0) {
        throw new DataPortError('Pular uma etapa exige a razão.');
      }
      const proxima = nextStage(etapas, o.currentStageId);
      if (proxima === null) throw new DataPortError('Não há para onde pular.');
      registrarMovimento({
        orderId: o.id, kind: 'skipped',
        fromStageId: atual.id, fromStageName: atual.name,
        toStageId: proxima.id, toStageName: proxima.name,
        note: input.reason.trim(), actorUserId: null,
      });
      trocarOrdem(o.id, { currentStageId: proxima.id, status: 'in_progress' });
    },

    async sendBack(input) {
      const o = acharOrdem(input.orderId);
      if (input.instruction.trim().length === 0) {
        throw new DataPortError('Devolver exige a instrução do que refazer.');
      }
      const etapas = etapasDe(o.pipelineId);
      const atual = etapas.find((s) => s.id === o.currentStageId);
      const destino = etapas.find((s) => s.id === input.toStageId);
      if (destino === undefined) {
        throw new DataPortError('A etapa de destino não pertence à esteira desta OS.');
      }
      registrarMovimento({
        orderId: o.id, kind: 'sent-back',
        fromStageId: atual?.id ?? null, fromStageName: atual?.name ?? null,
        toStageId: destino.id, toStageName: destino.name,
        note: input.instruction.trim(), actorUserId: null,
      });
      trocarOrdem(o.id, { currentStageId: destino.id, status: 'in_progress' });
    },

    async updateStatus(input: { orderId: string; status: OrderStatus }) {
      const o = acharOrdem(input.orderId);
      if (!canTransition(o.status, input.status)) {
        throw new DataPortError(
          `A transição ${o.status} → ${input.status} não existe no ciclo de vida da OS.`,
        );
      }
      const etapas = etapasDe(o.pipelineId);
      const atual = etapas.find((s) => s.id === o.currentStageId);
      registrarMovimento({
        orderId: o.id,
        kind: input.status === 'done' ? 'completed' : 'cancelled',
        fromStageId: atual?.id ?? null, fromStageName: atual?.name ?? null,
        toStageId: null, toStageName: null,
        note: '', actorUserId: null,
      });
      trocarOrdem(o.id, { status: input.status });
    },

    async registerDeliverable(input) {
      const lista = (entregaveis[input.orderId] ??= []);
      if (lista.some((d) => d.kind === input.kind && d.version === input.version)) {
        throw new DataPortError(
          `Já existe uma versão ${input.version} de "${input.kind}" nesta OS.`,
        );
      }
      seq += 1;
      lista.push({
        id: `dl-${seq}`,
        orderId: input.orderId,
        stageId: input.stageId,
        stageName: input.stageName,
        kind: input.kind,
        reference: input.reference,
        version: input.version,
        instruction: input.instruction,
      });
      registrarMovimento({
        orderId: input.orderId, kind: 'deliverable-registered',
        fromStageId: null, fromStageName: null,
        toStageId: input.stageId, toStageName: input.stageName,
        note: `${input.kind} v${input.version}` +
          (input.instruction.trim().length > 0 ? ` — ${input.instruction.trim()}` : ''),
        actorUserId: null,
      });
    },
  };
}
