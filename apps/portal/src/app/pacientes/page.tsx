import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * O cadastro de pacientes — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Vinte e Um — Vertical Saúde): schema, RLS,
 * gatilhos e o ciclo active↔archived estão provados no CI. A interface rica é
 * frente de UI à parte. Esta página existe para a rota do menu não apontar para
 * o vazio (há teste que confere), e é honesta: nenhum dado inventado.
 */
export default function PacientesPage() {
  return (
    <>
      <PageHero
        eyebrow="Saúde · Pacientes"
        title="O cadastro demográfico."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Vala própria (não o CRM — dado sensível não se mistura com contato comercial); nº de prontuário e plano em texto livre. O módulo patient já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
