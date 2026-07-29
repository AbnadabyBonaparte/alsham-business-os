import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Deliverable,
  MovementKind,
  OrderMovement,
  OrderStatus,
  PipelineStatus,
  WorkOrder,
} from '@alsham/ops';

import { DataPortError } from './port';
import type { OpsPort, PipelineWithStages } from './ops-port';

/**
 * Adapter REAL do Módulo 7 — fala com o Supabase **como o usuário**, sob RLS.
 *
 * ⛔ **A `service_role key` não aparece neste arquivo, e não pode aparecer.**
 *
 * ⛔ **Não existe `delete` de OS, trilha ou entregável neste arquivo**: as três
 * tabelas não têm policy nem GRANT de DELETE. Concluir e cancelar são `status`;
 * refazer é versão nova.
 *
 * ⭐ **Os três movimentos são `rpc()`, e é a decisão de desenho desta porta.**
 * Mover a OS é mudar a etapa E escrever a trilha na mesma transação, com o nome
 * da etapa lido no servidor no instante do ato. Dois `update` daqui seriam duas
 * chances de a trilha ficar para trás — e a permissão que depende do desenho da
 * etapa (`requires_approval`) não caberia numa policy.
 *
 * ⚠️ Zero regra de negócio. Traduz linha de banco em tipo do domínio e volta.
 *
 * ⚠️ **O schema `ops` precisa estar EXPOSTO na Data API do Supabase** — lição
 * paga na Etapa 9 e repetida em todas desde então. Está no runbook (§11.0).
 *
 * O `tenantId` chega resolvido da sessão (`lib/session.ts`) — nunca da URL.
 */

const OPS = 'ops';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

/**
 * Traduz o erro do banco em frase que o operador resolve.
 *
 * Os três códigos que as funções de movimento levantam são coisas diferentes, e
 * cada uma se resolve de um jeito: falta permissão (fale com quem administra),
 * o ato não cabe (a etapa não é pulável, a OS saiu da esteira), ou a OS sumiu.
 */
function traduzErroDeMovimento(erro: unknown, acao: string): never {
  const code = (erro as { code?: string }).code;
  const message = (erro as { message?: string }).message ?? '';

  if (code === '42501' || message.includes('ops.order.decide') || message.includes('ops.order.manage')) {
    throw new DataPortError(
      message.includes('ops.order.decide')
        ? 'Este passo é uma decisão e exige a permissão ops.order.decide.'
        : `Você não tem permissão para ${acao}.`,
      { cause: erro },
    );
  }
  if (code === '22023') {
    // A própria função já explica o porquê — "não foi desenhada como pulável",
    // "é a última etapa", "exige a razão". Repassar o texto dela é melhor do
    // que reescrevê-lo aqui e deixar os dois divergirem.
    throw new DataPortError(message || `Não é possível ${acao} agora.`, { cause: erro });
  }
  if (code === 'P0002') {
    throw new DataPortError('Ordem de serviço não encontrada.', { cause: erro });
  }
  fail(acao, erro);
}

interface PipelineDbRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  status: PipelineStatus;
}

interface StageDbRow {
  id: string;
  pipeline_id: string;
  position: number;
  name: string;
  requires_approval: boolean;
  skippable: boolean;
}

interface OrderDbRow {
  id: string;
  tenant_id: string;
  pipeline_id: string;
  current_stage_id: string | null;
  title: string;
  description: string | null;
  assignee_user_id: string | null;
  due_date: string | null;
  status: OrderStatus;
}

interface MovementDbRow {
  id: string;
  order_id: string;
  kind: MovementKind;
  from_stage_id: string | null;
  from_stage_name: string | null;
  to_stage_id: string | null;
  to_stage_name: string | null;
  note: string | null;
  occurred_at: string;
  actor_user_id: string | null;
}

interface DeliverableDbRow {
  id: string;
  order_id: string;
  stage_id: string | null;
  stage_name: string | null;
  kind: string;
  reference: string;
  version: number;
  instruction: string | null;
}

function toOrder(r: OrderDbRow): WorkOrder {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    pipelineId: r.pipeline_id,
    currentStageId: r.current_stage_id,
    title: r.title,
    description: r.description ?? '',
    assigneeUserId: r.assignee_user_id,
    dueDate: r.due_date,
    status: r.status,
  };
}

