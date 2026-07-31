import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Varejo & Supermercados · Ponto de Venda — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezoito — ABRE o Vertical Varejo &
 * Supermercados): schema, RLS, gatilhos e o motor @alsham/pdv estão provados no
 * CI. Registra a VENDA COMERCIAL (o cupom), nunca o documento fiscal. Esta
 * página existe para a rota não apontar para o vazio.
 */
export default function PdvPage() {
  return (
    <>
      <PageHero
        eyebrow="Varejo & Supermercados · Ponto de Venda"
        title="A venda do balcão, do rascunho ao cupom fechado."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Registra a venda comercial: o cabeçalho e os itens, o desconto simples da promoção, o cliente e o produto por referência solta. Finalizar congela o cupom, e a venda cancelada ou concluída não reabre. O documento fiscal (NF-e/NFC-e) é integração certificada, não este módulo (Lei 3). O módulo pdv já vive no banco e no motor @alsham/pdv."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a frente de caixa (com a leitura de produto e o total ao vivo) vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
