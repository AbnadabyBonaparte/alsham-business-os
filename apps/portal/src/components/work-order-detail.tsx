'use client';

import { useState, useTransition } from 'react';

import {
  canCancel,
  canComplete,
  latestDeliverables,
  nextStage,
  nextVersion,
  stagesBefore,
  whyCannotAdvance,
  whyCannotSkip,
} from '@alsham/ops';
import type {
  Deliverable,
  MovementKind,
  OrderMovement,
  PipelineStage,
  WorkOrder,
} from '@alsham/ops';

import {
  advanceOrder,
  changeOrderStatus,
  registerDeliverable,
  sendBackOrder,
  skipStage,
} from '@/app/ops-actions';
import { Badge, EmptyState, Panel } from '@/components/states';
import { stamp } from '@/lib/format';

/**
 * O INTERIOR DA OS — trilha, entregáveis e os cinco atos.
 *
 * ⭐ **Nada aqui decide.** Qual é a próxima etapa, se dá para pular, para onde
 * se pode devolver e qual é a próxima versão vêm todos de `@alsham/ops`. Este
 * arquivo desenha e coleta o clique.
 *
 * ⭐ **Os quatro atos destrutivos ou irreversíveis têm confirmação em dois
 * passos** (padrão CRIVO): pular, devolver, concluir e cancelar. Avançar não —
 * avançar é o caminho normal do trabalho, e pedir confirmação a cada passo
 * ensina o operador a clicar em "sim" sem ler.
 */

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const ROTULO_MOVIMENTO: Record<MovementKind, string> = {
  opened: 'aberta',
  advanced: 'avançou',
  skipped: 'etapa pulada',
  'sent-back': 'devolvida para refazer',
  completed: 'concluída',
  cancelled: 'cancelada',
  'deliverable-registered': 'entregável registrado',
};

const TOM_MOVIMENTO: Record<MovementKind, Tone> = {
  opened: 'info',
  advanced: 'info',
  skipped: 'warning',
  'sent-back': 'warning',
  completed: 'success',
  cancelled: 'neutral',
  'deliverable-registered': 'neutral',
};

