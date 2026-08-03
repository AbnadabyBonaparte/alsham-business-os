import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Os exames pedido→resultado com trilha de LEITURA — a tela detalhada é a
 * PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Vinte e Um — Vertical Saúde): o pedido nasce,
 * o resultado é ato imutável apenso, e o laudo só é alcançável pela porta que
 * LOGA — tudo provado no CI. Esta página existe para a rota do menu não apontar
 * para o vazio; nenhum resultado inventado.
 */
export default function ExamesPage() {
  return (
    <>
      <PageHero
        eyebrow="Saúde · Exames"
        title="Pedido e resultado, o laudo que não se apaga."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Tipo em texto livre; o resultado é apenso imutável e sua leitura passa pela porta que loga o acesso. O módulo exam já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="Dado sensível de saúde: a interface rica vem numa frente de UI própria, sempre pela porta que loga o acesso. Nenhum dado fabricado."
      />
    </>
  );
}
