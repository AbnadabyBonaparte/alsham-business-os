import { Suspense } from 'react';

import { buildShelf, summarizeShelf } from '@alsham/permissions';

import { getStorePort, DataPortError } from '@/lib/data';
import { DemoNotice, ErrorState, PageHero, SectionHeader, TableSkeleton } from '@/components/states';
import { StoreShelf } from '@/components/store-shelf';

export const dynamic = 'force-dynamic';

export default function StorePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Store" subtitle="Carregando a vitrine…" />
      <TableSkeleton rows={2} />
    </>
  );
}

/**
 * A Store — onde a tese vira produto visível.
 *
 * ⭐ **A tela não decide o que aparece.** Ela pede o catálogo e recebe só o
 * que está publicado, porque a policy `module_registry_select_published` do
 * `0001_core.sql` esconde `draft` e `deprecated`. Se o filtro estivesse aqui,
 * um dia alguém escreveria uma segunda consulta sem ele.
 *
 * ⚠️ **O que instalar significa, e o que não significa.** Instalar grava a
 * linha do tenant e concede as permissões do manifesto — isso é ACESSO. O
 * consumo de evento entre módulos é **código**: o handler existe no
 * repositório e é inscrito à mão na composição (`apps/api`). Não há plugin
 * dinâmico, e a tela diz isso em vez de deixar subentendido.
 */
async function Conteudo() {
  const port = await getStorePort();

  try {
    const [catalog, tenantModules, permissions, roles, limite] = await Promise.all([
      port.loadCatalog(),
      port.loadTenantModules(),
      port.listCorePermissions(),
      port.loadTenantRoles(),
      port.loadModuleLimit(),
    ]);

    const items = buildShelf(catalog, tenantModules);
    const resumo = summarizeShelf(items);
    const canInstall = permissions.has('core.module.install');

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <PageHero
          eyebrow="A Store · o catálogo da plataforma"
          title="A empresa não compra um sistema."
          accent="Ela monta o dela."
          subtitle="Core mais módulos, como Lego: instalar dá acesso e concede as permissões do manifesto — e desinstalar não apaga nada."
        />

        {/* Os badges de resumo agora vivem DENTRO da prateleira: são toggle de
            filtro, e o estado do filtro é local ao client component que desenha
            as seções que ele filtra. */}
        <StoreShelf
          items={items}
          roles={roles}
          canInstall={canInstall}
          resumo={resumo}
          limite={limite}
        />

        <div className="mt-6 flex max-w-3xl flex-col gap-3 text-xs text-bos-muted">
          <p>
            Instalar grava a linha do tenant e concede as permissões do manifesto ao papel
            escolhido — o passo 3 e o passo 4 do ciclo de vida do módulo. Desinstalar corta o
            acesso e revoga as permissões, e{' '}
            <strong className="text-bos-text">não apaga nada</strong>: o que o módulo gravou
            continua no banco.
          </p>
          <p>
            <strong className="text-bos-text">O que instalar não faz:</strong> não carrega código
            novo. Um módulo que escuta o fato de outro só reage porque o handler dele existe neste
            repositório e está inscrito na composição do Core. Instalar dá acesso; a integração é
            código, e está escrita — não é plugin que aparece sozinho.
          </p>
        </div>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Store" />
        <ErrorState
          title="Não foi possível carregar a vitrine"
          detail={
            err instanceof DataPortError
              ? err.message
              : 'Erro inesperado ao falar com a fonte de dados.'
          }
        />
      </>
    );
  }
}
