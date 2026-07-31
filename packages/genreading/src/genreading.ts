/**
 * O motor puro do Módulo 83 — Monitoramento de Geração.
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `esg`, o `pcost`, o `timesheet`):
 * a leitura é fato consumado — nasce e nunca muda. Por isso este motor NÃO TEM
 * transições de ciclo de vida, NÃO TEM `ALLOWED_TRANSITIONS`, NÃO TEM
 * `canTransition`. A ausência é a lei: um teste lê o `0098_genreading.sql` e
 * confere que a migration também não declara `allowed_transition` e não tem
 * coluna de status.
 *
 * ⭐ O DIVERGE do `esg`: a USINA é OBRIGATÓRIA (`plantId` não-nulo) — não há
 * geração sem usina. E `generatedKwh >= 0` é o MANTIDO do `esg`: zero é leitura
 * real (à noite a usina gera zero), negativo é infísico.
 */
import {
  type GenerationReading,
  type NewReadingInput,
  type PlantGeneration,
  type Problem,
  type Validation,
} from './types.ts';

/** Do período mais recente ao mais antigo — a leitura do livro. Tiebreak por id. */
export function orderReadings(readings: readonly GenerationReading[]): readonly GenerationReading[] {
  return [...readings].sort((a, b) => {
    if (a.referenceOn !== b.referenceOn) return a.referenceOn < b.referenceOn ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Soma a geração POR USINA e conta as leituras de cada uma. As usinas saem em
 * ordem estável por `plantId`. Soma pura do livro — nada de chute.
 */
export function summarizeByPlant(readings: readonly GenerationReading[]): readonly PlantGeneration[] {
  const mapa = new Map<string, { plantId: string; totalKwh: number; readingCount: number }>();
  for (const r of readings) {
    const atual = mapa.get(r.plantId) ?? { plantId: r.plantId, totalKwh: 0, readingCount: 0 };
    atual.totalKwh += r.generatedKwh;
    atual.readingCount += 1;
    mapa.set(r.plantId, atual);
  }
  return [...mapa.values()].sort((a, b) => a.plantId.localeCompare(b.plantId));
}

const UNIT_MAX = 60;
const PLANT_NAME_MAX = 200;
const NOTE_MAX = 1000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNIT_PADRAO = 'kWh';

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Uma data ISO real (não só o formato: `2027-13-40` é recusada). */
function dataIso(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null || !DATA_RE.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === t ? t : null;
}

/**
 * Valida uma leitura nova. A usina (`plantId` obrigatória — o DIVERGE do esg), a
 * energia gerada (número finito `>= 0`), a unidade (texto livre não-vazio; `kWh`
 * quando ausente) e o período (data ISO real) são obrigatórios; o nome da usina
 * e a nota são OPCIONAIS. Nasce com `id` vazio: a pura camada nunca inventa dado
 * do servidor.
 */
export function validateNewReading(input: NewReadingInput): Validation<GenerationReading> {
  const problems: Problem[] = [];

  // ⭐ A usina por id solto — OBRIGATÓRIA (o DIVERGE do esg): não há geração
  // sem usina. Vínculo genérico (uuid texto), sem FK.
  const plantId = texto(input.plantId);
  if (plantId === null) {
    problems.push({ field: 'plantId', message: 'Informe a usina que gerou a energia.' });
  }

  // Nome da usina carimbado pela tela — opcional (vira '').
  const nomeBruto = texto(input.plantName);
  let plantName = '';
  if (nomeBruto !== null) {
    if (nomeBruto.length > PLANT_NAME_MAX) {
      problems.push({ field: 'plantName', message: `Nome com no máximo ${PLANT_NAME_MAX} caracteres.` });
    } else {
      plantName = nomeBruto;
    }
  }

  // ⭐ Energia gerada: número finito, >= 0. Zero é leitura real (à noite a usina
  // gera zero); negativo é infísico — o MANTIDO do esg.
  const g = input.generatedKwh;
  if (typeof g !== 'number' || !Number.isFinite(g)) {
    problems.push({ field: 'generatedKwh', message: 'Informe a energia gerada (número).' });
  } else if (g < 0) {
    problems.push({ field: 'generatedKwh', message: 'A energia gerada não pode ser negativa.' });
  }

  // Unidade: texto livre; quando ausente, assume kWh. Não-vazia; não longa.
  const unitBruta = texto(input.unit);
  let unit = UNIT_PADRAO;
  if (unitBruta !== null) {
    if (unitBruta.length > UNIT_MAX) {
      problems.push({ field: 'unit', message: `Unidade com no máximo ${UNIT_MAX} caracteres.` });
    } else {
      unit = unitBruta;
    }
  }

  // Período: obrigatório, data ISO real.
  let referenceOn: string | null = null;
  if (input.referenceOn === undefined || input.referenceOn === null || input.referenceOn === '') {
    problems.push({ field: 'referenceOn', message: 'Informe a data de referência da leitura.' });
  } else {
    const d = dataIso(input.referenceOn);
    if (d === null) problems.push({ field: 'referenceOn', message: 'A data deve estar no formato AAAA-MM-DD.' });
    else referenceOn = d;
  }

  // Nota opcional.
  const notaBruta = texto(input.note);
  let note = '';
  if (notaBruta !== null) {
    if (notaBruta.length > NOTE_MAX) {
      problems.push({ field: 'note', message: `Nota com no máximo ${NOTE_MAX} caracteres.` });
    } else {
      note = notaBruta;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      plantId: plantId!,
      plantName,
      generatedKwh: g as number,
      unit,
      referenceOn: referenceOn!,
      note,
    },
  };
}
