import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Compras · Estoque Mínimo — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dez — completar o Domain Compras): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. ⭐⭐ A comparação
 * "estoque atual < mínimo" é da CAMADA DE APRESENTAÇÃO (needsReorder() do
 * @alsham/reorder), alimentada com o saldo de fora — este módulo nunca lê o inv.
 * A interface rica é frente de UI à parte (spec §3).
 */
export default function EstoqueMinimoPage() {
  return (
    <>
      <PageHero
        eyebrow="Compras · Estoque Mínimo"
        title="O ponto de reabastecimento."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Produto e quantidade mínima; a comparação com o saldo é da tela (needsReorder), nunca uma view entre schemas. O módulo reorder já vive no banco e no motor @alsham/reorder."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
