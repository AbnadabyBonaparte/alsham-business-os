'use client';

import { useState, useTransition } from 'react';

import type { RulerWithSteps } from '@/lib/data';
import { archiveRuler, createRuler } from '@/app/dun-actions';
import { Badge, Panel } from '@/components/states';

type Linha = { key: string; name: string; days: string; channel: string };

/**
 * O desenho da régua — passos ordenados, dias após o vencimento, canal em
 * texto livre. Só UMA ativa por tenant: para redesenhar, arquiva-se a atual.
 */
export function RulerDesigner({
  rulers,
  canDesign,
}: {
  rulers: readonly RulerWithSteps[];
  canDesign: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([
    { key: '1', name: '', days: '1', channel: '' },
  ]);
  const [pending, startTransition] = useTransition();

  const ativa = rulers.find((r) => r.ruler.status === 'active');

  return (
    <Panel className="px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-bos-text">A régua</h2>
        {ativa ? <Badge tone="success">{ativa.ruler.name}</Badge> : <Badge tone="warning">nenhuma régua ativa</Badge>}
      </div>

      {ativa ? (
        <div className="mt-3 flex flex-col gap-1">
          {ativa.steps.map((s) => (
            <p key={s.id} className="text-sm text-bos-muted tabular">
              +{s.daysAfterDue}d — <span className="text-bos-text">{s.name}</span>
              {s.channel ? ` · ${s.channel}` : ''}
            </p>
          ))}
          {canDesign ? (
            confirmArchive ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-danger"
                  onClick={() => {
                    setErro(null);
                    startTransition(async () => {
                      const r = await archiveRuler({ rulerId: ativa.ruler.id });
                      if (!r.ok) setErro(r.message);
                      else setConfirmArchive(false);
                    });
                  }}
                >
                  Confirmar arquivar (as execuções ficam)
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1.5 text-sm text-bos-muted"
                  onClick={() => setConfirmArchive(false)}
                >
                  Voltar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mt-2 self-start rounded-md border border-bos-border px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
                onClick={() => setConfirmArchive(true)}
              >
                Arquivar para redesenhar
              </button>
            )
          ) : null}
        </div>
      ) : canDesign && !aberto ? (
        <button
          type="button"
          className="mt-3 rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text hover:bg-bos-accent/25"
          onClick={() => setAberto(true)}
        >
          Desenhar régua
        </button>
      ) : null}

      {!ativa && aberto && canDesign ? (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            startTransition(async () => {
              const r = await createRuler({
                name: nome,
                steps: linhas
                  .filter((l) => l.name.trim().length > 0)
                  .map((l) => ({
                    name: l.name,
                    daysAfterDue: Number(l.days),
                    channel: l.channel.trim().length > 0 ? l.channel : null,
                  })),
              });
              if (!r.ok) setErro(r.message);
              else setAberto(false);
            });
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-bos-muted sm:max-w-xs">
            Nome da régua
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-bos-text"
            />
          </label>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-bos-muted">
                Passos — dias após o vencimento não podem diminuir
              </span>
              <button
                type="button"
                className="text-sm text-bos-accent hover:underline"
                onClick={() =>
                  setLinhas((ls) => [...ls, { key: String(Date.now()), name: '', days: '', channel: '' }])
                }
              >
                + passo
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {linhas.map((l, idx) => (
                <div key={l.key} className="grid gap-2 sm:grid-cols-12">
                  <input
                    className="sm:col-span-5 rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm"
                    placeholder="Nome do passo (1º aviso…)"
                    value={l.name}
                    onChange={(e) =>
                      setLinhas((ls) => ls.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                    }
                  />
                  <input
                    className="sm:col-span-3 rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm tabular"
                    placeholder="Dias após venc."
                    value={l.days}
                    onChange={(e) =>
                      setLinhas((ls) => ls.map((x, i) => (i === idx ? { ...x, days: e.target.value } : x)))
                    }
                  />
                  <input
                    className="sm:col-span-3 rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm"
                    placeholder="Canal (livre)"
                    value={l.channel}
                    onChange={(e) =>
                      setLinhas((ls) => ls.map((x, i) => (i === idx ? { ...x, channel: e.target.value } : x)))
                    }
                  />
                  <button
                    type="button"
                    className="sm:col-span-1 text-xs text-bos-muted hover:text-bos-danger"
                    disabled={linhas.length <= 1}
                    onClick={() => setLinhas((ls) => ls.filter((_, i) => i !== idx))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          {erro ? <p className="text-sm text-bos-danger">{erro}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-bos-accent px-4 py-2 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover disabled:opacity-60"
            >
              {pending ? 'Criando…' : 'Criar régua'}
            </button>
            <button
              type="button"
              className="rounded-md px-4 py-2 text-sm text-bos-muted"
              onClick={() => setAberto(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {erro && !aberto ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}
