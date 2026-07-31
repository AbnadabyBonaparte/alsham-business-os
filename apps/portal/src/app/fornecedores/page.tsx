import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Compras · Fornecedores — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dez — completar o Domain Compras): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function FornecedoresPage() {
  return (
    <>
      <PageHero
        eyebrow="Compras · Fornecedores"
        title="O cadastro de fornecedores."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Nome e segmento em texto livre; o fornecedor volta do arquivo (o DIVERGE do hr). O módulo vendor já vive no banco e no motor @alsham/vendor."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
