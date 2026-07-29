import { Suspense } from 'react';

import { PERMISSIONS, summarizeReceivables } from '@alsham/accounts-receivable';

import { getArPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { ReceivableList } from '@/components/receivable-list';
import { ReceivableForm } from '@/components/receivable-form';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default function ContasAReceberPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Contas a receber" subtitle="Carregando os títulos…" />
      <TableSkeleton rows={4} />
    </>
  );
}

/**
 * A carteira de títulos a receber — o rosto do Módulo 5.
 *
 * ⭐ **A tela não decide.** Os selos vêm de `summarizeReceivables()`, que soma
 * **por moeda** e nunca no total — somar BRL com USD daria um número que não
 * existe, e contas a receber em mais de uma moeda é o caso de quem exporta.
 *
 * ⭐ **E a tela não sabe o que são os outros módulos.** Registrar um título põe
 * `ar.receivable.registered` na caixa de saída do Core, na mesma transação do
 * `insert`. Hoje **ninguém escuta** — o Módulo 1 ainda não casa crédito, e a
 * integração está declarada NÃO CONSTRUÍDA (ver `MODULO-AR-SPEC §2.3`).
 *
 * ⚠️ O "hoje" é resolvido UMA vez, aqui, e desce por parâmetro.
 */
async function Conteudo() {
  const port = await getArPort();

  try {
    const [permissions, receivables] = await Promise.all([
      port.listPermissions(),
      port.loadReceivables(),
    ]);

    const canManage = permissions.has(PERMISSIONS.receivableManage);
    const canCancelReceivables = permissions.has(PERMISSIONS.receivableCancel);
    const hoje = new Date().toISOString().slice(0, 10);

    const resumo = summarizeReceivables(receivables, hoje);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          eyebrow="Contas a Receber · finanças"
          title="Contas a receber"
          subtitle="Registre o que a empresa tem a receber. Cada título é contado ao resto da plataforma."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.open > 0 ? 'info' : 'neutral'}>{resumo.open} em aberto</Badge>
              {resumo.overdue > 0 ? (
                <Badge tone="danger">{resumo.overdue} vencido(s)</Badge>
              ) : null}
              {Object.entries(resumo.outstandingByCurrency).map(([moeda, cents]) => (
                <Badge key={moeda} tone="neutral">
                  {money(cents, moeda)} a receber
                </Badge>
              ))}
              {Object.entries(resumo.overpaidByCurrency).map(([moeda, cents]) => (
                <Badge key={`over-${moeda}`} tone="warning">
                  {money(cents, moeda)} recebidos a maior
                </Badge>
              ))}
              {canCancelReceivables ? null : (
                <Badge tone="neutral">sem ar.receivable.cancel</Badge>
              )}
            </div>
          }
        />

        <div className="mb-6">
          <ReceivableForm canManage={canManage} />
        </div>

        <ReceivableList
          rows={receivables}
          canCancelReceivables={canCancelReceivables}
          today={hoje}
        />

        <p className="mt-6 max-w-3xl text-xs text-bos-muted">
          Registrar, alterar e cancelar põem <code className="font-mono">ar.receivable.*</code> na
          caixa de saída do Core, na mesma transação. Este módulo é o espelho consciente de Contas
          a Pagar — com uma diferença deliberada:{' '}
          <strong className="text-bos-text">receber a maior é permitido</strong>, porque o dinheiro
          já entrou e recusar obrigaria você a registrar menos do que recebeu. Pagar a maior, do
          outro lado, o sistema recusa.
        </p>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Contas a receber" />
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
