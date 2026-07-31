import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Compras · Recebimento — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dez — completar o Domain Compras): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function RecebimentosPage() {
  return (
    <>
      <PageHero
        eyebrow="Compras · Recebimento"
        title="O livro de recebimentos."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cada recebimento é um ato pontual imutável; receber a maior é permitido (a sobra é fato, a física do overpay do ar). O módulo recv já vive no banco e no motor @alsham/recv."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
