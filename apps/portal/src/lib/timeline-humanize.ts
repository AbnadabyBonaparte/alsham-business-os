/**
 * ⭐ Humaniza uma linha da trilha (Onda UX Viva) — SEM inventar.
 *
 * A trilha guarda `action` no formato `<agregado>.<fato>` ou
 * `<módulo>.<agregado>.<fato>` (ex.: `ops.card.moved`, `module.installed`).
 * Esta função traduz o VERBO (o último segmento) para uma frase curta em
 * português E escolhe uma categoria de ícone. Lei 7: quando o verbo é
 * desconhecido, ela NÃO inventa — devolve o próprio `action` como frase e a
 * categoria neutra. A `action` crua continua visível na tela ao lado da glosa,
 * então nada se perde nem se maquia.
 */

/** As categorias de ícone da timeline — cada uma vira um SVG de traço. */
export type TimelineIcon =
  | 'created'
  | 'updated'
  | 'done'
  | 'closed'
  | 'reopened'
  | 'decided'
  | 'moved'
  | 'removed'
  | 'neutral';

export interface HumanEvent {
  /** A frase curta em pt-BR (glosa do verbo). */
  readonly phrase: string;
  /** A categoria de ícone. */
  readonly icon: TimelineIcon;
}

/**
 * O mapa do VERBO (último segmento da `action`) → frase + ícone. Verbos no
 * passado (o padrão do outbox) e alguns sinônimos de domínio. É a única fonte
 * de "tradução"; o que não está aqui cai no fallback honesto.
 */
const VERBO: Record<string, HumanEvent> = {
  // nascimentos / registros
  registered: { phrase: 'registrado', icon: 'created' },
  created: { phrase: 'criado', icon: 'created' },
  opened: { phrase: 'aberto', icon: 'created' },
  recorded: { phrase: 'lançado', icon: 'created' },
  installed: { phrase: 'instalado', icon: 'created' },
  earned: { phrase: 'creditado', icon: 'created' },
  generated: { phrase: 'gerado', icon: 'created' },
  // atualizações
  updated: { phrase: 'atualizado', icon: 'updated' },
  changed: { phrase: 'alterado', icon: 'updated' },
  // conclusões
  completed: { phrase: 'concluído', icon: 'done' },
  settled: { phrase: 'liquidado', icon: 'done' },
  received: { phrase: 'recebido', icon: 'done' },
  matched: { phrase: 'conciliado', icon: 'done' },
  attended: { phrase: 'atendido', icon: 'done' },
  verified: { phrase: 'verificado', icon: 'done' },
  // decisões
  decided: { phrase: 'decidido', icon: 'decided' },
  approved: { phrase: 'aprovado', icon: 'decided' },
  awarded: { phrase: 'premiado', icon: 'decided' },
  // encerramentos / arquivamentos
  archived: { phrase: 'arquivado', icon: 'closed' },
  cancelled: { phrase: 'cancelado', icon: 'closed' },
  closed: { phrase: 'encerrado', icon: 'closed' },
  discarded: { phrase: 'descartado', icon: 'closed' },
  rejected: { phrase: 'recusado', icon: 'closed' },
  lost: { phrase: 'perdido', icon: 'closed' },
  retired: { phrase: 'baixado', icon: 'closed' },
  // reaberturas
  reopened: { phrase: 'reaberto', icon: 'reopened' },
  reactivated: { phrase: 'reativado', icon: 'reopened' },
  // movimento
  moved: { phrase: 'avançou de etapa', icon: 'moved' },
  // consumos / remoções
  consumed: { phrase: 'consumido', icon: 'removed' },
  redeemed: { phrase: 'resgatado', icon: 'removed' },
  uninstalled: { phrase: 'desinstalado', icon: 'removed' },
  // faltas
  no_show: { phrase: 'faltou', icon: 'removed' },
};

/** Extrai o último segmento da `action` (o verbo/fato). */
function verboDe(action: string): string {
  const partes = action.split('.');
  return partes[partes.length - 1] ?? action;
}

/**
 * Traduz uma linha da trilha. Nunca inventa: verbo desconhecido devolve o
 * próprio `action` como frase e ícone neutro.
 */
export function humanizeAction(action: string): HumanEvent {
  const v = verboDe(action);
  return VERBO[v] ?? { phrase: action, icon: 'neutral' };
}
