import { Suspense } from 'react';

import { PERMISSIONS, summarizeShelf } from '@alsham/media';

import { getMediaPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { MediaAssetForm } from '@/components/media-forms';
import { MediaShelf } from '@/components/media-board';

export const dynamic = 'force-dynamic';

export default function MidiaPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Biblioteca de Mídia" subtitle="Abrindo o acervo…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getMediaPort();
  try {
    const [permissions, assets, tags, links, usages] = await Promise.all([
      port.listPermissions(),
      port.loadAssets(),
      port.loadTags(),
      port.loadAssetTags(),
      port.loadUsages(),
    ]);

    const canManage = permissions.has(PERMISSIONS.manage);
    const canRecord = permissions.has(PERMISSIONS.record);

    // ⭐ O resumo é do PACOTE.
    const resumo = summarizeShelf(assets, usages);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Biblioteca de Mídia · o acervo"
          title="Catálogo, não cofre."
          accent="O registro diz onde a obra vive — e o livro diz onde ela já foi usada."
          subtitle="Cada ativo é um registro honesto: título, tipo livre e o endereço da obra (o arquivo mora onde mora — o cofre é capacidade futura do Core). O acervo volta do arquivo; o uso é livro carimbado que não se rasura."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.active > 0 ? 'info' : 'neutral'}>{resumo.active} no acervo</Badge>
              {resumo.archived > 0 ? <Badge tone="neutral">{resumo.archived} no arquivo</Badge> : null}
              <Badge tone="success">{resumo.usages} uso(s) no livro</Badge>
              {!canManage ? <Badge tone="neutral">sem media.asset.manage</Badge> : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-col gap-4">
          {canManage ? <MediaAssetForm /> : null}
        </div>
        <MediaShelf
          assets={assets}
          tags={tags}
          links={links}
          usages={usages}
          canManage={canManage}
          canRecord={canRecord}
        />
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <SectionHeader title="Biblioteca de Mídia" subtitle="O acervo do tenant." />
        <ErrorState title="Não foi possível abrir o acervo." detail={detail} />
      </>
    );
  }
}
