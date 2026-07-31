import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * PMO & Projetos · Custos do Projeto — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Doze — o Domain PMO & Projetos): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function CustosProjetoPage() {
  return (
    <>
      <PageHero
        eyebrow="PMO & Projetos · Custos do Projeto"
        title="O livro de custos do projeto."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cada custo é um lançamento imutável (valor + moeda, categoria opcional); NÃO há trave de saldo — o DIVERGE do fund. O módulo pcost já vive no banco e no motor @alsham/pcost."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
