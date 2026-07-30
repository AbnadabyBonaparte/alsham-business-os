import { Suspense } from 'react';

import { PERMISSIONS } from '@alsham/budgets';

import { getBudPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { BudBudgetForm } from '@/components/bud-forms';
import { BudBoard } from '@/components/bud-board';

export const dynamic = 'force-dynamic';

export default function OrcamentosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Orçamentos" subtitle="Abrindo os tetos…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getBudPort();
  try {
    const [permissions, budgets] = await Promise.all([port.listPermissions(), port.loadBudgets()]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canClose = permissions.has(PERMISSIONS.close);

    const ativos = budgets.filter((b) => b.status === 'active').length;
    const estourados = budgets.filter((b) => b.status !== 'draft' && b.realizedCents > b.limitCents).length;

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Orçamentos · o Bloco Financeiro"
          title="A régua não se move no meio do jogo."
          accent="Ativar congela a trave; o realizado vem do caixa."
          subtitle="O orçamento nasce no rascunho e se edita à vontade; ativar congela categoria, período e teto; o realizado é a soma do livro do Fluxo de Caixa que casa a categoria — calculado, nunca digitado. O período fechado é terminal."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ativos > 0 ? 'success' : 'neutral'}>{ativos} ativo(s)</Badge>
              {estourados > 0 ? <Badge tone="warning">{estourados} estourado(s)</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">{canManage ? <BudBudgetForm /> : null}</div>
        <BudBoard budgets={budgets} canManage={canManage} canClose={canClose} />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Orçamentos" subtitle="Os tetos do tenant." />
        <ErrorState title="Não foi possível abrir os orçamentos." detail={detail} />
      </>
    );
  }
}
