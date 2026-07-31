import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * PMO & Projetos · Gantt / Dependências entre marcos — a tela detalhada é a
 * PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Treze): schema, RLS, gatilhos e o motor de
 * domínio estão provados no CI. A interface rica — o grafo desenhado sobre os
 * marcos do sched por composição, com o wouldCycle guiando o operador — é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio.
 */
export default function GanttPage() {
  return (
    <>
      <PageHero
        eyebrow="PMO & Projetos · Gantt"
        title="As dependências entre marcos."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="A aresta de precedência predecessor → sucessor entre marcos (id solto ao cronograma), com o tipo entre as quatro relações clássicas. É um registro mutável: a dependência some quando o plano muda. O caminho crítico e o cálculo de datas são frente futura, nunca dado novo aqui. O módulo gantt já vive no banco e no motor @alsham/gantt."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica, com o grafo sobre os marcos e a detecção de ciclo, vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
