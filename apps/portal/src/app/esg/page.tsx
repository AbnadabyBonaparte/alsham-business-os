import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * ESG · Métricas Ambientais — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Quinze — ABRE o Domain ESG & Sustentabilidade):
 * schema, RLS, gatilhos e o motor de domínio estão provados no CI. A interface
 * rica — o livro de leituras com o resumo por métrica/unidade — é frente de UI
 * à parte (spec §3). Esta página existe para a rota não apontar para o vazio.
 */
export default function EsgPage() {
  return (
    <>
      <PageHero
        eyebrow="ESG · Métricas Ambientais"
        title="O livro de leituras ambientais."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cada leitura é um ato imutável: o tipo da métrica (carbono, água, energia ou resíduo — as quatro dimensões clássicas), a quantidade (sempre ≥ 0), a unidade em texto livre (tCO2e, m³, kWh, kg) e a data de referência. As quatro capacidades de medição do Domain são UM módulo, porque na física são a mesma leitura periódica. Registrar é fato consumado; corrigir é registrar outra. Indicadores ESG são o goal e Relatórios ESG são o pol. O módulo esg já vive no banco e no motor @alsham/esg."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica (com o livro de leituras e o resumo por métrica/unidade) vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
