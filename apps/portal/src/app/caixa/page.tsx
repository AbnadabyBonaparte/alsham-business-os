import { Suspense } from 'react';

import { PERMISSIONS, balancesByCurrency } from '@alsham/cashflow';

import { getCashPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { CashEntryForm, CategoryManager } from '@/components/cash-forms';
import { CashLedger } from '@/components/cash-ledger';

export const dynamic = 'force-dynamic';

export default function CaixaPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Caixa" subtitle="Carregando o livro…" />
      <TableSkeleton rows={5} />
    </>
  );
}

async function Conteudo() {
  const port = await getCashPort();
  try {
    const [permissions, entries, categories] = await Promise.all([
      port.listPermissions(),
      port.loadEntries(),
      port.loadCategories(),
    ]);

    const canRegister = permissions.has(PERMISSIONS.register);
    const canAdjust = permissions.has(PERMISSIONS.adjust);
    const canManageCategories = permissions.has(PERMISSIONS.categoryManage);

    const today = new Date().toISOString().slice(0, 10);
    // ⭐ O saldo é do PACOTE — a tela não soma nada.
    const saldos = balancesByCurrency(entries);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          title="Caixa"
          subtitle="O livro do realizado: cada linha é eterna, o sinal é do tipo e o saldo é a soma — nunca uma coluna."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              {saldos.map((s) => (
                <Badge key={s.currency} tone={s.balanceCents >= 0 ? 'success' : 'danger'}>
                  {(s.balanceCents / 100).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: s.currency,
                  })}
                </Badge>
              ))}
              {saldos.length === 0 ? <Badge tone="neutral">livro vazio</Badge> : null}
              {!canAdjust ? <Badge tone="neutral">sem cash.entry.adjust</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canRegister || canAdjust ? (
            <CashEntryForm
              categories={categories}
              canRegister={canRegister}
              canAdjust={canAdjust}
              today={today}
            />
          ) : null}
          <CategoryManager categories={categories} canManage={canManageCategories} />
        </div>
        <CashLedger entries={entries} categories={categories} />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Caixa" subtitle="O livro do realizado." />
        <ErrorState title="Não foi possível carregar o livro-caixa." detail={detail} />
      </>
    );
  }
}
