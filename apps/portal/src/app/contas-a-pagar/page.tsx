import { Suspense } from 'react';

import { PERMISSIONS, isOverdue, outstandingCents } from '@alsham/accounts-payable';

import { getApPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { PayableList } from '@/components/payable-list';
import { PayableForm } from '@/components/payable-form';

export const dynamic = 'force-dynamic';

export default function ContasAPagarPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Contas a pagar" subtitle="Carregando os títulos…" />
      <TableSkeleton rows={4} />
    </>
  );
}

/**
 * A carteira de títulos a pagar — o rosto do Módulo 3.
 *
 * ⭐ **A tela não decide.** Vencido, saldo devedor e "pode cancelar?" são
 * perguntas feitas a `@alsham/accounts-payable`, aqui e no componente. Se
 * alguém escrever a conta aqui, ela passa a existir em dois lugares que vão
 * divergir — e há guarda no CI para o dia em que tentarem.
 *
 * ⭐ **E a tela não sabe o que é o `recon`.** Registrar um título aqui põe
 * `ap.payable.registered` na caixa de saída do Core, na mesma transação do
 * `insert`. Se o módulo de conciliação estiver instalado, o correio o projeta
 * lá sozinho — e nada nesta página, em nenhum adaptador dela e em nenhuma
 * consulta que ela faz toca o schema daquele módulo.
 *
 * ⚠️ O "hoje" é resolvido UMA vez, aqui, e desce por parâmetro. Componente que
 * lê o relógio sozinho renderiza diferente no servidor e no cliente.
 */
async function Conteudo() {
  const port = await getApPort();

  try {
    const [permissions, payables] = await Promise.all([
      port.listPermissions(),
      port.loadPayables(),
    ]);

    const canManage = permissions.has(PERMISSIONS.payableManage);
    const canCancelPayables = permissions.has(PERMISSIONS.payableCancel);
    const hoje = new Date().toISOString().slice(0, 10);

    const emAberto = payables.filter((t) => t.status === 'open' || t.status === 'partially_settled');
    const vencidos = emAberto.filter((t) => isOverdue(t, hoje));
    const devidoPorMoeda = new Map<string, number>();
    for (const t of emAberto) {
      devidoPorMoeda.set(t.currency, (devidoPorMoeda.get(t.currency) ?? 0) + outstandingCents(t));
    }

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          title="Contas a pagar"
          subtitle="Registre o que a empresa deve. Cada título é contado ao resto da plataforma — sem ninguém redigitar."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={emAberto.length > 0 ? 'info' : 'neutral'}>
                {emAberto.length} em aberto
              </Badge>
              {vencidos.length > 0 ? (
                <Badge tone="danger">{vencidos.length} vencido(s)</Badge>
              ) : null}
              {[...devidoPorMoeda.entries()].map(([moeda, cents]) => (
                <Badge key={moeda} tone="neutral">
                  {(cents / 100).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: moeda,
                  })}{' '}
                  devidos
                </Badge>
              ))}
              {canCancelPayables ? null : <Badge tone="neutral">sem ap.payable.cancel</Badge>}
            </div>
          }
        />

        <div className="mb-6">
          <PayableForm canManage={canManage} />
        </div>

        <PayableList rows={payables} canCancelPayables={canCancelPayables} today={hoje} />

        <p className="mt-6 max-w-3xl text-xs text-bos-muted">
          Registrar, alterar e cancelar põem <code className="font-mono">ap.payable.*</code> na
          caixa de saída do Core, na mesma transação. Quem escuta esses fatos guarda a própria
          cópia — este módulo não sabe quem escuta, não lê tabela alheia e funciona inteiro se
          ninguém estiver do outro lado.
        </p>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Contas a pagar" />
        <ErrorState
          title="Não foi possível carregar os títulos"
          detail={
            err instanceof DataPortError
              ? err.message
              : 'Erro inesperado ao falar com a fonte de dados.'
          }
        />
      </>
    );
  }
}
