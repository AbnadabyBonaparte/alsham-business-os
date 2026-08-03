'use client';

import { useState, useTransition } from 'react';

import { canEditAsset, canWriteOff, currentLocation } from '@alsham/assets';
import type { AssetTransfer, PatCategory } from '@alsham/assets';

import { transferAsset, writeOffAsset } from '@/app/pat-actions';
import type { AssetRow } from '@/lib/data';
import { money, shortDate } from '@/lib/format';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * O livro de bens — agora TABELA DE VERDADE (Mandato de Beleza). Cada bem é
 * uma LINHA: identidade, o LUGAR VIGENTE (⭐ calculado dos atos de
 * transferência — nunca lido de coluna, e a linha NÃO é editável), a situação
 * e a aquisição (valor/data à direita com tabular figures). Transferir, ⭐⭐
 * **baixar (TERMINAL e DESTRUTIVO — com razão e confirmação em dois passos)** e
 * o livro do lugar vivem numa LINHA EXPANSÍVEL.
 *
 * ⭐ **Este componente não decide nada.** O lugar vigente, se pode editar e se
 * pode baixar são perguntas feitas a `@alsham/assets`.
 */

const campo =
  'rounded-md border border-bos-border bg-bos-bg px-2 py-1.5 text-xs text-bos-text';

