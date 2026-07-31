import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * PMO & Projetos · Cronogramas — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Doze — o Domain PMO & Projetos): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function CronogramasPage() {
  return (
    <>
      <PageHero
        eyebrow="PMO & Projetos · Cronogramas"
        title="Os marcos do projeto."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Marcos vinculados ao projeto por id solto; concluir carimba, e reabrir (done → planned) é permitido — o DIVERGE do dem/bud. O módulo sched já vive no banco e no motor @alsham/sched."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
