import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * A ouvidoria do cidadão — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Governo — Vertical 🏛 Governo): schema, RLS e
 * o anonimato-físico (a manifestação anônima nunca grava o cidadão) estão
 * provados no CI. A interface rica é frente de UI à parte. Esta página existe
 * para a rota do menu não apontar para o vazio (há teste que confere), e é
 * honesta: nenhum dado inventado.
 */
export default function OuvidoriaPage() {
  return (
    <>
      <PageHero
        eyebrow="Governo · Ouvidoria"
        title="A ouvidoria do cidadão (Lei 13.460)."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="A manifestação nasce imutável; o anonimato é físico — se anônima, o cidadão nunca é gravado, e ele acompanha pelo protocolo público. O módulo ombuds já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
