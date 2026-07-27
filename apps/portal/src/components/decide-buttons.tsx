'use client';

import { useState, useTransition } from 'react';

import type { ActionResult } from '@/app/actions';

/**
 * Botões de decisão com **confirmação explícita em dois passos**.
 *
 * Padrão CRIVO: nada que decide ou destrói acontece no primeiro clique. O
 * primeiro clique arma; o segundo confirma; e há sempre uma saída ("cancelar").
 *
 * Optei por confirmação **inline** em vez de `window.confirm()`: o diálogo
 * nativo ignora a identidade visual, não diz o que exatamente vai acontecer e
 * não tem como mostrar o erro que volta do servidor.
 *
 * Este componente não sabe o que é conciliação. Recebe rótulos e uma função,
 * chama, e mostra o que voltou.
 */
export function DecideButtons({
  confirmLabel,
  rejectLabel,
  question,
  onDecide,
  disabled = false,
  disabledHint,
}: {
  confirmLabel: string;
  rejectLabel: string;
  /** O que a pessoa está prestes a fazer, em uma frase. Sem "tem certeza?" vago. */
  question: (choice: 'confirm' | 'reject') => string;
  onDecide: (choice: 'confirm' | 'reject') => Promise<ActionResult>;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [armed, setArmed] = useState<'confirm' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'confirm' | 'reject' | null>(null);
  const [pending, startTransition] = useTransition();

  if (disabled) {
    return (
      <span className="text-xs text-bos-muted" title={disabledHint}>
        {disabledHint ?? 'Sem permissão'}
      </span>
    );
  }

  if (done) {
    return (
      <span className="text-xs text-bos-muted">
        {done === 'confirm' ? confirmLabel : rejectLabel} — registrado
      </span>
    );
  }

  function decide(choice: 'confirm' | 'reject') {
    setError(null);
    startTransition(async () => {
      const result = await onDecide(choice);
      if (result.ok) {
        setDone(choice);
      } else {
        setError(result.message);
        setArmed(null);
      }
    });
  }

  if (armed) {
    return (
      <div className="flex flex-col items-end gap-2">
        <p className="max-w-xs text-right text-xs text-bos-text">{question(armed)}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setArmed(null)}
            disabled={pending}
            className="rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-muted transition-colors duration-200 hover:text-bos-text disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => decide(armed)}
            disabled={pending}
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors duration-200 disabled:opacity-50 ${
              armed === 'confirm'
                ? 'border-bos-success/60 bg-bos-success/20 text-bos-text hover:bg-bos-success/30'
                : 'border-bos-danger/60 bg-bos-danger/20 text-bos-text hover:bg-bos-danger/30'
            }`}
          >
            {pending ? 'Registrando…' : 'Sim, confirmar'}
          </button>
        </div>
        {error ? <p className="max-w-xs text-right text-xs text-bos-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setArmed('reject')}
          className="rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-muted transition-colors duration-200 hover:border-bos-danger/60 hover:text-bos-text"
        >
          {rejectLabel}
        </button>
        <button
          type="button"
          onClick={() => setArmed('confirm')}
          className="rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-text transition-colors duration-200 hover:border-bos-success/60"
        >
          {confirmLabel}
        </button>
      </div>
      {error ? <p className="max-w-xs text-right text-xs text-bos-danger">{error}</p> : null}
    </div>
  );
}
