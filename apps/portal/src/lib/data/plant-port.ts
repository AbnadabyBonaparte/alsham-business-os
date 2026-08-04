/**
 * Porta de dados do Módulo 81 — Usinas (`plant`, Vertical Energia) — própria
 * (Lei do Lego §5.5.8). Read-only: esta tela é uma âncora de leitura.
 *
 * Repare no que NÃO existe: nenhum método `criar`, `arquivar` ou `mudar
 * estado`. A porta só carrega — a escrita da usina vem numa frente própria.
 * E `loadRecentReadings` lê a geração recente (`genreading`), que é OUTRO
 * módulo/schema: aqui só se apresenta, nunca se cruza por FK.
 */
export interface PlantRow {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly capacityKwp: number;
  readonly plantType: string;
  readonly status: string;
}

export interface GenReadingRow {
  readonly id: string;
  readonly plantName: string;
  readonly generatedKwh: number;
  readonly unit: string;
  readonly referenceOn: string;
}

export interface PlantPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadPlants(): Promise<PlantRow[]>;
  loadRecentReadings(): Promise<GenReadingRow[]>;
}
