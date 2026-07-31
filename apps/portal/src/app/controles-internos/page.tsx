import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * GRC · Controles Internos — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezenove — o Domain GRC): schema, RLS, gatilhos
 * e o motor @alsham/control estão provados no CI. Esta página existe para a rota
 * não apontar para o vazio.
 */
export default function ControlesInternosPage() {
  return (
    <>
      <PageHero
        eyebrow="GRC · Controles Internos"
        title="A rotina de verificação que a empresa desenha para se proteger."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O cadastro dos controles internos: nome, dono e frequência em texto livre, e o tipo na régua preventive/detective/corrective (a física do COSO). O controle descontinuado que volta é o mesmo (active ↔ archived). Cada teste do controle é um fato consumado — data, resultado, nota — num livro imutável: corrigir é registrar outro teste, nunca reescrever a evidência de conformidade. O módulo control já vive no banco e no motor @alsham/control."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; o painel de controles com o histórico de testes vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
