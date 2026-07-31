import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Supply Chain · Centros de Distribuição — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Onze — o Domain Supply Chain): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function CentrosDistribuicaoPage() {
  return (
    <>
      <PageHero
        eyebrow="Supply Chain · Centros de Distribuição"
        title="Os centros de distribuição."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Nome e endereço em texto livre; active ↔ archived — o CD é ativo que volta a operar (o DIVERGE do hr). O módulo dc já vive no banco e no motor @alsham/dc."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
