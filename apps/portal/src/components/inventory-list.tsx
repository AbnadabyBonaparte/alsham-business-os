'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { canArchive, canReactivate } from '@alsham/inventory';
import type { ItemBalance } from '@alsham/inventory';

import { changeItemStatus } from '@/app/inv-actions';
import { Badge, EmptyState, Panel } from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

/**
 * A lista de itens — agora TABELA DE VERDADE (Mandato de Beleza). Cada item é
 * uma linha: identidade (descrição + SKU), unidade, e o SALDO à direita com
 * tabular figures. O saldo é CALCULADO — recebido pronto do pacote
 * (`buildBalances`), nunca somado aqui.
 *
 * ⭐ **Saldo negativo aparece em vermelho** dizendo "investigue": ele é
 * permitido de propósito (0023 §4.1), e escondê-lo — ou grampeá-lo em zero —
 * seria maquiar o livro. Nunca se clampa.
 *
 * O extrato de movimentos, o arquivar (com a confirmação em dois passos que já
 * existia) e o reativar vivem numa LINHA EXPANSÍVEL. Este componente não decide
 * nada: se pode arquivar e se pode reativar são perguntas feitas a
 * `@alsham/inventory`.
 */
export function InventoryList({
  rows,
  canManage,
}: {
  rows: readonly ItemBalance[];
  canManage: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhum item cadastrado"
        hint="Cadastre o primeiro acima. O saldo nasce do livro de movimentos — calculado, nunca digitado."
      />
    );
  }

  return (
    <Panel className="px-2 py-1.5">
      <Table>
        <THead>
          <TR>
            <TH>Item</TH>
            <TH>Unidade</TH>
            <TH num>Saldo</TH>
            <TH>Situação</TH>
            <TH className="w-8" />
          </TR>
        </THead>
        <TBody>
          {rows.map((b) => (
            <ItemRowItem key={b.item.id} row={b} canManage={canManage} />
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}

function ItemRowItem({ row, canManage }: { row: ItemBalance; canManage: boolean }) {
  const [aberto, setAberto] = useState(false);
  const { item, balance, state, movementCount } = row;
  const painelId = `item-${item.id}`;
  const negativo = state === 'negative';

  return (
    <>
      <TR className="transition-colors hover:bg-bos-elevated/30">
        <TD>
          <span className="text-bos-text">{item.description}</span>
          {item.sku ? (
            <span className="ml-2 font-mono text-[11px] text-bos-muted">{item.sku}</span>
          ) : null}
        </TD>
        <TD className="whitespace-nowrap text-bos-muted">{item.unit}</TD>
        <TD num className="whitespace-nowrap">
          <span className={negativo ? 'text-bos-danger' : 'text-bos-text'}>
            {balance.toLocaleString('pt-BR')}
          </span>
        </TD>
        <TD className="whitespace-nowrap">
          {item.status === 'archived' ? (
            <Badge tone="neutral">arquivado</Badge>
          ) : (
            <Badge tone="success">ativo</Badge>
          )}
          {negativo ? (
            <span className="ml-2">
              <Badge tone="danger">saldo negativo — investigue</Badge>
            </span>
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
              <p className="text-sm text-bos-muted tabular">
                {movementCount} movimento(s) no livro.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/estoque/${item.id}`}
                  className="rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-surface"
                >
                  Extrato
                </Link>

                {canManage ? <StatusButton row={row} /> : null}
              </div>
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

function StatusButton({ row }: { row: ItemBalance }) {
  const { item } = row;
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(to: 'active' | 'archived') {
    setErro(null);
    startTransition(async () => {
      const r = await changeItemStatus({ itemId: item.id, to });
      if (!r.ok) setErro(r.message);
      else setConfirmArchive(false);
    });
  }

  return (
    <>
      {canArchive(item.status) ? (
        confirmArchive ? (
          <>
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-bos-danger/50 px-3 py-1.5 text-xs text-bos-danger transition-colors hover:bg-bos-danger/15 disabled:opacity-50"
              onClick={() => run('archived')}
            >
              {pending ? 'Aplicando…' : 'Confirmar arquivar'}
            </button>
            <button
              type="button"
              className="text-xs text-bos-muted transition-colors hover:text-bos-text"
              onClick={() => setConfirmArchive(false)}
            >
              Não fazer nada
            </button>
          </>
        ) : (
          <button
            type="button"
            className="rounded-md border border-bos-danger/50 px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-danger/15"
            onClick={() => setConfirmArchive(true)}
          >
            Arquivar
          </button>
        )
      ) : null}

      {canReactivate(item.status) ? (
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-bos-border px-3 py-1.5 text-xs text-bos-text transition-colors hover:bg-bos-surface disabled:opacity-50"
          onClick={() => run('active')}
        >
          {pending ? 'Aplicando…' : 'Reativar'}
        </button>
      ) : null}

      {erro ? (
        <p role="alert" className="w-full text-xs text-bos-danger">
          {erro}
        </p>
      ) : null}
    </>
  );
}
