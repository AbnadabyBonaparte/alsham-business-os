import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * A agenda médica com no-show — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Vinte e Um — Vertical Saúde): horário,
 * profissional e paciente por id solto, e o ciclo scheduled → attended|no_show|
 * cancelled estão provados no CI. Esta página existe para a rota do menu não
 * apontar para o vazio (há teste que confere); nenhum dado inventado.
 */
export default function AgendaPage() {
  return (
    <>
      <PageHero
        eyebrow="Saúde · Agenda médica"
        title="A marcação, com a falta que é dado."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Registro profissional em texto livre; o no-show se registra (a agenda que esconde a falta mente sobre a ocupação). O módulo appointment já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
