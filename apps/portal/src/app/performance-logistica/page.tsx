import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Supply Chain · Performance Logística — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Onze — o Domain Supply Chain): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function PerformanceLogisticaPage() {
  return (
    <>
      <PageHero
        eyebrow="Supply Chain · Performance Logística"
        title="A avaliação da performance logística."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Nota 0–100 e parecer em texto livre; o avaliado é uma rota/transportadora/CD (o DIVERGE do vperf, cujo avaliado é um fornecedor). O módulo logperf já vive no banco e no motor @alsham/logperf."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
