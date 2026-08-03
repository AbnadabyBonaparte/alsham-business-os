import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * O protocolo / processo administrativo — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Governo — Vertical 🏛 Governo): schema, RLS,
 * gatilhos, a Lei das Etapas e a decisão formal terminal estão provados no CI.
 * A interface rica é frente de UI à parte. Esta página existe para a rota do
 * menu não apontar para o vazio (há teste que confere), e é honesta: nenhum
 * dado inventado.
 */
export default function ProtocoloPage() {
  return (
    <>
      <PageHero
        eyebrow="Governo · Protocolo"
        title="O processo administrativo do órgão."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O cidadão protocola, recebe um número público e o processo anda por um rito que o próprio órgão desenha (as etapas são dado do tenant). A decisão formal é terminal, com despacho. O módulo proc já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
