import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * As políticas internas — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Missão Oito): schema, RLS, gatilhos e o motor de
 * domínio estão provados no CI. A interface rica — lista, formulário, estados —
 * é frente de UI à parte, como a spec §3 do módulo declara. Esta página existe
 * para a rota do menu não apontar para o vazio (há teste que confere), e é
 * honesta sobre o que ainda não tem: nenhum dado inventado.
 */
export default function PoliticasPage() {
  return (
    <>
      <PageHero
        eyebrow="RH · Políticas"
        title="As políticas internas."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Política tem versão: publicar congela o corpo, e a ciência é por versão. O módulo pol já vive no banco e no motor @alsham/policies."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
