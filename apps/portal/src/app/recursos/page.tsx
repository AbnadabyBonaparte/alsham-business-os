import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * PMO & Projetos · Recursos — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Doze — o Domain PMO & Projetos): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function RecursosPage() {
  return (
    <>
      <PageHero
        eyebrow="PMO & Projetos · Recursos"
        title="A alocação de recursos."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O recurso em texto livre e o percentual de capacidade no projeto (não horas — horas seriam Timesheet); active ↔ archived. O módulo alloc já vive no banco e no motor @alsham/alloc."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
