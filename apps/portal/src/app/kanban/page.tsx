import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * PMO & Projetos · Kanban — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Doze — o Domain PMO & Projetos): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function KanbanPage() {
  return (
    <>
      <PageHero
        eyebrow="PMO & Projetos · Kanban"
        title="O quadro de tarefas do projeto."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Colunas desenhadas pelo tenant e cartões que andam livremente — a física da Esteira (ops), escopada a um projeto. O módulo kanban já vive no banco e no motor @alsham/kanban."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
