import { EmptyState, PageHero } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * GRC · Canal de Denúncias — a tela detalhada é a PRÓXIMA FRENTE.
 *
 * O módulo nasceu no banco (Onda Dezenove — o Domain GRC): schema, RLS, gatilhos
 * e o motor @alsham/whistle estão provados no CI. Esta página existe para a rota
 * não apontar para o vazio.
 */
export default function DenunciasPage() {
  return (
    <>
      <PageHero
        eyebrow="GRC · Canal de Denúncias"
        title="O relato que se protege, e o anonimato que é físico."
        accent="Instalado — a tela detalhada é a próxima frente."
        subtitle="O canal de denúncias do tenant: o relato nasce imutável e só o tratamento anda (em análise, resolvida ou arquivada, sempre com desfecho escrito). O anonimato não é uma opção de tela — é físico: quando a denúncia é anônima, o sistema nunca grava quem denunciou, porque a única forma de nunca vazar é nunca ter. A confidencialidade mora na regra de acesso: só o comitê de ética lê todas as denúncias. O módulo whistle já vive no banco e no motor @alsham/whistle."
      />
      <EmptyState
        title="A tela detalhada é a próxima frente."
        hint="O módulo já vive no banco e no motor de domínio; a fila do comitê e o formulário de denúncia vêm numa frente de UI própria, sem dado fabricado até lá."
      />
    </>
  );
}
