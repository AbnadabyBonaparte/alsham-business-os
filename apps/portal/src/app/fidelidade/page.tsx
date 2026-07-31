import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Varejo & Supermercados · Fidelidade — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezoito — o Vertical Varejo & Supermercados):
 * schema, RLS, gatilhos e o motor @alsham/loyalty estão provados no CI. Esta
 * página existe para a rota não apontar para o vazio.
 */
export default function FidelidadePage() {
  return (
    <>
      <PageHero
        eyebrow="Varejo & Supermercados · Fidelidade"
        title="O livro de pontos do cliente."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cada movimento é um lançamento imutável: a direção mora no tipo (ganhar soma, resgatar subtrai), os pontos são sempre positivos, e corrigir é lançar o ato inverso. O saldo é calculado do livro, nunca uma coluna — e resgatar mais do que o saldo cobre é recusado. A conversão entre pontos e dinheiro e a expiração automática ficam de fora. O módulo loyalty já vive no banco e no motor @alsham/loyalty."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; o extrato de pontos por cliente com o saldo ao vivo vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
