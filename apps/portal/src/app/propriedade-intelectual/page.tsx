import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * P&D · Propriedade Intelectual — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezesseis): schema, RLS, gatilhos e o motor
 * @alsham/ip estão provados no CI. A tela rica (o acervo por tipo, o ciclo de
 * cada ativo) é frente de UI à parte. Esta página existe para a rota não
 * apontar para o vazio.
 */
export default function PropriedadeIntelectualPage() {
  return (
    <>
      <PageHero
        eyebrow="P&D · Propriedade Intelectual"
        title="O acervo de PI."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cada ativo tem um tipo entre as quatro categorias clássicas do direito — patente, marca, direito autoral, segredo industrial (física do método, não vocabulário da casa). O ciclo é filed → granted/rejected e granted → expired, terminal: um indeferido ou expirado que volta é um depósito novo. A origem (de qual ideia ou projeto nasceu) fica por id solto. O módulo ip já vive no banco e no motor @alsham/ip."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; o acervo por tipo e o ciclo de cada ativo vêm numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
