import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { loadSecretPage } from '@/lib/data/secret-page';
import { Panel } from '@/components/states';
import { MarkdownLite } from '@/components/markdown-lite';

// ⛔ Sempre dinâmica: a página resolve por sessão + slug a cada acesso; nunca
// se pré-gera (não haveria o que gerar — o conteúdo vive no banco do tenant).
export const dynamic = 'force-dynamic';

// ⛔ Fora dos buscadores, por garantia: uma página reservada não se indexa.
// (A cerca real é o login + a RLS; isto é só defesa em profundidade.)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * ⭐ **A ROTA GENÉRICA DAS PÁGINAS RESERVADAS — `/p/[slug]`.**
 *
 * Uma só rota serve QUALQUER página reservada de QUALQUER tenant. Nada aqui
 * conhece "Nilo", "Bernardo" ou nome nenhum — o conteúdo vem do banco
 * (`core.secret_pages`, 0120), inserido pelo dono, nunca do código (§3).
 *
 * ⛔ DUAS CAMADAS: exige login válido no tenant (a porta de dados devolve `null`
 * sem sessão) E conhecer o slug exato (a RLS resolve só dentro do próprio
 * tenant). Sem qualquer uma → 404, sem revelar se o endereço existe.
 *
 * ⚠️ NÃO aparece em navegação, busca (Ctrl+K) nem sitemap: o menu é montado por
 * `visibleMenu()` (catálogo de módulos), esta rota é um segmento dinâmico solto
 * — não há como ela entrar naquela lista. E o portal não tem sitemap.
 */
export default async function SecretPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await loadSecretPage(slug);

  // Sem sessão, sem vínculo, ou slug que não resolve: 404 honesto. Nunca uma
  // tela que diz "existe, mas você não pode ver" — isso já seria revelar.
  if (page === null) notFound();

  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="bos-eyebrow mb-3">Documento reservado</p>
        <h1 className="bos-hero-title">{page.title}</h1>
      </header>

      <Panel className="px-6 py-8 sm:px-10 sm:py-10">
        <MarkdownLite source={page.body} />
      </Panel>
    </article>
  );
}
