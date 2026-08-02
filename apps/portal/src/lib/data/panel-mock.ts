import { buildShelf } from '@alsham/permissions';
import type { CatalogEntry, ShelfItem } from '@alsham/permissions';

import type {
  AuditRow,
  CourierSummary,
  ModuleHealth,
  OverviewCard,
  PanelPort,
  PlanUsageRow,
} from './panel-port';

/**
 * Adapter MOCKADO do Painel.
 *
 * ⚠️ **Números de demonstração são MODESTOS de propósito.** Um painel de
 * exemplo com "1.284 eventos entregues" venderia uma operação que não existe —
 * e a Lei 7 vale para a tela de demonstração tanto quanto para a de produção.
 */
const HOJE = '2026-07-28';

const CATALOGO: CatalogEntry[] = [
  {
    moduleId: 'recon',
    name: 'Conciliação & Aprovações',
    version: '0.1.0',
    summary: 'Importa o extrato, sugere as baixas e põe cada divergência numa fila com visto e trilha.',
    layer: 'domain',
    domainKey: 'finance',
    verticalKey: null,
    capabilities: [],
    permissions: [],
    emits: [],
    consumes: [],
  },
  {
    moduleId: 'ops',
    name: 'Esteira de Produção',
    version: '0.1.0',
    summary: 'A empresa desenha a própria esteira de trabalho e move cada ordem de serviço por ela.',
    layer: 'domain',
    domainKey: 'operations',
    verticalKey: null,
    capabilities: [],
    permissions: [],
    emits: [],
    consumes: [],
  },
  // ⭐ Onda UX Viva — a Visão Geral lê estes módulos; o demo os instala para que
  // a tela de demonstração mostre o padrão (números modestos, Lei 7).
  {
    moduleId: 'cash',
    name: 'Fluxo de Caixa',
    version: '0.1.0',
    summary: 'O livro do dinheiro: lançamentos imutáveis, saldo calculado, fluxo por mês.',
    layer: 'domain',
    domainKey: 'finance',
    verticalKey: null,
    capabilities: [],
    permissions: [],
    emits: [],
    consumes: [],
  },
  {
    moduleId: 'ar',
    name: 'Contas a Receber',
    version: '0.1.0',
    summary: 'Os títulos a receber, com vencimento e baixa — o espelho consciente do a pagar.',
    layer: 'domain',
    domainKey: 'finance',
    verticalKey: null,
    capabilities: [],
    permissions: [],
    emits: [],
    consumes: [],
  },
  {
    moduleId: 'inv',
    name: 'Estoque',
    version: '0.1.0',
    summary: 'O livro de movimentos do físico; o saldo por item é consequência calculada.',
    layer: 'domain',
    domainKey: 'operations',
    verticalKey: null,
    capabilities: [],
    permissions: [],
    emits: [],
    consumes: [],
  },
  {
    moduleId: 'crm',
    name: 'Relacionamentos',
    version: '0.1.0',
    summary: 'As contrapartes e o histórico de contato — a base do comercial.',
    layer: 'domain',
    domainKey: 'crm',
    verticalKey: null,
    capabilities: [],
    permissions: [],
    emits: [],
    consumes: [],
  },
];

