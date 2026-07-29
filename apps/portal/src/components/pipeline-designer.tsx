'use client';

import { useState, useTransition } from 'react';

import { validateStages } from '@alsham/ops';
import type { NewStage } from '@alsham/ops';

import { createPipeline } from '@/app/ops-actions';
import { Panel } from '@/components/states';

/**
 * ⭐ **O DESENHO DA ESTEIRA — a Lei das Etapas virando tela.**
 *
 * É aqui que o cliente decide o próprio processo: nome da etapa, ordem, o que
 * exige aprovação e o que pode ser pulado. Nenhuma etapa vem escrita no
 * produto — o formulário nasce com UMA linha vazia, e não com "abertura →
 * briefing → criação", porque sugerir a esteira de uma agência a uma
 * construtora é o viés desta etapa em pessoa.
 *
 * ⚠️ **Este componente não valida nada por conta própria.** `validateStages()`
 * mora em `@alsham/ops` e é a MESMA função que a Server Action chama. Se a
 * regra de "duas etapas com o mesmo nome" estivesse aqui, ela existiria em dois
 * lugares que um dia divergiriam.
 */

interface LinhaEtapa extends NewStage {
  readonly key: number;
}

let contador = 0;
function novaLinha(position: number): LinhaEtapa {
  contador += 1;
  return { key: contador, name: '', position, requiresApproval: false, skippable: false };
}

export function PipelineDesigner({ canDesign }: { canDesign: boolean }) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [etapas, setEtapas] = useState<LinhaEtapa[]>([novaLinha(0)]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cortesia de interface. Quem IMPEDE de verdade é a policy
  // `pipelines_insert`, que exige `ops.pipeline.design`.
  if (!canDesign) {
    return (
      <Panel className="px-6 py-5">
        <p className="text-sm text-bos-muted">
          Desenhar a esteira exige a permissão{' '}
          <code className="font-mono text-bos-text">ops.pipeline.design</code>. Peça a quem
          administra o seu tenant.
        </p>
      </Panel>
    );
  }

  const trocar = (key: number, patch: Partial<NewStage>) => {
    setEtapas((atual) => atual.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  };

  const mover = (key: number, direcao: -1 | 1) => {
    setEtapas((atual) => {
      const i = atual.findIndex((e) => e.key === key);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[j]] = [copia[j]!, copia[i]!];
      // A `position` é reatribuída pela ORDEM da lista, sempre. Trocar só os
      // números deixaria a lista e a posição discordando na primeira remoção.
      return copia.map((e, idx) => ({ ...e, position: idx }));
    });
  };

  const remover = (key: number) => {
    setEtapas((atual) =>
      atual.filter((e) => e.key !== key).map((e, idx) => ({ ...e, position: idx })),
    );
  };

  const problema = validateStages(etapas);

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Desenhar uma esteira</h2>
      <p className="mt-1 max-w-3xl text-sm text-bos-muted">
        As etapas são <strong className="text-bos-text">suas</strong>. Escreva os nomes que a sua
        empresa usa, na ordem em que o trabalho anda. Marque{' '}
        <em>exige aprovação</em> nas etapas em que alguém precisa decidir para o trabalho seguir, e{' '}
        <em>pode ser pulada</em> nas que nem sempre se aplicam.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-bos-muted">Nome da esteira</span>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Produção de conteúdo · Ordem de manutenção · Abertura de processo"
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted/60"
          />
        </label>
        <label className="block">
          <span className="text-xs text-bos-muted">Para que ela serve (opcional)</span>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text"
          />
        </label>
      </div>

      <ol className="mt-5 flex flex-col gap-2">
        {etapas.map((etapa, idx) => (
          <li
            key={etapa.key}
            className="flex flex-wrap items-center gap-3 rounded-md border border-bos-border bg-bos-bg px-3 py-2"
          >
            <span className="font-mono text-[11px] text-bos-muted">{idx + 1}</span>
            <input
              type="text"
              value={etapa.name}
              onChange={(e) => trocar(etapa.key, { name: e.target.value })}
              placeholder="nome da etapa"
              className="min-w-40 flex-1 rounded-md border border-bos-border bg-bos-surface px-3 py-1.5 text-sm text-bos-text placeholder:text-bos-muted/60"
            />
            <label className="flex items-center gap-1.5 text-xs text-bos-muted">
              <input
                type="checkbox"
                checked={etapa.requiresApproval}
                onChange={(e) => trocar(etapa.key, { requiresApproval: e.target.checked })}
              />
              exige aprovação
            </label>
            <label className="flex items-center gap-1.5 text-xs text-bos-muted">
              <input
                type="checkbox"
                checked={etapa.skippable}
                onChange={(e) => trocar(etapa.key, { skippable: e.target.checked })}
              />
              pode ser pulada
            </label>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => mover(etapa.key, -1)}
                disabled={idx === 0}
                aria-label="subir"
                className="rounded border border-bos-border px-2 py-0.5 text-xs text-bos-muted transition-colors hover:text-bos-text disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => mover(etapa.key, 1)}
                disabled={idx === etapas.length - 1}
                aria-label="descer"
                className="rounded border border-bos-border px-2 py-0.5 text-xs text-bos-muted transition-colors hover:text-bos-text disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remover(etapa.key)}
                disabled={etapas.length === 1}
                aria-label="remover etapa"
                className="rounded border border-bos-border px-2 py-0.5 text-xs text-bos-muted transition-colors hover:text-bos-text disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setEtapas((a) => [...a, novaLinha(a.length)])}
        className="mt-3 rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-muted transition-colors hover:text-bos-text"
      >
        + acrescentar etapa
      </button>

      {problema !== null && etapas.some((e) => e.name.trim().length > 0) ? (
        <p className="mt-3 text-xs text-bos-warning">{problema}</p>
      ) : null}

      {erro ? (
        <p role="alert" className="mt-3 text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}
      {ok ? <p className="mt-3 text-xs text-bos-success">{ok}</p> : null}

      <div className="mt-4 border-t border-bos-border pt-4">
        <button
          type="button"
          disabled={pending || nome.trim().length === 0 || problema !== null}
          onClick={() => {
            setErro(null);
            setOk(null);
            startTransition(async () => {
              const r = await createPipeline({
                name: nome,
                description: descricao,
                stages: etapas.map(({ key: _key, ...s }) => s),
              });
              if (!r.ok) {
                setErro(r.message);
                return;
              }
              setOk(`Esteira "${nome.trim()}" criada. Ela já aceita ordens de serviço.`);
              setNome('');
              setDescricao('');
              setEtapas([novaLinha(0)]);
            });
          }}
          className="rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text transition-colors hover:bg-bos-accent/25 disabled:opacity-40"
        >
          {pending ? 'Criando…' : 'Criar esteira'}
        </button>
      </div>
    </Panel>
  );
}
