import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Os programas e turmas — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Missão Oito): schema, RLS, gatilhos e o motor de
 * domínio estão provados no CI. A interface rica — lista, formulário, estados —
 * é frente de UI à parte, como a spec §3 do módulo declara. Esta página existe
 * para a rota do menu não apontar para o vazio (há teste que confere), e é
 * honesta sobre o que ainda não tem: nenhum dado inventado.
 */
export default function TreinamentosPage() {
  return (
    <>
      <PageHero
        eyebrow="RH · Treinamentos"
        title="Os programas e turmas."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Turma publicada abre inscrição; a presença é ato imutável. O módulo train já vive no banco e no motor @alsham/training."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