export function createPanelMockPort(): PanelPort {
  return {
    kind: 'mock',
    planCode: 'starter',

    async loadCourier(): Promise<CourierSummary> {
      return {
        veredito: 'OK',
        detalhe: 'O correio está entregando normalmente.',
        meusPendentes: 0,
        meusMortos: 0,
        meuAtrasoMin: 0,
      };
    },

    async loadPlanUsage(): Promise<PlanUsageRow[]> {
      return [
        { metric: 'ai-generations-per-month', limit: 500, used: 3, onExceed: 'block' },
        { metric: 'events-per-month', limit: 250000, used: 41, onExceed: 'meter' },
        { metric: 'modules', limit: 5, used: 2, onExceed: 'block' },
        { metric: 'seats', limit: 15, used: 1, onExceed: 'block' },
      ];
    },

    // ⭐ A trilha do demo — mistura realista para provar o COLAPSO (Mandato de
    // Beleza 2/6): dois fatos distintos e recentes + uma instalação EM LOTE de
    // cinco módulos na mesma rajada (colapsa em uma linha, expansível). Ordem
    // desc (o mais novo primeiro), como o banco entrega.
    async loadRecentAudit(): Promise<AuditRow[]> {
      const emLote = ['crm', 'inv', 'ar', 'cash', 'ops'].map((mid, i) => ({
        id: `a-inst-${mid}`,
        action: 'module.installed',
        resourceType: 'tenant_module',
        moduleId: mid,
        occurredAt: `${HOJE}T09:00:0${i}.000Z`,
        actorKind: 'user' as const,
      }));
      return [
        {
          id: 'a1',
          action: 'order.moved',
          resourceType: 'work_order',
          moduleId: 'ops',
          occurredAt: `${HOJE}T09:20:00.000Z`,
          actorKind: 'user',
        },
        {
          id: 'a2',
          action: 'order.opened',
          resourceType: 'work_order',
          moduleId: 'ops',
          occurredAt: `${HOJE}T09:12:00.000Z`,
          actorKind: 'user',
        },
        ...emLote,
      ];
    },

    async loadShelf(): Promise<ShelfItem[]> {
      return [
        ...buildShelf(CATALOGO, [
          { moduleId: 'ops', status: 'active', version: '0.1.0', installedAt: `${HOJE}T09:00:00.000Z` },
          { moduleId: 'cash', status: 'active', version: '0.1.0', installedAt: `${HOJE}T09:00:00.000Z` },
          { moduleId: 'ar', status: 'active', version: '0.1.0', installedAt: `${HOJE}T09:00:00.000Z` },
          { moduleId: 'inv', status: 'active', version: '0.1.0', installedAt: `${HOJE}T09:00:00.000Z` },
          { moduleId: 'crm', status: 'active', version: '0.1.0', installedAt: `${HOJE}T09:00:00.000Z` },
        ]),
      ];
    },

    // ⭐ A Visão Geral do demo — números MODESTOS (Lei 7 vale na vitrine). Só os
    // módulos que o demo instala têm cartão; `crm` sem 'estoque-critico' porque
    // o inv é que dá esse cartão. Nenhum zero fabricado: são dados de exemplo.
    // ⭐ Demo dos TRÊS comportamentos de estado-zero (Mandato de Beleza 4/6):
    // número real (caixa, clientes); zero de ausência-de-dado que vira TEXTO
    // (receita, contas vencendo); e zero de BOA notícia que mantém o número
    // (estoque crítico = 0). Mesma verdade, sem parecer produto quebrado.
    async loadOverview(): Promise<OverviewCard[]> {
      return [
        { key: 'caixa-disponivel', label: 'Caixa disponível', moduleId: 'cash', kind: 'currency', value: 1845000, currency: 'BRL', href: '/caixa', hint: 'Saldo do livro-caixa.', tone: 'neutral' },
        { key: 'receita-mes', label: 'Receita do mês', moduleId: 'cash', kind: 'currency', value: 0, currency: 'BRL', href: '/caixa', hint: 'Entradas do mês corrente.', tone: 'neutral', zeroText: 'sem entradas neste mês' },
        { key: 'contas-vencendo', label: 'Contas vencendo', moduleId: 'ar', kind: 'count', value: 0, href: '/contas-a-receber', hint: 'A receber, em aberto, até 7 dias.', tone: 'neutral', zeroText: 'nenhuma conta vencendo' },
        { key: 'estoque-critico', label: 'Estoque crítico', moduleId: 'inv', kind: 'count', value: 0, href: '/estoque', hint: 'Itens com saldo zerado ou negativo.', tone: 'neutral' },
        { key: 'clientes-ativos', label: 'Clientes ativos', moduleId: 'crm', kind: 'count', value: 12, href: '/relacionamentos', hint: 'Contrapartes ativas.', tone: 'neutral' },
      ];
    },

    // ⭐ A saúde dos módulos do demo — uma mistura realista de ativo/parado.
    // Números modestos, datas de exemplo (Lei 7 na vitrine).
    async loadModuleHealth(): Promise<ModuleHealth[]> {
      return [
        { moduleId: 'ops', lastActivityAt: `${HOJE}T09:12:00.000Z`, verdict: 'active' },
        { moduleId: 'cash', lastActivityAt: `${HOJE}T08:40:00.000Z`, verdict: 'active' },
        { moduleId: 'crm', lastActivityAt: `${HOJE}T07:55:00.000Z`, verdict: 'active' },
        { moduleId: 'ar', lastActivityAt: '2026-07-10T14:00:00.000Z', verdict: 'idle' },
        { moduleId: 'inv', lastActivityAt: null, verdict: 'idle' },
      ];
    },
  };
}
