import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Compras · Avaliação de Fornecedores — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dez — completar o Domain Compras): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function AvaliacaoFornecedoresPage() {
  return (
    <>
      <PageHero
        eyebrow="Compras · Avaliação de Fornecedores"
        title="A avaliação do fornecedor."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Nota 0–100 e parecer em texto livre; ato pontual imutável com o avaliador carimbado pelo servidor (o DIVERGE do perf, sem ciclo). O módulo vperf já vive no banco e no motor @alsham/vperf."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
