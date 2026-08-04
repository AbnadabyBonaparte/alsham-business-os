import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Programação/line-up — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Eventos — Vertical 🎪 Eventos): schema, RLS e a
 * grade de programação (plano mutável, sem ciclo de estado — o DIVERGE do sched)
 * estão provados no CI. A interface rica é frente de UI à parte. Esta página
 * existe para a rota do menu não apontar para o vazio (há teste que confere).
 */
export default function ProgramacaoPage() {
  return (
    <>
      <PageHero
        eyebrow="Eventos · Programação/line-up"
        title="A grade de atrações, sessões e palestras."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Palco e horário em texto livre (o programa pode nascer TBD), atração opcional e posição para a ordenação manual. A agenda é plano mutável — o item se edita e se apaga, sem status. O módulo lineup já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
