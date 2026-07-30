/**
 * `@alsham/dre` — Módulo 32, DRE Gerencial.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é o ciclo de vida da linha (volta do arquivo), o cálculo do resultado a
 * partir das linhas, e como os fatos de dois livros alheios viram projeção
 * local. Quem grava é o schema `dre`; quem entrega os fatos é o correio.
 *
 * ⭐⭐ Este é o SEXTO consumidor do repositório e o primeiro com DOIS
 * produtores: escuta `cash.entry.registered` e `cc.rateio.executed` sem
 * importar nenhum dos dois módulos — o acoplamento é com o TIPO do evento, e a
 * origem vem de `envelope.producedBy`. Há guarda no CI para as três formas de
 * trair isso.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  canArchive,
  canRestore,
  LINE_KINDS,
  orderLines,
  computeResult,
  validateNewLine,
} from './dre.ts';

export type { NewLineInput } from './dre.ts';

export {
  CONSUMED_EVENT_TYPES,
  CASH_CONSUMED_EVENT_PATTERN,
  CC_CONSUMED_EVENT_PATTERN,
  CONSUMER_ID,
  toDreEntry,
  handleDreEntry,
} from './realized.ts';

export type { DreEntry, EntryTranslation, DreEntryPort, EntryHandledOutcome } from './realized.ts';

export type {
  LineStatus,
  LineKind,
  DreLine,
  StatementRow,
  DreResult,
  Problem,
  Validation,
} from './types.ts';
