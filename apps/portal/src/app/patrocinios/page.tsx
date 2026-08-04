import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Patrocínios — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Eventos — Vertical 🎪 Eventos): schema, RLS, a
 * cota de patrocínio (active↔archived) e o checklist de entregáveis de ativação
 * estão provados no CI. A interface rica é frente de UI à parte. Esta página
 * existe para a rota do menu não apontar para o vazio (há teste que confere).
 */
export default function PatrociniosPage() {
  return (
    <>
      <PageHero
        eyebrow="Eventos · Patrocínios"
        title="A cota de patrocínio e os entregáveis de ativação."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="A cota (tier em texto livre), o valor e o checklist de ativação por evento (logo no palco, cortesias, foyer). O contrato jurídico continua no ctr e a negociação no deal (id solto). O módulo sponsor já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
