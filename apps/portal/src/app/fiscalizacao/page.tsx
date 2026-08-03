import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * A fiscalização municipal — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Governo — Vertical 🏛 Governo): schema, RLS, o
 * rol de alvos (active↔archived) e a vistoria imutável estão provados no CI. A
 * interface rica é frente de UI à parte. Esta página existe para a rota do menu
 * não apontar para o vazio (há teste que confere), e é honesta: nenhum dado
 * inventado.
 */
export default function FiscalizacaoPage() {
  return (
    <>
      <PageHero
        eyebrow="Governo · Fiscalização"
        title="O rol de alvos e o livro de vistorias."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O cadastro de estabelecimentos/imóveis sob jurisdição e o que o fiscal constatou em campo (ato imutável). O auto de infração é integração (Lei 3). O módulo fisc já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
