import Link from 'next/link';

import { buildBoard, isOverdue, orderedStages } from '@alsham/ops';
import type { PipelineStage, WorkOrder } from '@alsham/ops';

import { Badge, EmptyState, Panel } from '@/components/states';
import { shortDate } from '@/lib/format';

/**
 * ⭐ **O QUADRO — e as colunas são as ETAPAS DO TENANT.**
 *
 * Repare na direção: não existe um quadro de colunas fixas com as etapas
 * encaixadas dentro. É o inverso — `buildBoard()` recebe as etapas que a
 * empresa desenhou e devolve uma coluna para cada uma, na ordem dela. Uma
 * agência vê seis colunas; uma equipe de manutenção vê três; e nenhuma das duas
 * viu uma coluna que não pediu.
 *
 * ⚠️ **A tela não decide nada.** As colunas, a alocação e o atraso vêm de
 * `@alsham/ops`. Se alguém escrever `orders.filter(o => o.currentStageId ===
 * stage.id)` aqui, a regra "OS concluída não entra em coluna nenhuma" passa a
 * existir em dois lugares — e o segundo vai esquecê-la, empilhando para sempre
 * na última coluna tudo o que já foi entregue.
 */
export function PipelineBoard({
  pipelineName,
  stages,
  orders,
  today,
}: {
  pipelineName: string;
  stages: readonly PipelineStage[];
  orders: readonly WorkOrder[];
  /** `AAAA-MM-DD`, resolvido UMA vez na página. Componente não lê relógio. */
  today: string;
}) {
  if (stages.length === 0) {
    return (
      <EmptyState
        title={`A esteira "${pipelineName}" não tem etapas`}
        hint="Desenhe as etapas em Esteiras. Sem etapa, a esteira não aceita ordem de serviço."
      />
    );
  }

  const colunas = buildBoard(stages, orders);
  const naEsteira = colunas.reduce((n, c) => n + c.orders.length, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-bos-text">{pipelineName}</h2>
        <Badge tone={naEsteira > 0 ? 'info' : 'neutral'}>{naEsteira} na esteira</Badge>
      </div>

      {/* Rolagem horizontal própria: um quadro com dez etapas não pode fazer a
          página inteira rolar de lado. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex min-w-max gap-3">
          {colunas.map(({ stage, orders: doStage }) => (
            <Panel key={stage.id} className="w-72 shrink-0 px-4 py-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-sm text-bos-text">{stage.name}</h3>
                <span className="font-mono text-[11px] text-bos-muted">{doStage.length}</span>
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {stage.requiresApproval ? (
                  <span className="text-[10px] text-bos-accent">exige aprovação</span>
                ) : null}
                {stage.skippable ? (
                  <span className="text-[10px] text-bos-muted">pulável</span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {doStage.length === 0 ? (
                  <p className="rounded-md border border-dashed border-bos-border px-3 py-6 text-center text-[11px] text-bos-muted">
                    nada aqui
                  </p>
                ) : (
                  doStage.map((os) => (
                    <Link
                      key={os.id}
                      href={`/esteira/${os.id}`}
                      className="block rounded-md border border-bos-border bg-bos-bg px-3 py-2 transition-colors hover:border-bos-accent/50"
                    >
                      <p className="text-sm text-bos-text">{os.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-bos-muted">
                        {os.dueDate ? <span>vence {shortDate(os.dueDate)}</span> : <span>sem prazo</span>}
                        {isOverdue(os, today) ? (
                          <span className="text-bos-danger">vencida</span>
                        ) : null}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </Panel>
          ))}
        </div>
      </div>

      {/* As etapas em sequência, para quem lê o desenho e não o quadro. */}
      <p className="text-[11px] text-bos-muted">
        {orderedStages(stages).map((s) => s.name).join(' → ')}
      </p>
    </div>
  );
}

/**
 * As OS que saíram da esteira. Elas **não** aparecem em coluna nenhuma — não
 * estão em etapa alguma —, e some-las da tela faria o operador achar que a OS
 * desapareceu. Ficam aqui, embaixo, com o estado em voz alta.
 */
export function FinishedOrders({ orders }: { orders: readonly WorkOrder[] }) {
  const fora = orders.filter((o) => o.status === 'done' || o.status === 'cancelled');
  if (fora.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="font-display text-sm text-bos-text">Fora da esteira</h3>
      <p className="mt-1 text-xs text-bos-muted">
        Concluídas e canceladas não ocupam coluna: elas não estão em etapa nenhuma. Continuam aqui e
        continuam no banco, com a trilha inteira — cancelar é estado, nunca apagar.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {fora.map((os) => (
          <Link
            key={os.id}
            href={`/esteira/${os.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-bos-border bg-bos-surface px-4 py-2.5 transition-colors hover:border-bos-accent/50"
          >
            <span className="text-sm text-bos-text">{os.title}</span>
            <Badge tone={os.status === 'done' ? 'success' : 'neutral'}>
              {os.status === 'done' ? 'concluída' : 'cancelada'}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
