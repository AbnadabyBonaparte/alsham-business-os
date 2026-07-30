import { Suspense } from 'react';

import { PERMISSIONS } from '@alsham/bank-accounts';

import { getBankPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { BankAccountForm, BankTransferForm } from '@/components/bank-forms';
import { BankBoard } from '@/components/bank-board';

export const dynamic = 'force-dynamic';

export default function ContasBancariasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Contas Bancárias" subtitle="Abrindo as contas…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getBankPort();
  try {
    const [permissions, accounts, balances] = await Promise.all([
      port.listPermissions(),
      port.loadAccounts(),
      port.loadBalances(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manageAccount);
    const canRegister = permissions.has(PERMISSIONS.registerMovement);
    const canAdjust = permissions.has(PERMISSIONS.adjustMovement);

    const ativas = accounts.filter((a) => a.status === 'active').length;
    const negativas = balances.filter((b) => b.balanceCents < 0).length;

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Contas Bancárias · o Bloco Financeiro"
          title="A conta é sua; o livro não se rasura."
          accent="A conciliação é do módulo próprio — aqui é o cadastro e o livro."
          subtitle="As contas voltam do arquivo; o livro por conta é imutável; o saldo é a soma do livro e pode ficar negativo (cheque especial); transferir é uma saída e uma entrada na mesma transação. A conciliação bancária não se refaz aqui — é capacidade própria."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ativas > 0 ? 'success' : 'neutral'}>{ativas} conta(s) ativa(s)</Badge>
              {negativas > 0 ? <Badge tone="warning">{negativas} negativa(s)</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <BankAccountForm /> : null}
          {canRegister ? <BankTransferForm accounts={accounts} /> : null}
        </div>
        <BankBoard
          accounts={accounts}
          balances={balances}
          canManage={canManage}
          canRegister={canRegister}
          canAdjust={canAdjust}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Contas Bancárias" subtitle="As contas do tenant." />
        <ErrorState title="Não foi possível abrir as contas." detail={detail} />
      </>
    );
  }
}
