import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * PMO & Projetos · Scrum / Sprints — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Treze — FECHA o Domain PMO & Projetos): schema,
 * RLS, gatilhos e o motor de domínio estão provados no CI. A interface rica —
 * inclusive a leitura dos cartões do kanban por composição — é frente de UI à
 * parte (spec §3). Esta página existe para a rota não apontar para o vazio.
 */
export default function SprintsPage() {
  return (
    <>
      <PageHero
        eyebrow="PMO & Projetos · Scrum"
        title="Os sprints do projeto."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="A moldura temporal (time-box): um projeto tem no máximo um sprint ativo por vez (regra na constraint do banco), closed é terminal. Os itens de trabalho são os cartões do kanban — composição de tela, não de schema. O módulo scrum já vive no banco e no motor @alsham/scrum."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
