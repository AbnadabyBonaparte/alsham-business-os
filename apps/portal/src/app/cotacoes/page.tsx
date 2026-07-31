import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Compras · Cotações — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dez — completar o Domain Compras): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function CotacoesPage() {
  return (
    <>
      <PageHero
        eyebrow="Compras · Cotações"
        title="A cotação ao mercado (RFQ)."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Enviar congela o conteúdo; ao final, o comprador premia um fornecedor vencedor (o DIVERGE do quote, onde quem decide é o cliente). O módulo rfq já vive no banco e no motor @alsham/rfq."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
