import Link from 'next/link';

import { MANIFEST } from '@alsham/finance-reconciliation';

import { resolveSession } from '@/lib/session';
import { DemoNotice, EmptyState, Panel, SectionHeader } from '@/components/states';

export const dynamic = 'force-dynamic';

/**
 * A porta de entrada do painel.
 *
 * Lista os módulos a partir do **manifesto** — não de uma lista escrita à mão
 * aqui. Quando o instalador em runtime existir (CORE-SPEC §3, passo 3), esta
 * página lê `core.tenant_modules` e a estrutura não muda.
 */
export default async function Home() {
  const session = await resolveSession();

  // Autenticado, mas sem nenhum vínculo. Não é erro do usuário nem falha do
  // sistema — é convite que não chegou. A tela diz isso em vez de mostrar um
  // painel vazio que parece quebrado.
  if (session.mode === 'no-access') {
    return (
      <>
        <SectionHeader title="Sem acesso a nenhuma empresa" />
        <EmptyState
          title="Sua conta existe, mas ainda não está vinculada a nenhuma empresa"
          hint="Peça a quem administra a empresa para convidar este e-mail. Assim que o vínculo existir, o painel aparece aqui."
        />
      </>
    );
  }

  return (
    <>
      {session.mode === 'demo' ? <DemoNotice /> : null}

      <SectionHeader
        title="Seus módulos"
        subtitle="A empresa não compra um sistema. Ela monta o dela — Core mais módulos, como Lego."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel className="blueprint p-6 transition-colors duration-200 hover:border-bos-accent/40">
          <p className="text-xs text-bos-muted">{MANIFEST.taxonomy.layer} · finance</p>
          <h2 className="mt-2 font-display text-xl text-bos-text">{MANIFEST.name}</h2>
          <p className="mt-2 max-w-md text-sm text-bos-muted">{MANIFEST.summary}</p>

          <ul className="mt-4 flex flex-wrap gap-2">
            {MANIFEST.capabilities.map((c) => (
              <li
                key={c.key}
                className="rounded-full border border-bos-border px-2.5 py-0.5 text-xs text-bos-muted"
              >
                {c.canonicalName}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-3">
            <Atalho href="/importar">Importar extrato</Atalho>
            <Atalho href="/conciliacao">Mesa de conciliação</Atalho>
            <Atalho href="/aprovacoes">Fila de aprovação</Atalho>
            <Atalho href="/fechamento">Fechar período</Atalho>
          </div>

          <p className="mt-6 font-mono text-[11px] text-bos-muted">
            {MANIFEST.id} v{MANIFEST.version} · core {MANIFEST.requiresCore}
          </p>
        </Panel>

        <Panel className="p-6">
          <h2 className="font-display text-xl text-bos-text">O que ainda não existe</h2>
          <p className="mt-2 max-w-md text-sm text-bos-muted">
            Honestidade de escopo (Lei 7). O evento de conclusão é gravado na caixa de saída do
            Core, mas o <strong className="font-medium text-bos-text">entregador</strong> — o job
            que tira o evento da caixa e escreve a trilha — ainda não foi construído. Cobrança
            (billing) também não.
          </p>
          <span className="mt-6 inline-block rounded-md border border-bos-border px-4 py-2 text-sm text-bos-muted">
            Etapa 6
          </span>
        </Panel>
      </div>
    </>
  );
}

function Atalho({
  href,
  children,
}: {
  href: '/importar' | '/conciliacao' | '/aprovacoes' | '/fechamento';
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-bos-border px-4 py-2 text-sm text-bos-text transition-colors duration-200 hover:border-bos-accent/60"
    >
      {children}
    </Link>
  );
}
