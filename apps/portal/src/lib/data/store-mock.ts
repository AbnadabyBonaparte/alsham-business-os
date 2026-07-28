import type { CatalogEntry, TenantModuleRow } from '@alsham/permissions';

import { DataPortError } from './port';
import type { StorePort } from './store-port';

/**
 * Adapter MOCKADO da Store — a vitrine se prova sem banco no ar.
 *
 * ⚠️ Os dois módulos aqui são os dois módulos REAIS da plataforma, transcritos
 * dos manifestos. Não é dado fabricado de cliente: é o catálogo, que é o mesmo
 * para todo tenant. Nenhum nome de empresa, segmento ou praça — a Store é
 * genérica por lei (anti-viés).
 */

const CATALOGO: CatalogEntry[] = [
  {
    moduleId: 'recon',
    name: 'Conciliação & Aprovações',
    version: '0.1.0',
    summary:
      'Importa o extrato, sugere as baixas, e põe cada divergência numa fila com visto e trilha.',
    layer: 'domain',
    domainKey: 'finance',
    verticalKey: null,
    capabilities: [
      { key: 'bank-reconciliation', canonicalName: 'Conciliação bancária' },
      { key: 'financial-approvals', canonicalName: 'Aprovações financeiras' },
    ],
    permissions: [
      { key: 'recon.statement.import', description: 'Importar extratos bancários e títulos a pagar.' },
      { key: 'recon.match.manage', description: 'Criar, ajustar e desfazer casamentos.' },
      { key: 'recon.approval.decide', description: 'Aprovar ou rejeitar itens da fila.' },
    ],
    emits: [
      { type: 'recon.reconciliation.completed', description: 'Um extrato foi fechado.' },
      { type: 'recon.approval.decided', description: 'Um humano visou um item da fila.' },
      { type: 'recon.statement.discarded', description: 'Um extrato foi descartado.' },
    ],
    consumes: [],
  },
  {
    moduleId: 'marketing',
    name: 'Campanhas de Marketing',
    version: '0.1.0',
    summary:
      'Planeja, agenda, publica e mede campanhas — e fica sabendo da verba aprovada sem ninguém precisar avisar.',
    layer: 'domain',
    domainKey: 'marketing',
    verticalKey: null,
    capabilities: [{ key: 'campaigns', canonicalName: 'Campanhas' }],
    permissions: [
      { key: 'marketing.campaign.manage', description: 'Criar e editar campanhas, peças e agendamento.' },
      { key: 'marketing.campaign.publish', description: 'Pôr campanha no ar, encerrar e cancelar.' },
      { key: 'marketing.result.record', description: 'Registrar o resultado medido de uma campanha.' },
    ],
    emits: [
      { type: 'marketing.campaign.published', description: 'Uma campanha entrou no ar.' },
      { type: 'marketing.campaign.completed', description: 'Uma campanha foi encerrada.' },
      { type: 'marketing.campaign.cancelled', description: 'Uma campanha foi cancelada.' },
    ],
    consumes: [
      {
        type: 'recon.approval.decided',
        description: 'Uma decisão financeira foi visada. A campanha correspondente fica sabendo.',
      },
    ],
  },
];

export function createStoreMockPort(): StorePort {
  // Em memória, some a cada requisição — é demonstração, não banco.
  const instalados: TenantModuleRow[] = [
    { moduleId: 'recon', status: 'active', version: '0.1.0', installedAt: '2026-07-28T00:00:00.000Z' },
  ];

  return {
    kind: 'mock',
    async loadCatalog() {
      return CATALOGO;
    },
    async loadTenantModules() {
      return instalados;
    },
    async listCorePermissions() {
      return new Set(['core.module.install']);
    },
    async loadTenantRoles() {
      return [{ key: 'operacao', name: 'Operação' }];
    },
    async loadModuleLimit() {
      return 5;
    },
    async install({ moduleId, roleKey }) {
      if (!roleKey) throw new DataPortError('Escolha o papel que vai receber as permissões.');
      const existente = instalados.find((i) => i.moduleId === moduleId);
      if (existente) {
        instalados[instalados.indexOf(existente)] = { ...existente, status: 'active' };
        return;
      }
      instalados.push({
        moduleId,
        status: 'active',
        version: '0.1.0',
        installedAt: '2026-07-28T00:00:00.000Z',
      });
    },
    async uninstall({ moduleId }) {
      const i = instalados.findIndex((x) => x.moduleId === moduleId);
      if (i < 0) throw new DataPortError('Este módulo não está instalado.');
      // Espelha o banco: vira `uninstalled`, a linha NÃO some.
      instalados[i] = { ...instalados[i]!, status: 'uninstalled' };
    },
  };
}
