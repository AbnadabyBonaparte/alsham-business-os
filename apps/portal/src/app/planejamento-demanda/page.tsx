import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Supply Chain · Planejamento de Demanda — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Onze — o Domain Supply Chain): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function PlanejamentoDemandaPage() {
  return (
    <>
      <PageHero
        eyebrow="Supply Chain · Planejamento de Demanda"
        title="O plano de demanda por período."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Período e linhas em texto livre; PUBLICAR congela as linhas e é terminal (o DIVERGE do rfq — não há segundo ato). O módulo dem já vive no banco e no motor @alsham/dem."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
