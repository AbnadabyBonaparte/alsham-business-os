/**
 * O motor puro do Módulo 81 — Usinas (e Geração distribuída).
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; nunca decide se uma usina pode ser arquivada.
 *
 * O `ALLOWED_TRANSITIONS` é o espelho EXATO de `plant.allowed_transition()`
 * no `0096_plant.sql` (teste lê e compara). `active ↔ archived` é reversível:
 * a usina desativada que volta a operar é a MESMA usina (a física do
 * catalog/vendor/mall — o DIVERGE do hr, onde `terminated` é terminal).
 */
import type {
  NewPlantInput,
  Plant,
  PlantStatus,
  PlantSummary,
  Problem,
  Validation,
} from './types.ts';

/** ⭐ active ↔ archived (a física do catalog — a usina volta a operar). */
export const ALLOWED_TRANSITIONS: readonly (readonly [PlantStatus, PlantStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export const ALL_STATUSES: readonly PlantStatus[] = ['active', 'archived'];

export function canTransition(from: PlantStatus, to: PlantStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

/** Só a usina ativa pode ser arquivada (tirada de operação). */
export function canArchive(status: PlantStatus): boolean {
  return status === 'active';
}

/** Só a usina arquivada pode voltar a operar. */
export function canRestore(status: PlantStatus): boolean {
  return status === 'archived';
}

export function summarizePlants(plants: readonly Plant[]): PlantSummary {
  return {
    total: plants.length,
    active: plants.filter((p) => p.status === 'active').length,
    archived: plants.filter((p) => p.status === 'archived').length,
  };
}

const NAME_MAX = 200;
const LOCATION_MAX = 500;
const TYPE_MAX = 120;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma usina nova. O nome é obrigatório; a capacidade instalada tem de
 * ser um número finito ESTRITAMENTE positivo (o CHECK do banco confere
 * `capacity_kwp > 0` — a placa de uma usina real é positiva); a localização e o
 * tipo/porte são TEXTO LIVRE OPCIONAIS. Nasce com `id` vazio: a camada pura
 * nunca inventa dado do servidor, e sempre `active` (o nascimento é do gatilho).
 */
export function validateNewPlant(input: NewPlantInput): Validation<Plant> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome da usina.' });
  } else if (name.length > NAME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });
  }

  // Localização TEXTO LIVRE, opcional (vira '').
  const localBruto = texto(input.location);
  let location = '';
  if (localBruto !== null) {
    if (localBruto.length > LOCATION_MAX) {
      problems.push({ field: 'location', message: `Localização com no máximo ${LOCATION_MAX} caracteres.` });
    } else {
      location = localBruto;
    }
  }

  // Capacidade instalada: número finito, ESTRITAMENTE positivo.
  const cap = input.capacityKwp;
  if (typeof cap !== 'number' || !Number.isFinite(cap)) {
    problems.push({ field: 'capacityKwp', message: 'Informe a capacidade instalada em kWp (número).' });
  } else if (cap <= 0) {
    problems.push({ field: 'capacityKwp', message: 'A capacidade instalada deve ser maior que zero.' });
  }

  // Tipo/porte TEXTO LIVRE, opcional — a consolidação de GD (nunca enum).
  const tipoBruto = texto(input.plantType);
  let plantType = '';
  if (tipoBruto !== null) {
    if (tipoBruto.length > TYPE_MAX) {
      problems.push({ field: 'plantType', message: `Tipo com no máximo ${TYPE_MAX} caracteres.` });
    } else {
      plantType = tipoBruto;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      name: name!,
      location,
      capacityKwp: cap as number,
      plantType,
      status: 'active',
    },
  };
}
