'use client';

import { useState, useTransition } from 'react';

import type { BrandContext } from '@alsham/ai';

import { saveBrandContext } from '@/app/brand-actions';
import { Panel } from '@/components/states';

/**
 * ⭐ **O CÉREBRO DA MARCA — o que entra em TODA geração.**
 *
 * Minerado das `personas` do kraken-v2, com a divergência declarada: lá são
 * várias por workspace, aqui é **uma por tenant** — numa plataforma de gestão,
 * o tenant É a marca.
 *
 * ⭐ **É dado do TENANT, nunca constante do produto.** Os campos nascem
 * vazios: o produto não sugere como a sua empresa fala.
 */
export function BrandForm({ atual, canEdit }: { atual: BrandContext; canEdit: boolean }) {
  const [identity, setIdentity] = useState(atual.identity);
  const [tone, setTone] = useState(atual.tone);
  const [forbidden, setForbidden] = useState(atual.forbidden.join('\n'));
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Contexto da marca</h2>
      <p className="mt-1 max-w-3xl text-sm text-bos-muted">
        Isto entra em <strong className="text-bos-text">toda geração</strong> pedida na esteira: quem
        vocês são, como falam, e o que a marca nunca diz. Deixe em branco o que não se aplica.
      </p>

      {!canEdit ? (
        <p className="mt-3 text-xs text-bos-muted">
          Definir o contexto da marca exige <code className="font-mono">core.tenant.manage</code>.
          Quem escreve por uma empresa é quem responde por ela.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <label className="block">
          <span className="text-xs text-bos-muted">Quem somos</span>
          <textarea
            value={identity}
            disabled={!canEdit}
            onChange={(e) => setIdentity(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="text-xs text-bos-muted">Como falamos</span>
          <textarea
            value={tone}
            disabled={!canEdit}
            onChange={(e) => setTone(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="text-xs text-bos-muted">
            O que nunca dizemos — um termo por linha
          </span>
          <textarea
            value={forbidden}
            disabled={!canEdit}
            onChange={(e) => setForbidden(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 font-mono text-xs text-bos-text disabled:opacity-50"
          />
        </label>
      </div>

      <p className="mt-2 text-[11px] text-bos-muted">
        Os termos vetados entram no pedido como restrição <strong className="text-bos-text">e</strong>{' '}
        são conferidos no resultado depois. Se um escapar, o rascunho aparece com o aviso —{' '}
        <strong className="text-bos-text">nada é apagado do texto</strong>, porque uma frase com
        buraco é pior do que uma frase que você reprova.
      </p>

      {erro ? (
        <p role="alert" className="mt-3 text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}
      {ok ? <p className="mt-3 text-xs text-bos-success">Contexto salvo.</p> : null}

      {canEdit ? (
        <div className="mt-4 border-t border-bos-border pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setErro(null);
              setOk(false);
              startTransition(async () => {
                const r = await saveBrandContext({ identity, tone, forbiddenRaw: forbidden });
                if (!r.ok) {
                  setErro(r.message);
                  return;
                }
                setOk(true);
              });
            }}
            className="rounded-md border border-bos-accent bg-bos-accent/15 px-4 py-2 text-sm text-bos-text transition-colors hover:bg-bos-accent/25 disabled:opacity-40"
          >
            {pending ? 'Salvando…' : 'Salvar contexto'}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
