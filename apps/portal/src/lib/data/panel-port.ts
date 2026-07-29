import type { ShelfItem } from '@alsham/permissions';

/** A saúde do correio COMO O TENANT PODE VÊ-LA. Nunca a fila do vizinho. */
export interface CourierSummary {
  readonly veredito: 'OK' | 'ATRASADO' | 'PARADO' | 'ATENCAO';
  readonly detalhe: string;
  readonly meusPendentes: number;
  readonly meusMortos: number;
  readonly meuAtrasoMin: number;
}

/** Uma métrica do plano, com o teto e o consumo do mês. Contado, nunca estimado. */
export interface PlanUsageRow {
  readonly metric: string;
  /** `null` = ilimitado no plano. */
  readonly limit: number | null;
  readonly used: number;
  readonly onExceed: 'block' | 'meter';
}

/** Uma linha da trilha DO TENANT. */
export interface AuditRow {
  readonly id: string;
  readonly action: string;
  readonly resourceType: string;
  readonly moduleId: string | null;
  readonly occurredAt: string;
  readonly actorKind: 'user' | 'agent' | 'system';
}

/**
 * A PORTA DO PAINEL — **Core, não módulo.**
 *
 * ⭐ Ela não ganha "porta própria de módulo" porque o Painel não é módulo: ele
 * é a home da plataforma. Desinstalar qualquer módulo não pode apagá-la.
 *
 * ⛔ E repare no que ela **não** tem: nenhum método que escreva. O Painel LÊ.
 */
export interface PanelPort {
  readonly kind: 'mock' | 'supabase';
  loadCourier(): Promise<CourierSummary | null>;
  loadPlanUsage(): Promise<PlanUsageRow[]>;
  loadRecentAudit(): Promise<AuditRow[]>;
  /** Os módulos do catálogo cruzados com o que este tenant instalou. */
  loadShelf(): Promise<ShelfItem[]>;
  readonly planCode: string;
}
