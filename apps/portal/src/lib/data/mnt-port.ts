import type { MaintenanceOrder, MntPriority } from '@alsham/maintenance';

export interface MntOrderRow extends MaintenanceOrder {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 17 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: escrever na trilha (ela é do gatilho), apagar
 * ordem (cancelar é status) e gerar ordem automática (a fila é honesta;
 * quem abre é gente). A porta não promete o que o schema nega.
 */
export interface MntPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadOrders(): Promise<MntOrderRow[]>;
  loadPriorities(): Promise<MntPriority[]>;
  createOrder(input: {
    title: string;
    description: string;
    kind: MaintenanceOrder['kind'];
    target: string;
    priorityId: string | null;
    recurrenceDays: number | null;
  }): Promise<{ orderId: string }>;
  setStatus(input: {
    orderId: string;
    status: MaintenanceOrder['status'];
    completionNote?: string;
    costCents?: number | null;
    currency?: string | null;
  }): Promise<void>;
  createPriority(input: { name: string; position: number }): Promise<void>;
}
