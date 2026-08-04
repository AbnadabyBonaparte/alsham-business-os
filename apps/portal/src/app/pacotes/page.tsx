import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Pacotes — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Beleza — Vertical 💇 Beleza & Estética, o Módulo
 * 100 do catálogo): schema, RLS, o saldo VIEW e o recuso-de-consumo-acima-do-saldo
 * (a física do loyalty/invest) estão provados no CI. A interface rica é frente de
 * UI à parte. Esta página existe para a rota do menu não apontar para o vazio.
 */
export default function PacotesPage() {
  return (
    <>
      <PageHero
        eyebrow="Beleza · Pacotes"
        title="O pacote fechado de sessões."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O cliente compra N sessões de um serviço; cada visita consome uma; o saldo é view e consumir mais que o saldo é recusado. O DIVERGE do loyalty: bundle amarrado a um serviço e um cliente. O módulo pack já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
