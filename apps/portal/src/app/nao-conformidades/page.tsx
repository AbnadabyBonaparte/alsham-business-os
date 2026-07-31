import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Qualidade · Não Conformidades — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Quatorze — ABRE o Domain Qualidade): schema,
 * RLS, gatilhos e o motor de domínio estão provados no CI. A interface rica —
 * o livro imutável de desvios e o fechamento com a nota de verificação — é
 * frente de UI à parte (spec §3). Esta página existe para a rota não apontar
 * para o vazio.
 */
export default function NaoConformidadesPage() {
  return (
    <>
      <PageHero
        eyebrow="Qualidade · Não Conformidades"
        title="As não conformidades."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O registro imutável do desvio constatado (a identidade do occ): origem em texto livre, descrição obrigatória, causa raiz opcional. Fechar exige a NOTA DE VERIFICAÇÃO — quem conferiu que a causa foi corrigida (o DIVERGE do occ). open → closed é terminal; recorrência é NC nova, e o vínculo à ação corretiva do capa é por id solto. O módulo nc já vive no banco e no motor @alsham/non-conformities."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica (com o livro de desvios e o fechamento com a nota de verificação) vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
