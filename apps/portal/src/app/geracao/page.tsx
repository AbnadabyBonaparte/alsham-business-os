import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * Energia · Monitoramento de Geração — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Vinte — o Vertical Energia): schema, RLS,
 * gatilhos e o motor @alsham/genreading estão provados no CI.
 */
export default function GeracaoPage() {
  return (
    <>
      <PageHero
        eyebrow="Energia · Monitoramento de Geração"
        title="Quanta energia a usina gerou — fato consumado, não se reescreve."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O livro de leituras de geração: a usina, os kWh gerados, a unidade e o período. É a identidade do módulo de Métricas Ambientais re-perguntada para a energia — leitura periódica imutável, zero é leitura real (a usina gera zero à noite), negativo é infísico. A usina é obrigatória: não há geração no ar. O módulo genreading já vive no banco e no motor @alsham/genreading."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a curva de geração e o histórico por usina vêm numa frente de UI própria, sem cálculo de performance até lá (é motor futuro)."
      />
    </>
  );
}
