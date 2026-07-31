import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Energia · Créditos de Compensação — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Vinte — o Vertical Energia): schema, RLS,
 * gatilhos e o motor @alsham/creditbalance estão provados no CI.
 */
export default function CreditosPage() {
  return (
    <>
      <PageHero
        eyebrow="Energia · Créditos de Compensação"
        title="O crédito de energia é a energia que sobrou — não uma promessa."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O livro de créditos de compensação (o conceito ANEEL): quando a usina injeta mais do que consome, o excedente vira crédito (kWh) que abate consumo depois. A direção mora no tipo (gerado soma, consumido subtrai) e o saldo é sempre calculado do livro. Consumir mais que o saldo é recusado — não por cópia da Fidelidade, mas pela física da compensação: crédito é energia realmente gerada, e um saldo negativo inventaria energia inexistente. O módulo creditbalance já vive no banco e no motor @alsham/creditbalance."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; o saldo por assinatura e o extrato de créditos vêm numa frente de UI própria, sem validade por relógio até lá (é motor futuro)."
      />
    </>
  );
}
