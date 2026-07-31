import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Qualidade · ISO — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Quatorze — o último do Domain Qualidade):
 * schema, RLS, gatilhos e o motor de domínio estão provados no CI. A interface
 * rica — a matriz de conformidade por cláusula — é frente de UI à parte
 * (spec §3). Esta página existe para a rota não apontar para o vazio.
 */
export default function IsoPage() {
  return (
    <>
      <PageHero
        eyebrow="Qualidade · ISO"
        title="Os requisitos de norma."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Os requisitos de norma: a referência da cláusula é texto livre (dado do tenant), e a conformidade — conforme, não conforme ou não aplicável — é MUTÁVEL: uma avaliação que muda a cada auditoria, não um ciclo de vida terminal. O ciclo de arquivamento (active ↔ archived) é outro conceito, reversível, para cláusulas que saem de escopo. O módulo iso já vive no banco e no motor @alsham/iso."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica (com a matriz de conformidade por cláusula) vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
