import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Qualidade · Auditorias — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Quatorze — Domain Qualidade): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica — a
 * agenda de auditorias e o registro de achados — é frente de UI à parte
 * (spec §3). Esta página existe para a rota não apontar para o vazio.
 */
export default function AuditoriasPage() {
  return (
    <>
      <PageHero
        eyebrow="Qualidade · Auditorias"
        title="As auditorias de qualidade."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Planejar e conduzir auditorias (internas, externas, de certificação) com tipo e escopo em texto livre. O achado é imutável (a FK intra-schema à auditoria) e pode virar uma Não Conformidade formal por id solto ao nc. O ciclo é planned → completed/cancelled, os dois fins terminais (a física do proj): auditoria encerrada não reabre, e cancelar exige razão. O módulo audit já vive no banco e no motor @alsham/audits."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica (a agenda de auditorias e o registro dos achados) vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