export function WorkOrderDetail({
  order,
  stages,
  movements,
  deliverables,
  canManage,
  canDecide,
}: {
  order: WorkOrder;
  stages: readonly PipelineStage[];
  movements: readonly OrderMovement[];
  deliverables: readonly Deliverable[];
  canManage: boolean;
  canDecide: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Acoes
        order={order}
        stages={stages}
        canManage={canManage}
        canDecide={canDecide}
      />
      <Entregaveis
        order={order}
        deliverables={deliverables}
        canManage={canManage}
      />
      <Trilha movements={movements} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function Acoes({
  order,
  stages,
  canManage,
  canDecide,
}: {
  order: WorkOrder;
  stages: readonly PipelineStage[];
  canManage: boolean;
  canDecide: boolean;
}) {
  const etapaAtual = stages.find((s) => s.id === order.currentStageId);
  const proxima = nextStage(stages, order.currentStageId);
  const anteriores = stagesBefore(stages, order.currentStageId);

  const naoAvanca = whyCannotAdvance(order, stages);
  const naoPula = whyCannotSkip(order, stages);

  // ⭐ A permissão de avançar depende do DESENHO da etapa, não do nome dela.
  const precisaDecidirParaAvancar = etapaAtual?.requiresApproval === true;
  const podeAvancar =
    naoAvanca === null && (precisaDecidirParaAvancar ? canDecide : canManage);

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">O que fazer agora</h2>

      {etapaAtual ? (
        <p className="mt-1 text-sm text-bos-muted">
          A OS está em <strong className="text-bos-text">{etapaAtual.name}</strong>
          {proxima ? (
            <>
              {' '}
              e a próxima etapa é <strong className="text-bos-text">{proxima.name}</strong>.
            </>
          ) : (
            <> — a última etapa desta esteira. Daqui ela se conclui.</>
          )}
          {precisaDecidirParaAvancar ? (
            <>
              {' '}
              Esta etapa foi desenhada para <strong className="text-bos-text">exigir aprovação</strong>.
            </>
          ) : null}
        </p>
      ) : (
        <p className="mt-1 text-sm text-bos-muted">
          Esta OS saiu da esteira. Ela não está em etapa nenhuma.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {naoAvanca === null ? (
          <BotaoAvancar orderId={order.id} podeAvancar={podeAvancar} proximaNome={proxima?.name ?? ''} precisaDecidir={precisaDecidirParaAvancar} />
        ) : null}

        {naoPula === null && canDecide ? (
          <BotaoPular orderId={order.id} etapaNome={etapaAtual?.name ?? ''} proximaNome={proxima?.name ?? ''} />
        ) : null}

        {anteriores.length > 0 && canDecide && order.status !== 'cancelled' ? (
          <BotaoDevolver orderId={order.id} anteriores={anteriores} concluida={order.status === 'done'} />
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-bos-border pt-4">
          {canComplete(order.status) ? (
            <BotaoFinalizar
              orderId={order.id}
              alvo="done"
              rotulo="Concluir OS"
              habilitado={canDecide}
              aviso="A OS sai da esteira e o Core registra ops.order.completed. Ela pode voltar depois, por uma devolução — trabalho tem identidade por serviço."
            />
          ) : null}

          {canCancel(order.status) ? (
            <BotaoFinalizar
              orderId={order.id}
              alvo="cancelled"
              rotulo="Cancelar OS"
              habilitado={canDecide}
              perigoso
              aviso="A OS passa a cancelada e o Core registra ops.order.cancelled. Ela NÃO é apagada: continua na lista, no banco e na trilha. Cancelado não volta — retomar é OS nova."
            />
          ) : null}

          {!canDecide ? (
            <span className="text-xs text-bos-muted">
              Decidir (aprovar, pular, devolver, concluir, cancelar) exige{' '}
              <code className="font-mono">ops.order.decide</code>.
            </span>
          ) : null}
        </div>

        {naoAvanca !== null && naoPula !== null ? (
          <p className="text-xs text-bos-muted">{naoAvanca}</p>
        ) : null}
      </div>
    </Panel>
  );
}

function BotaoAvancar({
  orderId,
  podeAvancar,
  proximaNome,
  precisaDecidir,
}: {
  orderId: string;
  podeAvancar: boolean;
  proximaNome: string;
  precisaDecidir: boolean;
}) {
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!podeAvancar) {
    return (
      <p className="text-xs text-bos-muted">
        {precisaDecidir
          ? `Passar de uma etapa que exige aprovação requer ops.order.decide.`
          : `Mover a OS requer ops.order.manage.`}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="block">
        <span className="text-xs text-bos-muted">Anotação deste passo (opcional)</span>
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="mt-1 w-full max-w-2xl rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
        />
      </label>
      {erro ? (
        <p role="alert" className="text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErro(null);
          startTransition(async () => {
            const r = await advanceOrder({ orderId, note: nota });
            if (!r.ok) setErro(r.message);
            else setNota('');
          });
        }}
        className="w-fit rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text transition-colors hover:bg-bos-accent/25 disabled:opacity-40"
      >
        {pending ? 'Avançando…' : `Avançar para ${proximaNome}`}
      </button>
    </div>
  );
}

/**
 * ⭐ **PULAR — e a razão é obrigatória, com confirmação em dois passos.**
 *
 * O campo de razão não é decoração: uma etapa pulada sem motivo é
 * indistinguível de uma etapa cumprida, e é exatamente essa distinção que a
 * trilha existe para guardar.
 */
function BotaoPular({
  orderId,
  etapaNome,
  proximaNome,
}: {
  orderId: string;
  etapaNome: string;
  proximaNome: string;
}) {
  const [armado, setArmado] = useState(false);
  const [razao, setRazao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!armado) {
    return (
      <button
        type="button"
        onClick={() => setArmado(true)}
        className="w-fit rounded-md border border-bos-warning/50 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-warning/15"
      >
        Pular a etapa {etapaNome}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-bos-warning/40 bg-bos-warning/5 px-4 py-3">
      <p className="max-w-2xl text-xs text-bos-muted">
        A OS vai direto para <strong className="text-bos-text">{proximaNome}</strong>. A etapa{' '}
        <strong className="text-bos-text">{etapaNome}</strong> não é apagada da história:{' '}
        <strong className="text-bos-text">fica registrado que ela foi pulada</strong>, por quem,
        quando e por quê.
      </p>
      <label className="block">
        <span className="text-xs text-bos-muted">Por que esta etapa não se aplica? (obrigatório)</span>
        <input
          type="text"
          value={razao}
          onChange={(e) => setRazao(e.target.value)}
          placeholder="este trabalho não tem briefing do cliente"
          className="mt-1 w-full max-w-2xl rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted/60"
        />
      </label>
      {erro ? (
        <p role="alert" className="text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || razao.trim().length === 0}
          onClick={() => {
            setErro(null);
            startTransition(async () => {
              const r = await skipStage({ orderId, reason: razao });
              if (!r.ok) {
                setErro(r.message);
                return;
              }
              setArmado(false);
              setRazao('');
            });
          }}
          className="rounded-md border border-bos-warning bg-bos-warning/20 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-warning/30 disabled:opacity-40"
        >
          {pending ? 'Pulando…' : 'Confirmar e registrar'}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmado(false);
            setErro(null);
          }}
          className="text-xs text-bos-muted transition-colors hover:text-bos-text"
        >
          Não pular
        </button>
      </div>
    </div>
  );
}

/**
 * ⭐ **DEVOLVER (REFAZER) — minerado do ciclo aprovar/rejeitar/refazer.**
 *
 * A instrução é obrigatória: reprovar sem dizer o que mudar devolve a OS e
 * trava quem recebe.
 */
function BotaoDevolver({
  orderId,
  anteriores,
  concluida,
}: {
  orderId: string;
  anteriores: readonly PipelineStage[];
  concluida: boolean;
}) {
  const [armado, setArmado] = useState(false);
  const [destino, setDestino] = useState(anteriores[anteriores.length - 1]?.id ?? '');
  const [instrucao, setInstrucao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!armado) {
    return (
      <button
        type="button"
        onClick={() => setArmado(true)}
        className="w-fit rounded-md border border-bos-warning/50 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-warning/15"
      >
        Devolver para refazer
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-bos-warning/40 bg-bos-warning/5 px-4 py-3">
      <p className="max-w-2xl text-xs text-bos-muted">
        {concluida ? (
          <>
            Esta OS está <strong className="text-bos-text">concluída</strong>, e devolver{' '}
            <strong className="text-bos-text">a reabre</strong> — é o mesmo trabalho, com a mesma
            história. Uma OS nova partiria em duas a trilha de um serviço só.
          </>
        ) : (
          <>A OS volta para a etapa escolhida, e a instrução fica na trilha.</>
        )}
      </p>
      <label className="block">
        <span className="text-xs text-bos-muted">Voltar para</span>
        <select
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
        >
          {anteriores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-bos-muted">O que precisa ser refeito? (obrigatório)</span>
        <textarea
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          rows={2}
          placeholder="os dados da página 3 estão desatualizados"
          className="mt-1 w-full max-w-2xl rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted/60"
        />
      </label>
      {erro ? (
        <p role="alert" className="text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || instrucao.trim().length === 0 || destino === ''}
          onClick={() => {
            setErro(null);
            startTransition(async () => {
              const r = await sendBackOrder({ orderId, toStageId: destino, instruction: instrucao });
              if (!r.ok) {
                setErro(r.message);
                return;
              }
              setArmado(false);
              setInstrucao('');
            });
          }}
          className="rounded-md border border-bos-warning bg-bos-warning/20 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-warning/30 disabled:opacity-40"
        >
          {pending ? 'Devolvendo…' : 'Confirmar devolução'}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmado(false);
            setErro(null);
          }}
          className="text-xs text-bos-muted transition-colors hover:text-bos-text"
        >
          Não devolver
        </button>
      </div>
    </div>
  );
}

function BotaoFinalizar({
  orderId,
  alvo,
  rotulo,
  aviso,
  habilitado,
  perigoso = false,
}: {
  orderId: string;
  alvo: 'done' | 'cancelled';
  rotulo: string;
  aviso: string;
  habilitado: boolean;
  perigoso?: boolean;
}) {
  const [armado, setArmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!habilitado) return null;

  // ⚠️ Classes ESCRITAS POR INTEIRO nos dois ramos, e não montadas com
  // template (`border-${cor}`). O Tailwind varre o código-fonte à procura de
  // literais: uma classe montada em runtime não existe no CSS gerado, e o
  // botão perigoso sairia sem a borda vermelha — sem erro nenhum, o que é a
  // pior forma de um aviso sumir.
  const contorno = perigoso
    ? 'border-bos-danger/50 hover:bg-bos-danger/15'
    : 'border-bos-success/50 hover:bg-bos-success/15';
  const solido = perigoso
    ? 'border-bos-danger bg-bos-danger/20 hover:bg-bos-danger/30'
    : 'border-bos-success bg-bos-success/20 hover:bg-bos-success/30';

  if (!armado) {
    return (
      <button
        type="button"
        onClick={() => setArmado(true)}
        className={`rounded-md border ${contorno} px-3 py-1.5 text-xs text-bos-text transition-colors`}
      >
        {rotulo}
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <p className="max-w-2xl text-xs text-bos-muted">{aviso}</p>
      {erro ? (
        <p role="alert" className="text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErro(null);
            startTransition(async () => {
              const r = await changeOrderStatus({ orderId, to: alvo });
              if (!r.ok) {
                setErro(r.message);
                return;
              }
              setArmado(false);
            });
          }}
          className={`rounded-md border ${solido} px-3 py-1.5 text-xs text-bos-text transition-colors disabled:opacity-50`}
        >
          {pending ? 'Aplicando…' : `Confirmar: ${rotulo.toLowerCase()}`}
        </button>
        <button
          type="button"
          onClick={() => {
            setArmado(false);
            setErro(null);
          }}
          className="text-xs text-bos-muted transition-colors hover:text-bos-text"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function Entregaveis({
  order,
  deliverables,
  canManage,
}: {
  order: WorkOrder;
  deliverables: readonly Deliverable[];
  canManage: boolean;
}) {
  const correntes = latestDeliverables(deliverables);

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-bos-text">Entregáveis</h2>
        <Badge tone="neutral">{deliverables.length} versão(ões)</Badge>
      </div>

      <p className="mt-1 max-w-3xl text-sm text-bos-muted">
        Refazer cria uma <strong className="text-bos-text">versão nova</strong>, com a instrução que
        a gerou. A anterior continua aqui — ela é o que foi entregue e recusado, e apagá-la apagaria
        a razão de existir da próxima.
      </p>

      {deliverables.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nenhum entregável registrado"
            hint="Registre o primeiro abaixo. A referência é um link, um caminho de rede ou um número — este módulo não guarda arquivo."
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {correntes.map((atual) => {
            const versoes = deliverables
              .filter((d) => d.kind === atual.kind)
              .sort((a, b) => b.version - a.version);
            return (
              <div key={atual.kind} className="rounded-md border border-bos-border bg-bos-bg px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-bos-text">{atual.kind}</span>
                  <Badge tone="info">versão corrente: v{atual.version}</Badge>
                </div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {versoes.map((v) => (
                    <li key={v.id} className="text-xs text-bos-muted">
                      <span className="font-mono text-bos-text">v{v.version}</span>{' '}
                      <span className="break-all">{v.reference}</span>
                      {v.instruction ? (
                        <span className="text-bos-muted"> — {v.instruction}</span>
                      ) : (
                        <span className="text-bos-muted/70"> — primeira versão</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 border-t border-bos-border pt-4">
        <FormEntregavel
          orderId={order.id}
          deliverables={deliverables}
          canManage={canManage}
        />
      </div>
    </Panel>
  );
}

function FormEntregavel({
  orderId,
  deliverables,
  canManage,
}: {
  orderId: string;
  deliverables: readonly Deliverable[];
  canManage: boolean;
}) {
  const [tipo, setTipo] = useState('');
  const [referencia, setReferencia] = useState('');
  const [instrucao, setInstrucao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <p className="text-xs text-bos-muted">
        Registrar entregável exige <code className="font-mono">ops.order.manage</code>.
      </p>
    );
  }

  // ⭐ A versão vem do motor, e a tela só a MOSTRA antes de gravar — para o
  // operador saber que está criando a v2, não editando a v1.
  const versao =
    tipo.trim().length > 0 ? nextVersion(deliverables, orderId, tipo.trim()) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-bos-muted">Tipo — texto livre</span>
          <input
            type="text"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            placeholder="arte · legenda · laudo · planta baixa · orçamento"
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted/60"
          />
        </label>
        <label className="block">
          <span className="text-xs text-bos-muted">Referência — link, caminho ou número</span>
          <input
            type="text"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-bos-muted">
            O que mudou nesta versão? (vazio na primeira)
          </span>
          <input
            type="text"
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          />
        </label>
      </div>

      {versao !== null ? (
        <p className="text-xs text-bos-muted">
          Vai ser registrada a versão <strong className="text-bos-text">v{versao}</strong> de{' '}
          <strong className="text-bos-text">{tipo.trim()}</strong>.
        </p>
      ) : null}

      {erro ? (
        <p role="alert" className="text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}

      <button
        type="button"
        disabled={pending || tipo.trim().length === 0 || referencia.trim().length === 0}
        onClick={() => {
          setErro(null);
          startTransition(async () => {
            const r = await registerDeliverable({
              orderId,
              kind: tipo,
              reference: referencia,
              instruction: instrucao,
            });
            if (!r.ok) {
              setErro(r.message);
              return;
            }
            setReferencia('');
            setInstrucao('');
          });
        }}
        className="w-fit rounded-md border border-bos-border px-4 py-2 text-sm text-bos-text transition-colors hover:border-bos-accent/50"
      >
        {pending ? 'Registrando…' : 'Registrar entregável'}
      </button>

      <p className="text-[11px] text-bos-muted">
        Este módulo <strong className="text-bos-text">não guarda arquivo</strong>, e a ausência é
        decisão declarada: armazenamento é capacidade do Core, com política de acesso, limite,
        retenção e custo próprios — e ainda não foi construída. A referência aponta para onde o
        arquivo já vive.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * ⭐ **A TRILHA — imutável, e é isso que a torna útil.**
 *
 * Cada linha mostra o NOME da etapa como ele era no momento do ato. Se a etapa
 * foi renomeada ou apagada depois, a história continua legível: o nome está
 * carimbado na linha, e o id é solto.
 */
function Trilha({ movements }: { movements: readonly OrderMovement[] }) {
  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Trilha</h2>
      <p className="mt-1 max-w-3xl text-sm text-bos-muted">
        Tudo o que aconteceu com esta OS, na ordem inversa.{' '}
        <strong className="text-bos-text">Nenhuma linha se edita ou se apaga</strong> — se algo foi
        registrado errado, a correção é registrar o movimento certo.
      </p>

      {movements.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nenhum movimento registrado" />
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-2">
          {movements.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-start gap-3 rounded-md border border-bos-border bg-bos-bg px-4 py-3"
            >
              <span className="font-mono text-[11px] text-bos-muted">{stamp(m.occurredAt)}</span>
              <Badge tone={TOM_MOVIMENTO[m.kind]}>{ROTULO_MOVIMENTO[m.kind]}</Badge>
              <div className="min-w-0 flex-1">
                {m.fromStageName || m.toStageName ? (
                  <p className="text-xs text-bos-muted">
                    {m.fromStageName ? (
                      <span className="text-bos-text">{m.fromStageName}</span>
                    ) : null}
                    {m.fromStageName && m.toStageName ? ' → ' : null}
                    {m.toStageName ? <span className="text-bos-text">{m.toStageName}</span> : null}
                  </p>
                ) : null}
                {m.note ? <p className="mt-1 text-sm text-bos-text">{m.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
