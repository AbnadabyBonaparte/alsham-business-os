import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Supply Chain · Despacho — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Onze — o Domain Supply Chain): schema, RLS,
 * gatilhos e o motor de domínio estão provados no CI. A interface rica é frente
 * de UI à parte (spec §3). Esta página existe para a rota não apontar para o
 * vazio — sem dado inventado.
 */
export default function DespachosPage() {
  return (
    <>
      <PageHero
        eyebrow="Supply Chain · Despacho"
        title="O livro de despachos."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="Cada despacho é um ato pontual imutável — o espelho invertido do recebimento (o recv é a chegada; o disp é a saída). O módulo disp já vive no banco e no motor @alsham/disp."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a interface rica vem numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
