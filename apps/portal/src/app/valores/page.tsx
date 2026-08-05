import type { ReactNode } from 'react';

import { PageHero, Panel } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * ⭐ **VALORES — a tabela pública genérica, por porte.**
 *
 * ⚠️ **Lei 7 na vitrine:** o modelo de cobrança tem três faixas decididas
 * (por número de colaboradores); os VALORES em reais não estão construídos nem
 * provados neste repositório, e `packages/billing` nasce SEM preço de propósito
 * (há guarda de CI). Por isso esta tela mostra a ESTRUTURA — o que cada faixa
 * inclui e como a conta se forma — e nunca inventa um número: o valor fechado
 * sai numa proposta, não de uma cifra fabricada aqui.
 *
 * ⛔ **Zero termo pessoal, zero comissão de indicação, zero desconto negociado.**
 * Esta é a página de todo cliente, não de um. Nenhum nome, nenhum apelido,
 * nenhuma condição de um contrato específico (CLAUDE.md §3).
 */

interface Faixa {
  readonly nome: string;
  readonly porte: string;
  readonly linha: string;
  readonly inclui: readonly string[];
  readonly destaque?: boolean;
}

const FAIXAS: readonly Faixa[] = [
  {
    nome: 'Essencial',
    porte: 'até 5 colaboradores',
    linha: 'O Core mais os primeiros módulos — a empresa monta o dela e cresce sem trocar de sistema.',
    inclui: [
      'Core da plataforma: painel, trilha imutável, correio de eventos',
      'Módulos escolhidos na Store, um a um',
      'Isolamento por empresa (RLS) desde o primeiro dia',
    ],
  },
  {
    nome: 'Crescimento',
    porte: 'até 20 colaboradores',
    linha: 'Mais gente operando ao mesmo tempo, mais módulos ativos, o mesmo isolamento.',
    inclui: [
      'Tudo do Essencial',
      'Mais assentos e mais módulos instalados',
      'A inteligência ALSHAM apontando o que pede atenção, sobre o seu dado real',
    ],
    destaque: true,
  },
  {
    nome: 'Operação',
    porte: 'acima de 20 colaboradores',
    linha: 'Operação com volume — o modelo se ajusta ao porte, sem reescrever nada.',
    inclui: [
      'Tudo do Crescimento',
      'Módulos verticais do seu setor, quando existirem no catálogo',
      'Acompanhamento de implantação para times maiores',
    ],
  },
];

export default function ValoresPage() {
  return (
    <>
      <PageHero
        eyebrow="Como cobramos"
        title="Valores por porte."
        accent="Implantação uma vez; manutenção por tamanho de time."
        subtitle="A conta tem duas partes: a implantação (o setup inicial) e a manutenção mensal, que segue a faixa de colaboradores. O valor fechado vem numa proposta — esta tela mostra o modelo, não uma cifra de exemplo."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {FAIXAS.map((f) => (
          <FaixaCard key={f.nome} f={f} />
        ))}
      </div>

      <Panel className="mt-6 px-6 py-5">
        <h2 className="font-display text-lg text-bos-text">Como a conta se forma</h2>
        <ul className="mt-3 space-y-2 text-sm text-bos-muted">
          <Item>
            <strong className="text-bos-text">Implantação:</strong> um valor único no começo, para
            deixar a empresa de pé — Core, os módulos escolhidos e o isolamento de dados.
          </Item>
          <Item>
            <strong className="text-bos-text">Manutenção:</strong> mensal, pela faixa de porte acima.
            Crescer de faixa é decisão sua; nada troca de sistema no caminho.
          </Item>
          <Item>
            <strong className="text-bos-text">Módulos:</strong> a empresa instala o que precisa, pela
            Store. Não se compra um pacote fechado — monta-se o próprio, Core mais módulos, como Lego.
          </Item>
        </ul>
        <p className="mt-4 text-xs text-bos-muted">
          Nenhum número em reais aparece aqui porque nenhum valor fabricado deveria: o preço fechado
          sai de uma proposta, sobre o seu porte e os módulos que você escolher.
        </p>
      </Panel>
    </>
  );
}

function FaixaCard({ f }: { f: Faixa }) {
  return (
    <Panel
      className={`bos-sheen flex h-full flex-col px-5 py-5 ${
        f.destaque ? 'border-bos-accent/50' : ''
      }`}
    >
      <p className="bos-eyebrow mb-2">{f.porte}</p>
      <h3 className="font-display text-xl text-bos-text">{f.nome}</h3>
      <p className="mt-2 text-sm text-bos-muted">{f.linha}</p>
      <ul className="mt-4 space-y-2 text-sm text-bos-muted">
        {f.inclui.map((linha) => (
          <li key={linha} className="flex items-start gap-2">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="mt-0.5 size-4 shrink-0 text-bos-accent/60"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l4 4L19 7" />
            </svg>
            <span>{linha}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Item({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bos-accent/60" />
      <span>{children}</span>
    </li>
  );
}
