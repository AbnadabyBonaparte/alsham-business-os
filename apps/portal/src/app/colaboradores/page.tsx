import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * O roster da empresa — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Missão Oito): schema, RLS, gatilhos e o motor de
 * domínio estão provados no CI. A interface rica — lista, formulário, estados —
 * é frente de UI à parte, como a spec §3 do módulo declara. Esta página existe
 * para a rota do menu não apontar para o vazio (há teste que confere), e é
 * honesta sobre o que ainda não tem: nenhum dado inventado.
 */
export default function ColaboradoresPage() {
  return (
    <>
      <PageHero
        eyebrow="RH · Colaboradores"
        title="O roster da empresa."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cargo e departamento em texto livre; o afastamento volta, o desligamento é terminal. O módulo hr já vive no banco e no motor @alsham/hr."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
