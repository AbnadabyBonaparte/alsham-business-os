import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * PMO & Projetos · Timesheet (Apontamento de horas) — a tela detalhada é a
 * PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Treze — o Domain PMO & Projetos): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica — a
 * leitura do livro e o resumo de horas por colaborador — é frente de UI à parte
 * (spec §3). Esta página existe para a rota não apontar para o vazio.
 */
export default function ApontamentosPage() {
  return (
    <>
      <PageHero
        eyebrow="PMO & Projetos · Timesheet"
        title="O livro de horas trabalhadas."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cada apontamento é um lançamento imutável — o projeto (id solto), quem trabalhou (texto livre), o dia e as horas (sempre > 0). É o REALIZADO, a contraparte do alloc (o PLANEJADO, percentual mutável). Registrar é fato consumado; corrigir é lançar o ato inverso. O módulo timesheet já vive no banco e no motor @alsham/timesheet."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
