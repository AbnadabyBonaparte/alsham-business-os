'use client';

import { useState, useTransition } from 'react';

import { createAsset } from '@/app/media-actions';
import { Panel } from '@/components/states';

const campo =
  'w-full rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-sm text-bos-text';

/** Catalogar uma obra — nasce no acervo; a validação é do pacote. */
export function MediaAssetForm() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState('');
  const [endereco, setEndereco] = useState('');

  if (!aberto) {
    return (
      <button
        type="button"
        className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
        onClick={() => setAberto(true)}
      >
        Catalogar obra
      </button>
    );
  }

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await createAsset({
        title: titulo,
        description: descricao,
        assetType: tipo,
        location: endereco,
      });
      if (!r.ok) setErro(r.message);
      else {
        setAberto(false);
        setTitulo(''); setDescricao(''); setTipo(''); setEndereco('');
      }
    });
  }

  return (
    <Panel className="px-6 py-5">
      <h2 className="font-display text-lg text-bos-text">Nova obra no acervo</h2>
      <p className="mt-1 text-xs text-bos-muted">
        O módulo cataloga e aponta — o arquivo mora onde mora. Diga ONDE ele vive: uma URL, o drive, o HD da sala 2.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-bos-muted">
          Título*
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="text-xs text-bos-muted">
          Tipo (texto livre, opcional)
          <input className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="foto · vetor · áudio · peça de vitrine…" />
        </label>
        <label className="text-xs text-bos-muted sm:col-span-2">
          Onde vive*
          <input className={campo} value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="https://… ou 'HD externo da sala 2'" />
        </label>
        <label className="text-xs text-bos-muted sm:col-span-2">
          Descrição
          <textarea className={campo} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
      </div>
      {erro ? <p className="mt-2 text-sm text-bos-danger">{erro}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-bos-accent px-3 py-1.5 text-sm font-medium text-bos-bg hover:bg-bos-accent-hover"
          onClick={enviar}
        >
          Catalogar — entra no acervo
        </button>
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-sm text-bos-muted hover:text-bos-text"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </button>
      </div>
    </Panel>
  );
}
