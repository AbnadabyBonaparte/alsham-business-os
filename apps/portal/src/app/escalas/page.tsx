import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * A escala de trabalho — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Missão Oito): schema, RLS, gatilhos e o motor de
 * domínio estão provados no CI. A interface rica — lista, formulário, estados —
 * é frente de UI à parte, como a spec §3 do módulo declara. Esta página existe
 * para a rota do menu não apontar para o vazio (há teste que confere), e é
 * honesta sobre o que ainda não tem: nenhum dado inventado.
 */
export default function EscalasPage() {
  return (
    <>
      <PageHero
        eyebrow="RH · Escalas"
        title="A escala de trabalho."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Turno em texto livre; duas escalas não ocupam o mesmo colaborador no mesmo período (o banco recusa). O módulo shift já vive no banco e no motor @alsham/shift-scheduling."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
