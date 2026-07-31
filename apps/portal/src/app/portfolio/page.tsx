import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * PMO & Projetos · Portfólio — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * ⭐⭐ A ÚLTIMA peça: com este módulo o Domain PMO & Projetos — o MAIOR do mapa —
 * chega às 10/10 capacidades. O módulo nasceu no banco (Onda Treze): schema,
 * RLS, gatilhos e o motor de domínio estão provados no CI. A interface rica —
 * inclusive a leitura dos projetos de cada portfólio — é frente de UI à parte
 * (spec §3). Esta página existe para a rota não apontar para o vazio.
 */
export default function PortfolioPage() {
  return (
    <>
      <PageHero
        eyebrow="PMO & Projetos · Portfólio"
        title="Os portfólios de projetos."
        accent="Instalado — o Domain PMO & Projetos está completo (10/10)."
        subtitle="O agrupamento de projetos para leitura executiva: nome e descrição em texto livre, active ↔ archived (o portfólio é leitura que arquiva e volta), e os projetos reunidos por membros N:N — o MESMO projeto pode viver em vários portfólios. O módulo pfolio já vive no banco e no motor @alsham/pfolio."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
