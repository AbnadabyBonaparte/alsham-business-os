import type {
  DunTitle,
  NewRulerStep,
  RulerStep,
  StepExecution,
} from './types.ts';

/**
 * O motor da régua — **puro**.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** a fila, a posição e o PRÓXIMO PASSO
 * moram aqui. A tela pergunta e desenha; ela nunca compara `dueDate < hoje`
 * nem decide qual passo está devido.
 */

/** O título está NA RÉGUA agora? Vencido e em aberto. */
export function isInQueue(title: DunTitle, today: string): boolean {
  return (
    (title.status === 'open' || title.status === 'partially_received') &&
    title.dueDate < today
  );
}

/** Dias de atraso — 0 se não venceu. Comparação civil, por data ISO. */
export function daysOverdue(title: DunTitle, today: string): number {
  if (title.dueDate >= today) return 0;
  const due = Date.parse(`${title.dueDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round((now - due) / 86400000));
}

/** Os passos da régua, na ordem — por posição, nunca por chegada. */
export function orderedSteps(steps: readonly RulerStep[]): readonly RulerStep[] {
  return [...steps].sort((a, b) => a.position - b.position);
}

/** Os passos DEVIDOS para este atraso: `daysAfterDue <= atraso`. */
export function dueSteps(
  steps: readonly RulerStep[],
  overdueDays: number,
): readonly RulerStep[] {
  return orderedSteps(steps).filter((s) => s.daysAfterDue <= overdueDays);
}

function executedStepIds(
  executions: readonly StepExecution[],
  titleId: string,
): ReadonlySet<string> {
  return new Set(
    executions
      .filter((e) => e.titleId === titleId && e.stepId !== null)
      .map((e) => e.stepId as string),
  );
}

/**
 * ⭐ **O QUE FAZER AGORA** — o primeiro passo devido e ainda não executado.
 * É a razão de existir do módulo: ele diz o que fazer e registra que foi
 * feito. `null` = nada devido, ou tudo já feito (a régua acabou para este
 * título — o resto é decisão fora dela: protesto, jurídico, perda).
 */
export function nextStep(
  title: DunTitle,
  steps: readonly RulerStep[],
  executions: readonly StepExecution[],
  today: string,
): RulerStep | null {
  if (!isInQueue(title, today)) return null;
  const feitos = executedStepIds(executions, title.id);
  return dueSteps(steps, daysOverdue(title, today)).find((s) => !feitos.has(s.id)) ?? null;
}

/**
 * A POSIÇÃO do título na régua: o último passo executado (pelo carimbo da
 * execução, que sobrevive ao redesenho), ou `null` se nenhum.
 */
export function positionOf(
  title: DunTitle,
  executions: readonly StepExecution[],
): StepExecution | null {
  const doTitulo = executions
    .filter((e) => e.titleId === title.id)
    .slice()
    .sort((a, b) => (a.executedAt < b.executedAt ? -1 : 1));
  return doTitulo.length > 0 ? doTitulo[doTitulo.length - 1]! : null;
}

/**
 * O erro de validação do desenho da régua, ou `null`.
 *
 * ⭐ Os dias são NÃO-DECRESCENTES ao longo das posições: um "3º aviso aos 5
 * dias" depois de um "2º aviso aos 15" faria a régua andar para trás no
 * calendário — o desenho diria uma ordem e o tempo diria outra.
 */
export function validateRulerSteps(steps: readonly NewRulerStep[]): string | null {
  if (steps.length === 0) {
    return 'A régua precisa de pelo menos um passo.';
  }
  for (const s of steps) {
    if (s.name.trim().length === 0) return 'Todo passo precisa de um nome.';
    if (!Number.isInteger(s.daysAfterDue) || s.daysAfterDue < 0) {
      return 'Os dias após o vencimento são um inteiro não negativo.';
    }
    if (s.channel != null && s.channel !== '' && s.channel.trim().length === 0) {
      return 'Canal em branco não existe: ou o passo tem canal, ou o campo fica vazio.';
    }
  }
  const nomes = steps.map((s) => s.name.trim().toLowerCase());
  if (new Set(nomes).size !== nomes.length) {
    return 'Dois passos com o mesmo nome na mesma régua só geram engano.';
  }
  const posicoes = steps.map((s) => s.position);
  if (new Set(posicoes).size !== posicoes.length) {
    return 'Dois passos não podem ocupar a mesma posição.';
  }
  const ordenados = [...steps].sort((a, b) => a.position - b.position);
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i]!.daysAfterDue < ordenados[i - 1]!.daysAfterDue) {
      return 'Os dias após o vencimento não podem diminuir ao longo da régua — o desenho diria uma ordem e o calendário diria outra.';
    }
  }
  return null;
}

/** O saldo em aberto do título. Nunca negativo na tela (a régua cobra o que falta). */
export function outstandingCentsOf(title: DunTitle): number {
  return Math.max(0, title.amountCents - title.receivedAmountCents);
}

/** Um resumo da fila. Contagem, nunca estimativa. */
export function summarizeQueue(
  titles: readonly DunTitle[],
  today: string,
): {
  readonly inQueue: number;
  readonly leftBehind: number;
  readonly outstandingCentsByCurrency: ReadonlyMap<string, number>;
} {
  const naFila = titles.filter((t) => isInQueue(t, today));
  const cents = new Map<string, number>();
  for (const t of naFila) {
    cents.set(t.currency, (cents.get(t.currency) ?? 0) + outstandingCentsOf(t));
  }
  return {
    inQueue: naFila.length,
    leftBehind: titles.filter((t) => t.leftAt !== null).length,
    outstandingCentsByCurrency: cents,
  };
}
