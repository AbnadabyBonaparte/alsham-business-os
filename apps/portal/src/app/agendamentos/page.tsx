import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Agendamento — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Beleza — Vertical 💇 Beleza & Estética): schema,
 * RLS e a física do no-show (scheduled → attended | no_show | cancelled) estão
 * provados no CI. A interface rica é frente de UI à parte. Esta página existe para
 * a rota do menu não apontar para o vazio (há teste que confere).
 */
export default function AgendamentosPage() {
  return (
    <>
      <PageHero
        eyebrow="Beleza · Agendamento"
        title="A agenda de serviços do salão."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cliente (id solto ao crm, não paciente), profissional e serviço em texto livre, com a física do no-show: comparecimento, falta ou cancelamento, carimbados pelo servidor. O módulo booking já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
