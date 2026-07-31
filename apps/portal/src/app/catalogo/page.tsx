import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Varejo & Supermercados · Catálogo de Produtos — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezoito — o Vertical Varejo & Supermercados):
 * schema, RLS, gatilhos e o motor @alsham/catalog estão provados no CI. Esta
 * página existe para a rota não apontar para o vazio.
 */
export default function CatalogoPage() {
  return (
    <>
      <PageHero
        eyebrow="Varejo & Supermercados · Catálogo"
        title="O cadastro do que a loja vende."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Nome, um SKU em texto livre (opcional — nem toda casa usa código) e o preço de tabela, valor e moeda juntos. É o quanto custa hoje; o preço efetivo de cada venda vive no item do cupom. O produto descontinuado que volta é o mesmo produto (active ↔ archived). O estoque de varejo é o módulo de estoque genérico, por referência solta. O módulo catalog já vive no banco e no motor @alsham/catalog."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a grade de produtos com busca e a edição de preço vêm numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
