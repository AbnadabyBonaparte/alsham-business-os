import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Segurança da Informação · Resposta a Incidentes — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezenove — o Domain Segurança da Informação):
 * schema, RLS, gatilhos e o motor @alsham/secincident estão provados no CI. Esta
 * página existe para a rota não apontar para o vazio.
 */
export default function IncidentesSegurancaPage() {
  return (
    <>
      <PageHero
        eyebrow="Segurança da Informação · Resposta a Incidentes"
        title="A operação de resposta, da detecção ao encerramento."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="A condução de incidentes de segurança pela timeline NIST: detectado, contido, erradicado, recuperado, encerrado. Ao contrário da ocorrência genérica — um fato consumado imutável —, o incidente é uma operação: o entendimento evolui durante a resposta (o vetor de ataque se descobre investigando), então ele é editável enquanto aberto e congela no fechamento. Cada passo da resposta é um ato imutável na timeline. O módulo secincident já vive no banco e no motor @alsham/secincident."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a sala de guerra com a timeline ao vivo vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
