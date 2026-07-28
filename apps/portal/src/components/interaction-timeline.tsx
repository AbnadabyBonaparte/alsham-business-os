'use client';

import { useRef, useState, useTransition } from 'react';

import type { InteractionRow } from '@/lib/data';
import { recordInteraction } from '@/app/crm-actions';
import { stamp } from '@/lib/format';
import { EmptyState, Panel } from '@/components/states';

/**
 * A linha do tempo de contato de uma contraparte.
 *
 * ⭐ **Não há botão de editar nem de apagar, e a ausência é a mensagem.** Uma
 * interação é o registro de que algo aconteceu — fato consumado não se edita.
 * Se o registro saiu errado, a correção é **outra interação** dizendo o que se
 * corrigiu, como um livro-caixa se corrige com estorno e nunca com borracha.
 *
 * A tela não está sendo gentil: o banco recusa em três camadas (sem policy de
 * UPDATE, sem GRANT de UPDATE nem de DELETE, e um trigger que levanta erro).
 * Um botão aqui só produziria uma mensagem de erro bonita.
 */
export function InteractionTimeline({
  partyId,
  partyName,
  interactions,
  canRecord,
}: {
  partyId: string;
  partyName: string;
  interactions: readonly InteractionRow[];
  canRecord: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {canRecord ? (
        <InteractionForm partyId={partyId} partyName={partyName} />
      ) : (
        <p className="text-xs text-bos-muted">
          Registrar contato exige a permissão{' '}
          <code className="font-mono">crm.interaction.record</code>.
        </p>
      )}

      {interactions.length === 0 ? (
        <EmptyState
          title="Nenhum contato registrado ainda"
          hint="O primeiro registro começa o histórico desta contraparte. Ele não some se ela for arquivada."
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {interactions.map((i) => (
            <li key={i.id}>
              <Panel className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-bos-text">{i.channel}</span>
                  <span className="text-[11px] text-bos-muted">{stamp(i.occurredAt)}</span>
                </div>
                {i.note ? <p className="mt-1 text-sm text-bos-muted">{i.note}</p> : null}
                {/* Quando ACONTECEU não é quando foi DIGITADO — e a diferença
                    importa para quem registra a visita de ontem. */}
                {i.createdAt.slice(0, 10) !== i.occurredAt.slice(0, 10) ? (
                  <p className="mt-1 text-[11px] text-bos-muted">
                    registrado em {stamp(i.createdAt)}
                  </p>
                ) : null}
              </Panel>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function InteractionForm({ partyId, partyName }: { partyId: string; partyName: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="self-start rounded-md border border-bos-accent bg-bos-accent/15 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-accent/25"
      >
        Registrar contato
      </button>
    );
  }

  function salvar(formData: FormData) {
    setErro(null);
    setCampos({});
    const quando = String(formData.get('occurredAt') ?? '').trim();

    startTransition(async () => {
      const r = await recordInteraction({
        partyId,
        // `datetime-local` devolve hora local sem fuso; o pacote normaliza.
        occurredAt: quando ? new Date(quando).toISOString() : '',
        channel: String(formData.get('channel') ?? ''),
        note: String(formData.get('note') ?? ''),
      });

      if (!r.ok) {
        setErro(r.message);
        if ('problems' in r && r.problems) {
          setCampos(Object.fromEntries(r.problems.map((p) => [p.field, p.message])));
        }
        return;
      }
      formRef.current?.reset();
      setCampos({});
      setAberto(false);
    });
  }

  return (
    <Panel className="px-5 py-5">
      <form ref={formRef} action={salvar} className="flex flex-col gap-3">
        <p className="text-xs text-bos-muted">
          Registrando contato com <strong className="text-bos-text">{partyName}</strong>. O
          registro é <strong className="text-bos-text">definitivo</strong>: para corrigir, registre
          outro.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-bos-text">Quando aconteceu</span>
            <input name="occurredAt" type="datetime-local" required className={INPUT} />
            {campos.occurredAt ? (
              <span className="text-xs text-bos-danger">{campos.occurredAt}</span>
            ) : (
              <span className="text-xs text-bos-muted">
                Pode ser no passado — registrar a visita de ontem é o caso comum.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-bos-text">Por onde</span>
            <input
              name="channel"
              required
              maxLength={60}
              placeholder="ligação, visita, e-mail…"
              className={INPUT}
            />
            {campos.channel ? (
              <span className="text-xs text-bos-danger">{campos.channel}</span>
            ) : (
              <span className="text-xs text-bos-muted">
                Texto livre, e de propósito: instrumento de contato é de um país e de uma década.
              </span>
            )}
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-bos-text">O que ficou anotado</span>
          <textarea name="note" rows={2} maxLength={2000} className={INPUT} />
          {campos.note ? <span className="text-xs text-bos-danger">{campos.note}</span> : null}
        </label>

        {erro ? (
          <p role="alert" className="text-sm text-bos-danger">
            {erro}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-bos-accent bg-bos-accent/20 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-accent/30 disabled:opacity-50"
          >
            {pending ? 'Registrando…' : 'Registrar contato'}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="text-xs text-bos-muted transition-colors hover:text-bos-text"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

const INPUT = 'w-full rounded-md border border-bos-border bg-bos-bg px-3 py-2 text-sm text-bos-text';
