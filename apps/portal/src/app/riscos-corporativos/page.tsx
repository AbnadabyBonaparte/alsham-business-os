import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * GRC · Risco Corporativo — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezenove — ABRE o Domain GRC): schema, RLS,
 * gatilhos e o motor @alsham/erisk estão provados no CI. Esta página existe para
 * a rota não apontar para o vazio.
 */
export default function RiscosCorporativosPage() {
  return (
    <>
      <PageHero
        eyebrow="GRC · Risco Corporativo"
        title="O risco estratégico do negócio, não o do projeto."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O registro de riscos corporativos: descrição, dono e categoria em texto livre, a probabilidade e o impacto na régua 1–5, e a estratégia de tratamento (os 4 T's da ISO 31000). É o DIVERGE do risco de projeto — este vive enquanto a empresa vive, não enquanto um projeto vive. A física do ciclo é a mesma: o risco mitigado reabre quando a mitigação para de funcionar, e o encerrado não volta. A Matriz de riscos é a leitura (probabilidade × impacto), nunca uma coluna. O módulo erisk já vive no banco e no motor @alsham/erisk."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; o mapa de calor e o registro de tratamento vêm numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