function toMovement(r: MovementDbRow): OrderMovement {
  return {
    id: r.id,
    orderId: r.order_id,
    kind: r.kind,
    fromStageId: r.from_stage_id,
    fromStageName: r.from_stage_name,
    toStageId: r.to_stage_id,
    toStageName: r.to_stage_name,
    note: r.note ?? '',
    occurredAt: r.occurred_at,
    actorUserId: r.actor_user_id,
  };
}

function toDeliverable(r: DeliverableDbRow): Deliverable {
  return {
    id: r.id,
    orderId: r.order_id,
    stageId: r.stage_id,
    stageName: r.stage_name,
    kind: r.kind,
    reference: r.reference,
    version: Number(r.version),
    instruction: r.instruction ?? '',
  };
}

export function createOpsSupabasePort(db: SupabaseClient, tenantId: string): OpsPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'ops.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r) => r.permission_key as string));
    },

    async loadPipelines(): Promise<PipelineWithStages[]> {
      const { data: pipes, error: e1 } = await db
        .schema(OPS)
        .from('pipelines')
        .select('id, tenant_id, name, description, status')
        .eq('status', 'active')
        .order('name', { ascending: true });
      if (e1) fail('carregar as esteiras', e1);

      const ids = (pipes ?? []).map((p) => (p as unknown as PipelineDbRow).id);
      if (ids.length === 0) return [];

      // ⭐ UMA consulta para todas as etapas, com `in`. Uma consulta por esteira
      // seria o N+1 que o Módulo 4 registrou como dívida e que esta operação
      // pagou — não se paga uma dívida e se abre outra igual na página ao lado.
      const { data: stages, error: e2 } = await db
        .schema(OPS)
        .from('pipeline_stages')
        .select('id, pipeline_id, position, name, requires_approval, skippable')
        .in('pipeline_id', ids)
        .order('position', { ascending: true });
      if (e2) fail('carregar as etapas das esteiras', e2);

      const porEsteira = new Map<string, StageDbRow[]>();
      for (const s of (stages ?? []) as unknown as StageDbRow[]) {
        const lista = porEsteira.get(s.pipeline_id);
        if (lista === undefined) porEsteira.set(s.pipeline_id, [s]);
        else lista.push(s);
      }

      return ((pipes ?? []) as unknown as PipelineDbRow[]).map((p) => ({
        pipeline: {
          id: p.id,
          tenantId: p.tenant_id,
          name: p.name,
          description: p.description ?? '',
          status: p.status,
        },
        stages: (porEsteira.get(p.id) ?? []).map((s) => ({
          id: s.id,
          pipelineId: s.pipeline_id,
          position: Number(s.position),
          name: s.name,
          requiresApproval: s.requires_approval,
          skippable: s.skippable,
        })),
      }));
    },

    async loadOrders() {
      const { data, error } = await db
        .schema(OPS)
        .from('orders')
        .select(
          'id, tenant_id, pipeline_id, current_stage_id, title, description, assignee_user_id, due_date, status',
        )
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(300);
      if (error) fail('carregar as ordens de serviço', error);
      return ((data ?? []) as unknown as OrderDbRow[]).map(toOrder);
    },

    async loadOrderDetail(orderId: string) {
      const { data: movs, error: e1 } = await db
        .schema(OPS)
        .from('order_events')
        .select(
          'id, order_id, kind, from_stage_id, from_stage_name, to_stage_id, to_stage_name, note, occurred_at, actor_user_id',
        )
        .eq('order_id', orderId)
        .order('occurred_at', { ascending: false })
        .limit(200);
      if (e1) fail('carregar a trilha da OS', e1);

      const { data: dels, error: e2 } = await db
        .schema(OPS)
        .from('deliverables')
        .select('id, order_id, stage_id, stage_name, kind, reference, version, instruction')
        .eq('order_id', orderId)
        .order('version', { ascending: false })
        .limit(200);
      if (e2) fail('carregar os entregáveis da OS', e2);

      return {
        movements: ((movs ?? []) as unknown as MovementDbRow[]).map(toMovement),
        deliverables: ((dels ?? []) as unknown as DeliverableDbRow[]).map(toDeliverable),
      };
    },

    async createPipeline(input) {
      const { data, error } = await db
        .schema(OPS)
        .from('pipelines')
        .insert({ tenant_id: tenantId, name: input.name, description: input.description })
        .select('id')
        .single();

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new DataPortError(
            `Já existe uma esteira ativa chamada "${input.name}" neste tenant.`,
            { cause: error },
          );
        }
        fail('criar a esteira', error);
      }

      const pipelineId = (data as { id: string }).id;
      const { error: e2 } = await db
        .schema(OPS)
        .from('pipeline_stages')
        .insert(
          input.stages.map((s) => ({
            tenant_id: tenantId,
            pipeline_id: pipelineId,
            position: s.position,
            name: s.name,
            requires_approval: s.requiresApproval,
            skippable: s.skippable,
          })),
        );
      // ⚠️ A esteira já existe se as etapas falharem. Dizer isso é melhor do
      // que fingir que nada aconteceu: quem abrir a lista vai vê-la lá.
      if (e2) {
        throw new DataPortError(
          'A esteira foi criada, mas as etapas não. Abra-a e acrescente as etapas.',
          { cause: e2 },
        );
      }
      return { pipelineId };
    },

    async createOrder(input) {
      const { data, error } = await db
        .schema(OPS)
        .from('orders')
        .insert({
          tenant_id: tenantId,
          pipeline_id: input.pipelineId,
          current_stage_id: input.stageId,
          title: input.title,
          description: input.description,
          assignee_user_id: input.assigneeUserId,
          due_date: input.dueDate,
        })
        .select('id')
        .single();
      if (error) fail('abrir a ordem de serviço', error);
      return { orderId: (data as { id: string }).id };
    },

    async advance(input) {
      const { error } = await db
        .schema(OPS)
        .rpc('advance_order', { p_order_id: input.orderId, p_note: input.note });
      if (error) traduzErroDeMovimento(error, 'avançar a OS');
    },

    async skip(input) {
      const { error } = await db
        .schema(OPS)
        .rpc('skip_stage', { p_order_id: input.orderId, p_reason: input.reason });
      if (error) traduzErroDeMovimento(error, 'pular a etapa');
    },

    async sendBack(input) {
      const { error } = await db.schema(OPS).rpc('send_back_order', {
        p_order_id: input.orderId,
        p_to_stage_id: input.toStageId,
        p_instruction: input.instruction,
      });
      if (error) traduzErroDeMovimento(error, 'devolver a OS');
    },

    async updateStatus(input) {
      const { error } = await db
        .schema(OPS)
        .from('orders')
        .update({ status: input.status })
        .eq('id', input.orderId)
        // Cinto: o `tenant_id` da sessão também no WHERE.
        .eq('tenant_id', tenantId);

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === '42501') {
          throw new DataPortError(
            'Concluir ou cancelar uma OS exige a permissão ops.order.decide.',
            { cause: error },
          );
        }
        if (code === '22023') {
          throw new DataPortError(
            'Esta mudança de estado não existe no ciclo de vida da OS.',
            { cause: error },
          );
        }
        fail('atualizar a ordem de serviço', error);
      }
    },

    async registerDeliverable(input) {
      const { error } = await db.schema(OPS).from('deliverables').insert({
        tenant_id: tenantId,
        order_id: input.orderId,
        stage_id: input.stageId,
        stage_name: input.stageName,
        kind: input.kind,
        reference: input.reference,
        version: input.version,
        instruction: input.instruction,
      });

      if (error) {
        // 23505 é o `unique (tenant_id, order_id, kind, version)`: duas
        // refações simultâneas calcularam a mesma versão. O operador precisa
        // saber que é isso, e não pane — basta recarregar e tentar de novo.
        if ((error as { code?: string }).code === '23505') {
          throw new DataPortError(
            `A versão ${input.version} de "${input.kind}" já foi registrada — alguém refez ao mesmo tempo. Recarregue e tente de novo.`,
            { cause: error },
          );
        }
        fail('registrar o entregável', error);
      }
    },
  };
}
