import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Profissionais — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Beleza — Vertical 💇 Beleza & Estética): schema,
 * RLS e o ciclo active ↔ archived (o DIVERGE do hr terminal) estão provados no CI.
 * A interface rica é frente de UI à parte. Esta página existe para a rota do menu
 * não apontar para o vazio (há teste que confere).
 */
export default function ProfissionaisPage() {
  return (
    <>
      <PageHero
        eyebrow="Beleza · Profissionais"
        title="O roster de quem executa o serviço."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Nome e especialidade em texto livre; active ↔ archived (o profissional que volta é a MESMA pessoa). Vínculo id solto opcional ao hr — a cadeira alugada não é RH. O módulo professional já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
