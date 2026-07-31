import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Varejo & Supermercados · Sessão de Caixa — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezoito — o Vertical Varejo & Supermercados):
 * schema, RLS, gatilhos e o motor @alsham/cashregister estão provados no CI.
 * Esta página existe para a rota não apontar para o vazio.
 */
export default function CaixaSessaoPage() {
  return (
    <>
      <PageHero
        eyebrow="Varejo & Supermercados · Sessão de Caixa"
        title="O turno da gaveta, da abertura ao fechamento."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="A sessão física de um caixa: abre contando o fundo de troco, fecha contando a gaveta. Há no máximo uma sessão aberta por caixa, e o turno encerrado não reabre — o próximo é sessão nova. Não confunde com o livro-caixa da empresa, que é perpétuo e não tem turno. A quebra de caixa (esperado versus contado) é leitura de tela. O módulo cashregister já vive no banco e no motor @alsham/cashregister."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a abertura e o fechamento com a contagem física vêm numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
