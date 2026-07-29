'use client';

import { useState, useTransition } from 'react';

import { canGenerate, engineLabel, whyCannotGenerate } from '@alsham/ai';
import type { EngineState, GenerationKind } from '@alsham/ai';

import { generateDeliverable } from '@/app/forge-actions';
import { Badge, Panel } from '@/components/states';

/**
 * ⭐ **O MOTOR PLUGADO NA ESTEIRA — a Etapa 14 na tela.**
 *
 * O operador pede a geração numa etapa; o resultado entra como **versão de
 * entregável marcada como rascunho de máquina**; e a pessoa decide.
 *
 * ⚖️ **A LEI DO MOTOR aqui é estrutural, não uma lembrança.** O que este
 * componente exibe vem de `engineLabel()`, que só sabe dizer a ETAPA ("Texto",
 * "Arte") e "motor ALSHAM" — o tipo que ele devolve **não tem campo** para o
 * nome do fornecedor. Não há como vazá-lo por descuido.
 *
 * ⭐ **E o estado é HONESTO em todos os caminhos:**
 *
 * - sem chave neste ambiente → diz isso, com o ponteiro para o runbook;
 * - sem métrica de plano → **o botão não aparece** ("sem medição, sem geração");
 * - cota estourada → diz quanto de quanto;
 * - modo demonstração → **gera, e o selo de demonstração fica na tela**.
 *   Nunca um mock silencioso.
 */
export function ForgePanel({
  orderId,
  estadoTexto,
  estadoImagem,
  canManage,
}: {
  orderId: string;
  estadoTexto: EngineState;
  estadoImagem: EngineState;
  canManage: boolean;
}) {
  const [modalidade, setModalidade] = useState<GenerationKind>('text');
  const [tipo, setTipo] = useState('');
  const [instrucao, setInstrucao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [saida, setSaida] = useState<{
    output: string;
    violations: readonly string[];
    demo: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const estado = modalidade === 'text' ? estadoTexto : estadoImagem;
  const rotulo = engineLabel(modalidade);
  const podeGerar = canGenerate(estado) && canManage;
  const porque = whyCannotGenerate(estado);

  // ⛔ **SEM MEDIÇÃO, SEM GERAÇÃO — o botão nem aparece.**
  //
  // Este é o único estado em que o painel some inteiro em vez de explicar: um
  // plano sem teto declarado para a métrica não é algo que o operador resolva,
  // e um botão desabilitado ali só geraria chamado.
  if (estadoTexto.status === 'unmetered' && estadoImagem.status === 'unmetered') {
    return (
      <Panel className="px-6 py-5">
        <p className="bos-eyebrow">A Forja</p>
        <h2 className="mt-2 font-display text-lg text-bos-text">Geração pelo motor ALSHAM</h2>
        <p className="mt-2 max-w-3xl text-sm text-bos-muted">
          {whyCannotGenerate(estadoTexto)}
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="bos-eyebrow">A Forja</p>
          <h2 className="mt-2 flex items-center gap-2.5 font-display text-xl text-bos-text">
            {/* A fagulha — traço, não emoji (IDENTIDADE-VISUAL §6). */}
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="size-4 text-bos-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <path d="M10 1.5 L11.8 8.2 L18.5 10 L11.8 11.8 L10 18.5 L8.2 11.8 L1.5 10 L8.2 8.2 Z" />
            </svg>
            Geração pelo motor ALSHAM
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{rotulo.step}</Badge>
          {estado.status === 'demo' ? <Badge tone="warning">demonstração</Badge> : null}
        </div>
      </div>

      <p className="mt-1 max-w-3xl text-sm text-bos-muted">
        O que sair daqui entra como <strong className="text-bos-text">versão de entregável</strong>,
        marcada como rascunho de máquina. <strong className="text-bos-text">Quem decide é você</strong>:
        aprovar é deixar como está; refazer é gerar de novo, o que cria a próxima versão; descartar é
        registrar outra versão à mão. Nenhuma versão anterior é apagada.
      </p>

      {estado.status === 'demo' ? (
        <p className="mt-3 rounded-md border border-bos-warning/40 bg-bos-warning/5 px-4 py-3 text-xs text-bos-muted">
          ⚠️ Este ambiente está em <strong className="text-bos-text">modo demonstração</strong>. O
          texto abaixo é um exemplo fixo — <strong className="text-bos-text">nenhuma geração real
          acontece</strong> e nada é cobrado do plano.
        </p>
      ) : null}

      {porque !== null && estado.status !== 'demo' ? (
        <p className="mt-3 rounded-md border border-bos-border bg-bos-bg px-4 py-3 text-xs text-bos-muted">
          {porque}
        </p>
      ) : null}

      {!canManage ? (
        <p className="mt-3 text-xs text-bos-muted">
          Registrar entregável exige <code className="font-mono">ops.order.manage</code>.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs text-bos-muted">O que gerar</span>
          <select
            value={modalidade}
            onChange={(e) => {
              setModalidade(e.target.value === 'image' ? 'image' : 'text');
              setSaida(null);
            }}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          >
            <option value="text">Texto</option>
            <option value="image">Arte</option>
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs text-bos-muted">Tipo do entregável — texto livre</span>
          <input
            type="text"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            placeholder="legenda · arte · rascunho de laudo"
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted/60"
          />
        </label>

        <label className="block sm:col-span-3">
          <span className="text-xs text-bos-muted">O que precisa ser produzido</span>
          <textarea
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          />
        </label>
      </div>

      <p className="mt-2 text-[11px] text-bos-muted">
        O tom, a identidade e o que a sua marca nunca diz entram automaticamente no pedido — vêm do{' '}
        <strong className="text-bos-text">contexto da marca</strong>, em Ajustes.
      </p>

      {erro ? (
        <p role="alert" className="mt-3 text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}

      {saida !== null ? (
        <div className="mt-4 rounded-md border border-bos-border bg-bos-bg px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">registrado como nova versão</Badge>
            {saida.demo ? <Badge tone="warning">demonstração</Badge> : null}
            {saida.violations.length > 0 ? (
              <Badge tone="danger">termo vetado pela marca</Badge>
            ) : null}
          </div>
          {saida.violations.length > 0 ? (
            <p className="mt-2 text-xs text-bos-muted">
              O resultado contém {saida.violations.map((v) => `"${v}"`).join(', ')}, que a sua marca
              veta. <strong className="text-bos-text">Nada foi apagado</strong> — o texto está
              inteiro, e a decisão é sua: refazer com instrução nova, ou aceitar.
            </p>
          ) : null}
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-bos-text">
            {saida.output}
          </pre>
        </div>
      ) : null}

      <div className="mt-4 border-t border-bos-border pt-4">
        <button
          type="button"
          disabled={pending || !podeGerar || instrucao.trim().length === 0 || tipo.trim().length === 0}
          onClick={() => {
            setErro(null);
            setSaida(null);
            startTransition(async () => {
              const r = await generateDeliverable({
                orderId,
                kind: modalidade,
                deliverableKind: tipo,
                instruction: instrucao,
              });
              if (!r.ok) {
                setErro(r.message);
                return;
              }
              setSaida(r.data ?? null);
            });
          }}
          className="rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text transition-colors hover:bg-bos-accent/25 disabled:opacity-40"
        >
          {pending ? 'Gerando…' : `Gerar ${rotulo.step.toLowerCase()} com o ${rotulo.engine}`}
        </button>
      </div>
    </Panel>
  );
}
