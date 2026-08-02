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

/**
 * ⭐ **Um cartão da Visão Geral — um número REAL do tenant, de um módulo que ele
 * instalou.** (Onda UX Viva.)
 *
 * A regra de Lei 7 mora no tipo: um cartão só existe para um módulo INSTALADO
 * (a leitura cruza cartões disponíveis × módulos do tenant, o padrão
 * `buildShelf`). Módulo não instalado ⇒ o cartão nem nasce — **nunca um zero
 * fabricado**. Módulo instalado com dado zero ⇒ o cartão mostra `0`, que é
 * verdade. Módulo instalado mas cuja leitura falhou ⇒ `value === null`, e a
 * tela diz "sem leitura" — jamais inventa "0" nem "OK".
 */
export interface OverviewCard {
  readonly key: string;
  readonly label: string;
  /** O módulo FONTE — precisa estar instalado no tenant para o cartão existir. */
  readonly moduleId: string;
  /** `currency` mostra centavos formatados; `count` mostra uma contagem. */
  readonly kind: 'currency' | 'count';
  /** O valor REAL. `null` = módulo instalado, mas a leitura falhou (degrada só este cartão). */
  readonly value: number | null;
  /** ISO 4217, quando `kind === 'currency'`. */
  readonly currency?: string;
  /** Uma linha de contexto curta. */
  readonly hint?: string;
  /** Link para a tela do módulo. */
  readonly href?: string;
  /** Realce de estado — nunca decorativo (vencendo/crítico). O ouro fica de fora. */
  readonly tone?: 'neutral' | 'warning' | 'danger';
  /**
   * ⭐ **Texto de estado-zero** (Mandato de Beleza 4/6) — a glosa a mostrar
   * QUANDO `value === 0` e o zero significa **ausência-de-dado** ("ainda sem
   * lançamento"), no lugar do número cru que parece produto quebrado.
   *
   * ⚠️ Quem decide é o ADAPTER, não a tela: só vem preenchido quando o zero é
   * ausência-de-dado. Onde o zero é **ausência-de-problema** (ex.: "0 itens com
   * saldo negativo" é boa notícia), fica `undefined` e a tela mostra o `0` —
   * o teste é o que o zero comunica.
   */
  readonly zeroText?: string;
}

/**
 * ⭐ A SAÚDE DE UM MÓDULO INSTALADO (Onda UX Viva) — objetiva, nunca decorativa.
 *
 * Lei 7 no critério: o veredito sai de dado REAL da trilha do tenant, não de
 * enfeite. `active` = houve atividade na trilha nos últimos 7 dias; `idle` =
 * instalado, mas sem atividade recente (parado). O vermelho (erro real de
 * handler / carta morta por módulo) fica DECLARADO mas não é mostrado sem sinal
 * real — forjar um 🔴 seria decorar, o oposto de honesto.
 */
export interface ModuleHealth {
  readonly moduleId: string;
  /** ISO do último fato deste módulo na trilha, ou `null` se não há atividade recente. */
  readonly lastActivityAt: string | null;
  readonly verdict: 'active' | 'idle';
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
  /**
   * ⭐ Os cartões da Visão Geral — só dos módulos INSTALADOS, cada leitura
   * ISOLADA (uma view que muda de formato degrada só o próprio cartão, nunca
   * derruba os outros nem a página). Módulo não instalado ⇒ sem cartão.
   */
  loadOverview(): Promise<OverviewCard[]>;
  /**
   * ⭐ A saúde de cada módulo instalado — última atividade real (da trilha) e o
   * veredito objetivo. Uma leitura só, tenant-scoped sob RLS.
   */
  loadModuleHealth(): Promise<ModuleHealth[]>;
  readonly planCode: string;
}
