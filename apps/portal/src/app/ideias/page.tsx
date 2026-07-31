import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * P&D · Ideias & Inovação — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezesseis — ABRE o Domain Pesquisa &
 * Desenvolvimento): schema, RLS, gatilhos e o motor @alsham/idea estão provados
 * no CI. O quadro do funil (colunas + ideias que arrastam) é frente de UI à
 * parte. Esta página existe para a rota não apontar para o vazio.
 */
export default function IdeiasPage() {
  return (
    <>
      <PageHero
        eyebrow="P&D · Ideias & Inovação"
        title="O funil de inovação."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="As etapas do funil são desenho do tenant (texto livre, ordenadas), e as ideias caminham por elas por movimento livre. A ideia NÃO pertence a projeto nenhum — ela nasce antes de qualquer projeto (o DIVERGE do kanban); quando amadurece, é promovida e carimba o projeto de destino. Descartar arquiva, e a gaveta reverte. O módulo idea já vive no banco e no motor @alsham/idea."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; o quadro do funil (colunas + ideias) vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
