import { Suspense } from 'react';
import Link from 'next/link';

import { balanceFor, balanceState, ledgerFor, signedQuantity } from '@alsham/inventory';
import type { MovementKind } from '@alsham/inventory';

import { getInvPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, Panel, SectionHeader, TableSkeleton } from '@/components/states';
import { stamp } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ROTULO_KIND: Record<MovementKind, string> = {
  in: 'entrada',
  out: 'saída',
  adjustment: 'ajuste',
};

const TOM_KIND = {
  in: 'success',
  out: 'info',
  adjustment: 'warning',
} as const;

export default async function ExtratoPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo itemId={itemId} />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Extrato" subtitle="Abrindo o livro…" />
      <TableSkeleton rows={6} />
    </>
  );
}

async function Conteudo({ itemId }: { itemId: string }) {
  const port = await getInvPort();
  try {
    const [items, movements] = await Promise.all([port.loadItems(), port.loadMovements()]);
    const item = items.find((i) => i.id === itemId);

    if (!item) {
      return (
        <>
          <SectionHeader title="Extrato" subtitle="Item não encontrado." />
          <ErrorState
            title="Este item não existe (ou não é seu)"
            detail="A RLS só entrega o que é do tenant. Volte para a lista e escolha um item."
          />
          <Link href="/estoque" className="mt-4 inline-block text-sm text-bos-accent">
            ← Voltar ao estoque
          </Link>
        </>
      );
    }

    // O livro e o saldo vêm do PACOTE — a tela não soma nada.
    const livro = ledgerFor(movements, item.id);
    const saldo = balanceFor(movements, item.id);
    const estado = balanceState(saldo);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          title={item.description}
          subtitle={`O livro deste item, do movimento mais recente ao mais antigo.${item.sku ? ` SKU ${item.sku}.` : ''}`}
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={estado === 'negative' ? 'danger' : estado === 'zero' ? 'neutral' : 'success'}>
                saldo {saldo.toLocaleString('pt-BR')} {item.unit}
              </Badge>
              {item.status === 'archived' ? <Badge tone="neutral">arquivado</Badge> : null}
            </div>
          }
        />

        <Link href="/estoque" className="mb-4 inline-block text-sm text-bos-muted hover:text-bos-text">
          ← Voltar ao estoque
        </Link>

        {livro.length === 0 ? (
          <Panel className="px-6 py-8 text-center text-sm text-bos-muted">
            O livro deste item ainda está em branco — nenhum movimento lançado.
          </Panel>
        ) : (
          <Panel className="overflow-x-auto px-0 py-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bos-border text-left text-bos-muted">
                  <th className="px-6 py-3 font-normal">Quando</th>
                  <th className="px-4 py-3 font-normal">Tipo</th>
                  <th className="px-4 py-3 text-right font-normal">Quantidade</th>
                  <th className="px-4 py-3 font-normal">Razão</th>
                  <th className="px-4 py-3 font-normal">Referência</th>
                  <th className="px-6 py-3 font-normal">Local</th>
                </tr>
              </thead>
              <tbody>
                {livro.map((m) => {
                  const assinada = signedQuantity(m.kind, m.quantity);
                  return (
                    <tr key={m.id} className="border-b border-bos-border last:border-0">
                      <td className="px-6 py-3 text-bos-muted tabular">{stamp(m.occurredAt)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={TOM_KIND[m.kind]}>{ROTULO_KIND[m.kind]}</Badge>
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular ${assinada < 0 ? 'text-bos-danger' : 'text-bos-text'}`}
                      >
                        {assinada > 0 ? '+' : ''}
                        {assinada.toLocaleString('pt-BR')} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-bos-muted">{m.reason || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-bos-muted">
                        {m.externalRef ?? '—'}
                      </td>
                      <td className="px-6 py-3 text-bos-muted">{m.location ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}
      </>
    );
  } catch (err) {
    const detail =
      err instanceof DataPortError
        ? err.message
        : 'Falha ao carregar o extrato. Se o schema inv não estiver exposto na Data API, a tela fica vazia sem erro claro.';
    return (
      <>
        <SectionHeader title="Extrato" subtitle="Não foi possível carregar." />
        <ErrorState title="Erro ao carregar" detail={detail} />
      </>
    );
  }
}
