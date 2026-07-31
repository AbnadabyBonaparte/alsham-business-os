import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Qualidade · CAPA — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Quatorze — Fase 2, Domain Qualidade): schema,
 * RLS, gatilhos e o motor de domínio estão provados no CI. A interface rica —
 * inclusive o quadro por estado (aberta → verificada → fechada) e a nota de
 * verificação — é frente de UI à parte (spec §3). Esta página existe para a
 * rota não apontar para o vazio.
 */
export default function CapaPage() {
  return (
    <>
      <PageHero
        eyebrow="Qualidade · CAPA"
        title="As ações corretivas e preventivas."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="A ação corretiva/preventiva: o tipo corrective/preventive é CHECK (a física do método CAPA, não vocabulário do tenant). O ciclo é open → verified → closed — a VERIFICAÇÃO (a nota de quem confirmou que a ação funcionou) é o que a define: sem verified, não fecha, e closed é terminal. O vínculo à não conformidade (nc) é por id solto. O módulo capa já vive no banco e no motor @alsham/capa."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica (com o quadro por estado e a nota de verificação) vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
