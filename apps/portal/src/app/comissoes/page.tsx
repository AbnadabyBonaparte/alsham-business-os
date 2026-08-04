import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Comissões — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Beleza — Vertical 💇 Beleza & Estética): schema,
 * RLS e o livro imutável de comissões (a física do timesheet) estão provados no
 * CI. A interface rica é frente de UI à parte. Esta página existe para a rota do
 * menu não apontar para o vazio (há teste que confere).
 */
export default function ComissoesPage() {
  return (
    <>
      <PageHero
        eyebrow="Beleza · Comissões"
        title="O livro de comissões por serviço."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cada lançamento é imutável: profissional (id solto), serviço (texto livre) e o valor registrado — nunca calculado por regra de % (Lei 7). Corrigir é lançar o ato inverso. O módulo commission já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
