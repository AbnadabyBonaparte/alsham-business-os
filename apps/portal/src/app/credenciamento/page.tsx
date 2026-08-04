import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Credenciamento & Check-in — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Eventos — Vertical 🎪 Eventos): schema, RLS, as
 * credenciais (active↔revoked) e o check-in imutável carimbado pelo servidor
 * estão provados no CI. A interface rica é frente de UI à parte. Esta página
 * existe para a rota do menu não apontar para o vazio (há teste que confere).
 */
export default function CredenciamentoPage() {
  return (
    <>
      <PageHero
        eyebrow="Eventos · Credenciamento & Check-in"
        title="A credencial de acesso e a chegada no portão."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Emitir a credencial (portador, tipo e nível em texto livre; volta do bloqueio) e registrar o check-in contra a credencial ativa — ato imutável, carimbado pelo servidor. Sem ingresso/pagamento (Lei 3). O módulo accred já vive no banco."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
