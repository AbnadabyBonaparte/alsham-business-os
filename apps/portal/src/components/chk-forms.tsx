'use client';

import { useState, useTransition } from 'react';

import type { ChkTemplate, ChkTemplateItem } from '@alsham/checklists';

import { createTemplate, startRun } from '@/app/chk-actions';
import { Badge, Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Abrir uma execução — a prancheta congela na abertura, pelo gatilho. */
export function ChkStartForm({
  templates,
  items,
}: {
  templates: readonly ChkTemplate[];
  items: readonly ChkTemplateItem[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [modelo, setModelo] = useState('');
  const [alvo, setAlvo] = useState('');
  const [pending, startTransition] = useTransition();

  const ativos = templates.filter((t) => t.status === 'active');

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Abrir execução</h2>
      <p className="mt-1 text-xs text-bos-muted">
        O modelo congela na abertura: editar o desenho depois não reescreve esta inspeção.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text" value={modelo} onChange={(e) => setModelo(e.target.value)}>
          <option value="">— escolha o modelo —</option>
          {ativos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({items.filter((i) => i.templateId === t.id && i.status === 'active').length} itens)
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text"
          placeholder="alvo — loja 3, van 12…"
          value={alvo}
          onChange={(e) => setAlvo(e.target.value)}
        />
        <button
          type="button"
          disabled={pending || modelo === ''}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={() => {
            setErro(null);
            startTransition(async () => {
              const r = await startRun({ templateId: modelo, subject: alvo });
              if (!r.ok) setErro(r.message);
              else setAlvo('');
            });
          }}
        >
          Abrir — e congelar a prancheta
        </button>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

/** O desenho dos modelos — vocabulário do tenant, nunca enum. */
export function ChkSetup({
  templates,
  items,
  canSetup,
}: {
  templates: readonly ChkTemplate[];
  items: readonly ChkTemplateItem[];
  canSetup: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [itens, setItens] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Modelos do tenant</h2>
      <p className="mt-1 text-xs text-bos-muted">
        A ronda do shopping e a abertura de loja moram na mesma tabela — o desenho é seu.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {templates.length === 0 ? (
          <span className="text-xs text-bos-muted">Nenhum modelo desenhado ainda.</span>
        ) : (
          templates.map((t) => (
            <Badge key={t.id} tone={t.status === 'active' ? 'neutral' : 'warning'}>
              {t.name} · {items.filter((i) => i.templateId === t.id && i.status === 'active').length} itens
            </Badge>
          ))
        )}
      </div>
      {canSetup ? (
        !aberto ? (
          <button
            type="button"
            className="mt-3 rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent"
            onClick={() => setAberto(true)}
          >
            Desenhar modelo
          </button>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-bos-muted">
              Nome*
              <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Abertura da loja" />
            </label>
            <label className="text-xs text-bos-muted sm:col-span-2">
              Itens* (um por linha, na ordem da inspeção)
              <textarea
                className={campo}
                rows={4}
                value={itens}
                onChange={(e) => setItens(e.target.value)}
                placeholder={'Portas destravadas\nCaixa conferido\nLuzes da vitrine acesas'}
              />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
                onClick={() => {
                  setErro(null);
                  startTransition(async () => {
                    const r = await createTemplate({ name: nome, items: itens.split('\n') });
                    if (!r.ok) setErro(r.message);
                    else {
                      setAberto(false);
                      setNome('');
                      setItens('');
                    }
                  });
                }}
              >
                Criar modelo
              </button>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
                onClick={() => setAberto(false)}
              >
                Cancelar
              </button>
            </div>
            {erro ? <p className="text-sm text-bos-danger sm:col-span-2">{erro}</p> : null}
          </div>
        )
      ) : null}
    </Panel>
  );
}
