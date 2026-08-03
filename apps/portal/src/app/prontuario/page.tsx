import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * O prontuário com trilha de LEITURA — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Vinte e Um — Vertical Saúde): a entrada é fato
 * consumado imutável, e o conteúdo clínico só é alcançável pela porta que LOGA
 * o acesso (accountability LGPD) — tudo provado no CI. Esta página existe para
 * a rota do menu não apontar para o vazio; nenhum dado clínico inventado.
 */
export default function ProntuarioPage() {
  return (
    <>
      <PageHero
        eyebrow="Saúde · Prontuário"
        title="A história clínica que não se reescreve."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cada entrada é imutável; corrigir é retificar. A leitura passa pela porta que registra quem consultou o quê, quando. O módulo record já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="Dado sensível de saúde: a interface rica vem numa frente de UI própria, sempre pela porta que loga o acesso. Nenhum dado fabricado."
      />
    </>
  );
}
