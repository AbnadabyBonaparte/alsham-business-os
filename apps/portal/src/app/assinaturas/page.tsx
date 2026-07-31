import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Energia · Assinatura de Energia — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Vinte — o Vertical Energia): schema, RLS,
 * gatilhos e o motor @alsham/subscription estão provados no CI.
 */
export default function AssinaturasPage() {
  return (
    <>
      <PageHero
        eyebrow="Energia · Assinatura de Energia"
        title="O consumidor assina uma fatia da geração de uma usina."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O modelo de negócio central da Curva C solar: cliente, usina e o percentual de alocação (0 a 100%). A assinatura nasce ativa — sem um 'pending' que seria o rito de uma distribuidora, não do produto. E o cancelamento é terminal: quem re-assina negocia outra fatia, uma assinatura nova. O módulo subscription já vive no banco e no motor @alsham/subscription."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a carteira de assinantes e o mapa de alocação por usina vêm numa frente de UI própria."
      />
    </>
  );
}
