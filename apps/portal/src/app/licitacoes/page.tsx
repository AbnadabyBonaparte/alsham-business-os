import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * As licitações públicas — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Governo — Vertical 🏛 Governo): schema, RLS, o
 * edital que congela ao publicar e a homologação terminal estão provados no CI.
 * A interface rica é frente de UI à parte. Esta página existe para a rota do
 * menu não apontar para o vazio (há teste que confere), e é honesta: nenhum
 * dado inventado.
 */
export default function LicitacoesPage() {
  return (
    <>
      <PageHero
        eyebrow="Governo · Licitações"
        title="A licitação pública, ancorada no edital."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O órgão publica o edital (que congela), recebe as propostas dos licitantes e homologa um vencedor (Lei 14.133). A publicação no PNCP é integração (Lei 3). O módulo bid já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
