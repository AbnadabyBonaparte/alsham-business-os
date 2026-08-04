import type { GenReadingRow, PlantPort, PlantRow } from './plant-port';

const dia = (delta: number) => new Date(Date.now() + delta * 86400000).toISOString().slice(0, 10);

const plants: PlantRow[] = [
  {
    id: 'mock-plant-1',
    name: 'Usina Solar Cerrado I',
    location: 'Paracatu/MG',
    capacityKwp: 1200,
    plantType: 'solo',
    status: 'active',
  },
  {
    id: 'mock-plant-2',
    name: 'Geração Telhado Sede',
    location: 'Uberlândia/MG',
    capacityKwp: 84,
    plantType: 'telhado',
    status: 'active',
  },
  {
    id: 'mock-plant-3',
    name: 'Usina Solar Vale Antigo',
    location: 'Montes Claros/MG',
    capacityKwp: 640,
    plantType: 'solo',
    status: 'archived',
  },
];

const readings: GenReadingRow[] = [
  {
    id: 'mock-read-1',
    plantName: 'Usina Solar Cerrado I',
    generatedKwh: 5820,
    unit: 'kWh',
    referenceOn: dia(-1),
  },
  {
    id: 'mock-read-2',
    plantName: 'Geração Telhado Sede',
    generatedKwh: 412,
    unit: 'kWh',
    referenceOn: dia(-1),
  },
  {
    id: 'mock-read-3',
    plantName: 'Usina Solar Cerrado I',
    generatedKwh: 5610,
    unit: 'kWh',
    referenceOn: dia(-2),
  },
  {
    id: 'mock-read-4',
    plantName: 'Geração Telhado Sede',
    generatedKwh: 398,
    unit: 'kWh',
    referenceOn: dia(-2),
  },
  {
    id: 'mock-read-5',
    plantName: 'Usina Solar Cerrado I',
    generatedKwh: 5975,
    unit: 'kWh',
    referenceOn: dia(-3),
  },
  {
    id: 'mock-read-6',
    plantName: 'Geração Telhado Sede',
    generatedKwh: 431,
    unit: 'kWh',
    referenceOn: dia(-3),
  },
];

export function createPlantMockPort(): PlantPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['plant.plant.manage', 'plant.plant.decide']);
    },

    async loadPlants() {
      return [...plants];
    },

    async loadRecentReadings() {
      return [...readings];
    },
  };
}
