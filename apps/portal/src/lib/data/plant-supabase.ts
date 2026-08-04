import type { SupabaseClient } from '@supabase/supabase-js';

import { DataPortError } from './port';
import type { GenReadingRow, PlantPort, PlantRow } from './plant-port';

// ⚠️ Dois schemas distintos: a usina vive em `plant`; a leitura de geração,
// em `genreading` (o Módulo 83). A porta apenas apresenta os dois lado a lado.
const PLANT = 'plant';
const GENREADING = 'genreading';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface PlantDb {
  id: string;
  name: string;
  location: string | null;
  capacity_kwp: number;
  plant_type: string | null;
  status: string;
}

interface ReadingDb {
  id: string;
  plant_name: string | null;
  generated_kwh: number;
  unit: string | null;
  reference_on: string;
}

export function createPlantSupabasePort(db: SupabaseClient, tenantId: string): PlantPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'plant.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadPlants() {
      const { data, error } = await db
        .schema(PLANT)
        .from('plants')
        .select('id, name, location, capacity_kwp, plant_type, status')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });
      if (error) fail('carregar o parque de usinas', error);
      return ((data ?? []) as PlantDb[]).map(
        (p): PlantRow => ({
          id: p.id,
          name: p.name,
          location: p.location ?? '',
          capacityKwp: Number(p.capacity_kwp),
          plantType: p.plant_type ?? '',
          status: p.status,
        }),
      );
    },

    async loadRecentReadings() {
      const { data, error } = await db
        .schema(GENREADING)
        .from('readings')
        .select('id, plant_name, generated_kwh, unit, reference_on')
        .eq('tenant_id', tenantId)
        .order('reference_on', { ascending: false })
        .limit(10);
      if (error) fail('carregar a geração recente', error);
      return ((data ?? []) as ReadingDb[]).map(
        (r): GenReadingRow => ({
          id: r.id,
          plantName: r.plant_name ?? '',
          generatedKwh: Number(r.generated_kwh),
          unit: r.unit ?? '',
          referenceOn: r.reference_on,
        }),
      );
    },
  };
}
