import { buildShelf } from '@alsham/permissions';
import type { CatalogEntry, ShelfItem } from '@alsham/permissions';

import type { AuditRow, CourierSummary, PanelPort, PlanUsageRow } from './panel-port';

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

    async loadRecentAudit(): Promise<AuditRow[]> {
      return [
        {
          id: 'a1',
          action: 'module.installed',
          resourceType: 'tenant_module',
          moduleId: 'ops',
          occurredAt: `${HOJE}T09:00:00.000Z`,
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
      ];
    },

    async loadShelf(): Promise<ShelfItem[]> {
      return [
        ...buildShelf(CATALOGO, [
          { moduleId: 'ops', status: 'active', version: '0.1.0', installedAt: `${HOJE}T09:00:00.000Z` },
        ]),
      ];
    },
  };
}
