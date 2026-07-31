import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * PMO & Projetos · Riscos — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Treze — FECHA o Domain PMO & Projetos): schema,
 * RLS, gatilhos e o motor de domínio estão provados no CI. A interface rica —
 * inclusive a matriz de leitura por severidade (probabilidade × impacto) — é
 * frente de UI à parte (spec §3). Esta página existe para a rota não apontar
 * para o vazio.
 */
export default function RiscosPage() {
  return (
    <>
      <PageHero
        eyebrow="PMO & Projetos · Riscos"
        title="Os riscos do projeto."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O registro de riscos: probabilidade e impacto na régua 1–5 (física do método), o plano de mitigação e o vínculo ao projeto por id solto. O ciclo tem a física nova — mitigated REABRE (o mesmo risco volta), closed é terminal. A severidade (probabilidade × impacto) é leitura, não decisão. O módulo risk já vive no banco e no motor @alsham/risk."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica (com a matriz de leitura por severidade) vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
