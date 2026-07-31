import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Segurança da Informação · Vulnerabilidades — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezenove — ABRE o Domain Segurança da
 * Informação): schema, RLS, gatilhos e o motor @alsham/vuln estão provados no
 * CI. Esta página existe para a rota não apontar para o vazio.
 */
export default function VulnerabilidadesPage() {
  return (
    <>
      <PageHero
        eyebrow="Segurança da Informação · Vulnerabilidades"
        title="O desvio constatado nos sistemas — e sua remediação."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O registro das vulnerabilidades encontradas nos sistemas do tenant, com severidade na régua 1–5, sistema afetado e plano de remediação. A identidade é a da não conformidade: um fato constatado que só se encerra com a resposta escrita. São duas saídas — remediada (corrigi-a) ou risco aceito (decidi conviver com ele) —, ambas com justificativa, ambas terminais. A que reaparece é registro novo. O módulo vuln já vive no banco e no motor @alsham/vuln."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a fila por severidade e o acompanhamento de remediação vêm numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
