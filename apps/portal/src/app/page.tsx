import Link from 'next/link';

import { MANIFEST } from '@alsham/finance-reconciliation';

import { Panel, SectionHeader } from '@/components/states';

/**
 * A porta de entrada do painel.
 *
 * Lista os módulos instalados a partir do **manifesto** — não de uma lista
 * escrita à mão aqui. Quando o instalador em runtime existir (CORE-SPEC §3,
 * passo 3), esta página lê `core.tenant_modules` e a estrutura não muda.
 */
export default function Home() {
  return (
    <>
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
            <Link
              href="/conciliacao"
              className="rounded-md border border-bos-border px-4 py-2 text-sm text-bos-text transition-colors duration-200 hover:border-bos-accent/60"
            >
              Mesa de conciliação
            </Link>
            <Link
              href="/aprovacoes"
              className="rounded-md border border-bos-border px-4 py-2 text-sm text-bos-text transition-colors duration-200 hover:border-bos-accent/60"
            >
              Fila de aprovação
            </Link>
          </div>

          <p className="mt-6 font-mono text-[11px] text-bos-muted">
            {MANIFEST.id} v{MANIFEST.version} · core {MANIFEST.requiresCore}
          </p>
        </Panel>

        <Panel className="p-6">
          <h2 className="font-display text-xl text-bos-text">Importar extrato</h2>
          <p className="mt-2 max-w-md text-sm text-bos-muted">
            A terceira tela do módulo. O parser de OFX/CSV é da próxima etapa — enquanto ele não
            existe, esta tela não é desenhada. Prometer botão que não funciona é o que a Lei 7
            proíbe.
          </p>
          <span className="mt-6 inline-block rounded-md border border-bos-border px-4 py-2 text-sm text-bos-muted">
            Não construído
          </span>
        </Panel>
      </div>
    </>
  );
}
