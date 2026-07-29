import { Suspense } from 'react';

import { PERMISSIONS, summarizeQueue } from '@alsham/dunning';

import { getDunPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { DunQueue } from '@/components/dun-queue';
import { RulerDesigner } from '@/components/ruler-designer';

export const dynamic = 'force-dynamic';

export default function CobrancaPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Cobrança" subtitle="Carregando a régua…" />
      <TableSkeleton rows={4} />
    </>
  );
}

async function Conteudo() {
  const port = await getDunPort();
  try {
    const [permissions, rulers, titles, executions] = await Promise.all([
      port.listPermissions(),
      port.loadRulers(),
      port.loadTitles(),
      port.loadExecutions(),
    ]);

    const canDesign = permissions.has(PERMISSIONS.rulerDesign);
    const canExecute = permissions.has(PERMISSIONS.stepExecute);

    const today = new Date().toISOString().slice(0, 10);
    // A fila e a soma vêm do PACOTE — a tela não compara data nenhuma.
    const resumo = summarizeQueue(titles, today);
    const ativa = rulers.find((r) => r.ruler.status === 'active');

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <SectionHeader
          title="Cobrança"
          subtitle="A régua diz o que fazer e registra que foi feito. Ela não envia nada — e a baixa na origem tira o título sozinha."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.inQueue > 0 ? 'danger' : 'success'}>
                {resumo.inQueue} na régua
              </Badge>
              {[...resumo.outstandingCentsByCurrency.entries()].map(([moeda, cents]) => (
                <Badge key={moeda} tone="neutral">
                  {(cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: moeda })} em
                  aberto
                </Badge>
              ))}
              {!canExecute ? <Badge tone="neutral">sem dun.step.execute</Badge> : null}
            </div>
          }
        />
        <div className="mb-6">
          <RulerDesigner rulers={rulers} canDesign={canDesign} />
        </div>
        <DunQueue
          titles={titles}
          steps={ativa?.steps ?? []}
          executions={executions}
          today={today}
          canExecute={canExecute}
        />
      </>
    );
  } catch (err) {
    const detail =
      err instanceof DataPortError
        ? err.message
        : 'Falha ao carregar a régua. Se o schema dun não estiver exposto na Data API — ou o apps/api não tiver sido redeployado com a inscrição nova — a tela fica vazia sem erro claro.';
    return (
      <>
        <SectionHeader title="Cobrança" subtitle="Não foi possível carregar." />
        <ErrorState title="Erro ao carregar" detail={detail} />
      </>
    );
  }
}
