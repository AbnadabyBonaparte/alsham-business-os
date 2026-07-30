import { Suspense } from 'react';

import { orderAssets, PERMISSIONS, summarizeAssets } from '@alsham/assets';

import { getPatPort, DataPortError } from '@/lib/data';
import type { AssetRow } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { PatAssetForm, PatSetup } from '@/components/pat-forms';
import { PatBook } from '@/components/pat-book';

export const dynamic = 'force-dynamic';

export default function PatrimonioPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Patrimônio" subtitle="Abrindo o livro…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getPatPort();
  try {
    const [permissions, assets, transfers, categories] = await Promise.all([
      port.listPermissions(),
      port.loadAssets(),
      port.loadTransfers(),
      port.loadCategories(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canDecide = permissions.has(PERMISSIONS.decide);
    const canSetup = permissions.has(PERMISSIONS.setup);

    // ⭐ O resumo e a ordem do livro são do PACOTE.
    const resumo = summarizeAssets(assets);
    const livro = orderAssets(assets) as readonly AssetRow[];

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Patrimônio · operações"
          title="Cada bem tem lugar."
          accent="E o lugar é o livro quem diz."
          subtitle="A localização vigente é calculada dos atos de transferência — ninguém a digita. A baixa é terminal, com a razão escrita: o bem que volta é aquisição nova."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{resumo.active} ativo(s)</Badge>
              <Badge tone={resumo.writtenOff > 0 ? 'warning' : 'neutral'}>
                {resumo.writtenOff} baixado(s)
              </Badge>
              {!canDecide ? <Badge tone="neutral">sem pat.asset.decide</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <PatAssetForm categories={categories} /> : null}
          <PatSetup categories={categories} canSetup={canSetup} />
        </div>
        <PatBook
          assets={livro}
          transfers={transfers}
          categories={categories}
          canManage={canManage}
          canDecide={canDecide}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Patrimônio" subtitle="O livro de bens do tenant." />
        <ErrorState title="Não foi possível abrir o livro." detail={detail} />
      </>
    );
  }
}
