import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Shopping Centers · Rondas — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Missão Nove — o Vertical Shopping Centers):
 * schema, RLS, gatilhos e o motor de domínio estão provados no CI. A interface
 * rica é frente de UI à parte (spec §3). Esta página existe para a rota do menu
 * não apontar para o vazio (há teste que confere) — sem dado inventado.
 */
export default function RondasPage() {
  return (
    <>
      <PageHero
        eyebrow="Shopping Centers · Rondas"
        title="A ronda de segurança."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Postos do tenant e o livro de rondas, ato pontual imutável — o incidente é uma Ocorrência (occ). O módulo sec já vive no banco e no motor @alsham/sec."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
