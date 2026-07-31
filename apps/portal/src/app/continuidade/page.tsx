import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Segurança da Informação · Continuidade de Negócios — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezenove — o Domain Segurança da Informação):
 * schema, RLS, gatilhos e o motor @alsham/continuity estão provados no CI. Esta
 * página existe para a rota não apontar para o vazio.
 */
export default function ContinuidadePage() {
  return (
    <>
      <PageHero
        eyebrow="Segurança da Informação · Continuidade"
        title="O plano que se prova nos testes, não só no papel."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Os planos de continuidade da empresa (BCP/DRP): nome, escopo e os alvos de recuperação (RTO/RPO) em texto livre, com o plano que sai e volta (active ↔ archived). E, o que justifica o módulo, o livro imutável de drills — cada teste do plano é um fato consumado (data, cenário, desfecho, nota), a prova de que o plano funciona. O documento detalhado do plano vive nas Políticas; aqui mora a prática. O módulo continuity já vive no banco e no motor @alsham/continuity."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a agenda de drills e o histórico de exercícios vêm numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
