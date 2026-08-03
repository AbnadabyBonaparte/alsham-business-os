import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * As receitas com trilha de LEITURA — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Vinte e Um — Vertical Saúde): emitir congela o
 * documento, e a medicação só é alcançável pela porta que LOGA — tudo provado
 * no CI. Esta página existe para a rota do menu não apontar para o vazio;
 * nenhuma prescrição inventada.
 */
export default function ReceitasPage() {
  return (
    <>
      <PageHero
        eyebrow="Saúde · Receitas"
        title="A prescrição que congela ao ser emitida."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Medicamento e posologia em texto livre; emitir congela o documento, e a leitura da medicação passa pela porta que loga. O módulo prescription já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="Dado sensível de saúde: a interface rica vem numa frente de UI própria, sempre pela porta que loga o acesso. Nenhum dado fabricado."
      />
    </>
  );
}
