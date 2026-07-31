import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Supply Chain · S&OP — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Onze — o Domain Supply Chain): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function SopPage() {
  return (
    <>
      <PageHero
        eyebrow="Supply Chain · S&OP"
        title="As rodadas de consenso."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="A camada de governança sobre o plano de demanda (por id solto); APROVAR fecha o consenso e é terminal, com permissão própria (papel mais sênior). O módulo sop já vive no banco e no motor @alsham/sop."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