export function PatBook({
  assets,
  transfers,
  categories,
  canManage,
  canDecide,
}: {
  assets: readonly AssetRow[];
  transfers: readonly AssetTransfer[];
  categories: readonly PatCategory[];
  canManage: boolean;
  canDecide: boolean;
}) {
  if (assets.length === 0) {
    return (
      <EmptyState
        title="Nenhum bem no livro"
        hint="Cadastre o primeiro — nome, etiqueta e onde ele está. O resto é história que o livro escreve."
      />
    );
  }

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Bem</TH>
            <TH>Local atual</TH>
            <TH>Situação</TH>
            <TH num>Aquisição</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {assets.map((a) => (
            <PatRowItem
              key={a.id}
              asset={a}
              transfers={transfers}
              categories={categories}
              canManage={canManage}
              canDecide={canDecide}
            />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function PatRowItem({
  asset: a,
  transfers,
  categories,
  canManage,
  canDecide,
}: {
  asset: AssetRow;
  transfers: readonly AssetTransfer[];
  categories: readonly PatCategory[];
  canManage: boolean;
  canDecide: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [destino, setDestino] = useState('');
  const [nota, setNota] = useState('');
  const [razao, setRazao] = useState('');
  const [baixando, setBaixando] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [pending, startTransition] = useTransition();

  // ⭐ A localização vigente é do PACOTE — a tela não decide lugar.
  const vigente = currentLocation(a, transfers);
  const categoria = categories.find((c) => c.id === a.categoryId)?.name ?? null;
  const atosDoBem = transfers.filter((t) => t.assetId === a.id);
  const baixado = a.status === 'written_off';
  const painelId = `pat-${a.id}`;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.message ?? 'Não deu.');
      else {
        setMovendo(false);
        setBaixando(false);
        setDestino('');
        setNota('');
        setRazao('');
      }
    });
  }

  const temAquisicao =
    a.acquisitionCostCents !== null && a.currency !== null;

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{a.name}</span>
          <span className="ml-2 font-mono text-[11px] text-bos-muted">{a.code}</span>
          {categoria ? (
            <span className="mt-0.5 block text-xs text-bos-muted">{categoria}</span>
          ) : null}
        </TD>
        <TD className="text-bos-muted">{vigente}</TD>
        <TD className="whitespace-nowrap">
          <Badge tone={baixado ? 'neutral' : 'success'}>{baixado ? 'baixado' : 'ativo'}</Badge>
          {baixado ? (
            <span className="mt-0.5 block text-[11px] text-bos-muted">
              em {a.writtenOffAt ? shortDate(a.writtenOffAt) : '—'}
            </span>
          ) : null}
        </TD>
        <TD num className="whitespace-nowrap text-bos-muted">
          {temAquisicao ? money(a.acquisitionCostCents!, a.currency!) : '—'}
          {a.acquiredOn ? (
            <span className="mt-0.5 block text-[11px]">{shortDate(a.acquiredOn)}</span>
          ) : null}
        </TD>
        <TD className="text-right">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={painelId}
            className="text-[11px] text-bos-muted transition-colors hover:text-bos-text"
          >
            {aberto ? 'fechar' : 'detalhes'}
          </button>
        </TD>
      </TR>

      {aberto ? (
        <TR>
          <TD colSpan={5} className="bg-bos-elevated/20">
            <div id={painelId} className="flex flex-col gap-3 px-1 py-1">
              {baixado ? (
                <p className="text-xs text-bos-muted">
                  Baixado em {a.writtenOffAt ? shortDate(a.writtenOffAt) : '—'} —{' '}
                  {a.writeOffReason}. A baixa é terminal: o bem que volta é aquisição nova.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                {atosDoBem.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setHistorico((h) => !h)}
                    className="rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-surface"
                  >
                    {historico ? 'Fechar o livro do lugar' : `Livro do lugar (${atosDoBem.length})`}
                  </button>
                ) : null}

                {!baixado && canEditAsset(a.status) && canManage && !movendo && !baixando ? (
                  <button type="button" className={botao} onClick={() => setMovendo(true)}>
                    Transferir
                  </button>
                ) : null}

                {!baixado &&
                canEditAsset(a.status) &&
                canDecide &&
                canWriteOff(a.status) &&
                !baixando &&
                !movendo ? (
                  <button type="button" className={botaoPerigo} onClick={() => setBaixando(true)}>
                    Baixar…
                  </button>
                ) : null}
              </div>

              {historico ? (
                <div className="border-l border-bos-border pl-3">
                  {atosDoBem.map((t) => (
                    <p key={t.id} className="text-xs text-bos-muted">
                      {shortDate(t.movedAt)} — de{' '}
                      <span className="text-bos-text">{t.fromLocation}</span> para{' '}
                      <span className="text-bos-text">{t.toLocation}</span>
                      {t.note ? <> · {t.note}</> : null}
                    </p>
                  ))}
                  <p className="mt-1 text-[11px] text-bos-muted">
                    O &ldquo;de onde&rdquo; é carimbado pelo servidor — o livro não aceita rasura.
                  </p>
                </div>
              ) : null}

              {movendo ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={campo}
                    placeholder="para onde?"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                  />
                  <input
                    className={campo}
                    placeholder="nota (opcional)"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                  />
                  <button
                    type="button"
                    className={botao}
                    disabled={pending}
                    onClick={() =>
                      run(() => transferAsset({ assetId: a.id, toLocation: destino, note: nota }))
                    }
                  >
                    Registrar o ato
                  </button>
                  <button type="button" className={botaoNeutro} onClick={() => setMovendo(false)}>
                    Deixar onde está
                  </button>
                </div>
              ) : null}

              {baixando ? (
                <div className="flex w-full flex-col gap-2">
                  {/* ⭐⭐ O passo de confirmação diz a CONSEQUÊNCIA — nunca um "tem certeza?" vago. */}
                  <p className="max-w-2xl text-xs text-bos-muted">
                    A baixa é DEFINITIVA. O Core registra <code className="font-mono">pat.asset.retired</code>{' '}
                    e o bem sai do livro ativo — <span className="text-bos-text">ele NÃO volta</span>. Um
                    bem que reaparece é aquisição nova, com registro novo. A razão fica gravada com a data.
                  </p>
                  <input
                    className={campo}
                    placeholder="a razão — alienação, perda, sucata…"
                    value={razao}
                    onChange={(e) => setRazao(e.target.value)}
                  />
                  {erro ? (
                    <p role="alert" className="text-xs text-bos-danger">
                      {erro}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className={botaoPerigo}
                      disabled={pending}
                      onClick={() => run(() => writeOffAsset({ assetId: a.id, reason: razao }))}
                    >
                      {pending ? 'Baixando…' : 'Confirmar: baixar de vez — é terminal'}
                    </button>
                    <button
                      type="button"
                      className={botaoNeutro}
                      onClick={() => {
                        setBaixando(false);
                        setErro(null);
                      }}
                    >
                      Não fazer nada
                    </button>
                  </div>
                </div>
              ) : null}

              {erro && !baixando ? <p className="text-xs text-bos-danger">{erro}</p> : null}
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

const botao =
  'rounded-md border border-bos-border px-2.5 py-1 text-xs text-bos-text hover:border-bos-accent';
const botaoNeutro = 'rounded-md px-2.5 py-1 text-xs text-bos-muted hover:text-bos-text';
const botaoPerigo =
  'rounded-md border border-bos-danger px-2.5 py-1 text-xs text-bos-danger hover:bg-bos-danger hover:text-bos-bg';
