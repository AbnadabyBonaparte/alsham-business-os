'use client';

import { useState, useTransition } from 'react';

import type { Space } from '@alsham/spaces';

import { bookReservation, createSpace, setSpaceStatus } from '@/app/spc-actions';
import { Badge, Panel } from '@/components/states';

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Reservar um período — a recusa nomeada vem antes; a constraint decide. */
export function SpcBookForm({ spaces }: { spaces: readonly Space[] }) {
  const [erro, setErro] = useState<string | null>(null);
  const [espaco, setEspaco] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [pending, startTransition] = useTransition();

  const ativos = spaces.filter((s) => s.status === 'active');

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Reservar período</h2>
      <p className="mt-1 text-xs text-bos-muted">
        Meio-aberto: terminar às 12h e começar às 12h convivem. O passado entra — fato consumado.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className={campo} value={espaco} onChange={(e) => setEspaco(e.target.value)}>
          <option value="">— escolha o espaço —</option>
          {ativos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.capacity !== null ? ` (${s.capacity} lugares)` : ''}
            </option>
          ))}
        </select>
        <input className={campo} type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        <span className="text-xs text-bos-muted">até</span>
        <input className={campo} type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
        <input
          className={campo}
          placeholder="finalidade (texto livre)"
          value={finalidade}
          onChange={(e) => setFinalidade(e.target.value)}
        />
        <button
          type="button"
          disabled={pending || espaco === ''}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={() => {
            setErro(null);
            startTransition(async () => {
              const r = await bookReservation({
                spaceId: espaco,
                purpose: finalidade,
                startsAt: inicio,
                endsAt: fim,
              });
              if (!r.ok) setErro(r.message);
              else {
                setFinalidade('');
                setInicio('');
                setFim('');
              }
            });
          }}
        >
          Reservar
        </button>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
    </Panel>
  );
}

/** Os espaços do tenant — e o arquivado que VOLTA (a mesma sala). */
export function SpcSetup({
  spaces,
  canSetup,
}: {
  spaces: readonly Space[];
  canSetup: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [capacidade, setCapacidade] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Espaços do tenant</h2>
      <p className="mt-1 text-xs text-bos-muted">
        Sala, quadra, van, cadeira de estúdio — o produto não sabe nem precisa saber o que é.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {spaces.length === 0 ? (
          <span className="text-xs text-bos-muted">Nenhum espaço desenhado ainda.</span>
        ) : (
          spaces.map((s) => (
            <span key={s.id} className="flex items-center gap-1">
              <Badge tone={s.status === 'active' ? 'neutral' : 'warning'}>
                {s.name}
                {s.capacity !== null ? ` · ${s.capacity}` : ''}
              </Badge>
              {canSetup ? (
                <button
                  type="button"
                  disabled={pending}
                  className="text-[11px] text-bos-muted underline hover:text-bos-text"
                  onClick={() =>
                    startTransition(async () => {
                      await setSpaceStatus({
                        spaceId: s.id,
                        status: s.status === 'active' ? 'archived' : 'active',
                      });
                    })
                  }
                >
                  {s.status === 'active' ? 'arquivar' : 'reabrir — é a mesma sala'}
                </button>
              ) : null}
            </span>
          ))
        )}
      </div>
      {canSetup ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
            placeholder="novo espaço"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <input
            className="w-28 rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text"
            placeholder="capacidade"
            inputMode="numeric"
            value={capacidade}
            onChange={(e) => setCapacidade(e.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent"
            onClick={() => {
              setErro(null);
              startTransition(async () => {
                const r = await createSpace({
                  name: nome,
                  description: '',
                  capacity: capacidade.trim() === '' ? null : Number(capacidade),
                });
                if (!r.ok) setErro(r.message);
                else {
                  setNome('');
                  setCapacidade('');
                }
              });
            }}
          >
            Criar
          </button>
          {erro ? <span className="text-xs text-bos-danger">{erro}</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}
