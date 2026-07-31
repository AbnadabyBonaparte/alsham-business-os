import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Energia · Usinas — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Vinte — o Vertical Energia): schema, RLS,
 * gatilhos e o motor @alsham/plant estão provados no CI. Esta página existe
 * para a rota não apontar para o vazio.
 */
export default function UsinasPage() {
  return (
    <>
      <PageHero
        eyebrow="Energia · Usinas"
        title="A unidade geradora — e a geração distribuída são a mesma coisa."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O cadastro da usina: nome, localização, capacidade instalada (kWp) e o tipo/porte em texto livre — porque Usinas e Geração distribuída, na física, são o mesmo objeto (a GD é uma usina de porte menor, atrás do medidor). A usina desativada que volta a operar é a mesma (active ↔ archived). Manutenção é o módulo de Manutenção; contrato é o de Contratos; geração é o Monitoramento — todos por vínculo solto. O módulo plant já vive no banco e no motor @alsham/plant."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; o parque de usinas e o mapa de capacidade vêm numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
