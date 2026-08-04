import { Suspense } from 'react';

import { getLeasePort, DataPortError } from '@/lib/data';
import { money } from '@/lib/format';
import {
  Badge,
  DemoNotice,
  EmptyState,
  ErrorState,
  PageHero,
  SectionHeader,
  TableSkeleton,
} from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

export const dynamic = 'force-dynamic';

/**
 * Shopping Centers · Locação — a tela do Módulo 39 (`lease`).
 *
 * Somente leitura, duas seções:
 *  1. Contratos de locação — a camada comercial sobre o `ctr` (por id solto): o
 *     lojista (nome carimbado do `mall`), o percentual sobre vendas e o status.
 *  2. Vendas declaradas — o livro mensal imutável, por competência. É o "dado de
 *     primeira classe" do benchmark de shopping: dele depende o aluguel percentual.
 *
 * A tela consome — não decide (Regra de Ouro §5.3). Não reescreve `ctr`/`mall`:
 * referencia por id solto e mostra o nome carimbado.
 */
export default function LocacaoPage() {
  return (
    <>
      <PageHero
        eyebrow="Shopping Centers · Locação"
        title="A locação comercial."
        accent="O contrato sobre vendas e o que o lojista declarou."
        subtitle="Camada fina sobre o contrato (ctr) e o lojista (mall), por id solto; o relatório de vendas é ato imutável, por competência. O módulo lease vive no banco e no motor @alsham/lease."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

/** Competência mensal `YYYY-MM-DD` → `YYYY-MM` (o mês, sem o dia). */
function competencyLabel(iso: string): string {
  return iso.slice(0, 7);
}

async function Conteudo() {
  const port = await getLeasePort();
  try {
    const [, agreements, salesReports] = await Promise.all([
      port.listPermissions(),
      port.loadAgreements(),
      port.loadSalesReports(),
    ]);

    // Resolve o nome do lojista de cada venda a partir do contrato já carregado
    // (composição de apresentação — nada de regra de negócio na tela).
    const storeByAgreement = new Map(agreements.map((a) => [a.id, a.storeName]));

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          title="Contratos de locação"
          subtitle="A camada comercial sobre o contrato; a vigência mora no ctr, referenciada aqui."
        />
        {agreements.length === 0 ? (
          <EmptyState
            title="Nenhum contrato de locação."
            hint="Quando o primeiro contrato entrar no banco, ele aparece aqui — sem dado fabricado até lá."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Lojista</TH>
                <TH>Percentual sobre vendas</TH>
                <TH>Contrato (ctr)</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {agreements.map((a) => (
                <TR key={a.id}>
                  <TD>
                    {a.storeName || '—'}
                    {a.status === 'ended' && a.endReason ? (
                      <span className="mt-1 block text-xs text-bos-muted">{a.endReason}</span>
                    ) : null}
                  </TD>
                  <TD>{a.revenueShare || '—'}</TD>
                  <TD>
                    <span className="font-mono text-[11px] text-bos-muted">
                      {a.contractRef || '—'}
                    </span>
                  </TD>
                  <TD>
                    {a.status === 'active' ? (
                      <Badge tone="success">Ativo</Badge>
                    ) : (
                      <Badge tone="neutral">Encerrado</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <div className="mt-10">
          <SectionHeader
            title="Vendas declaradas"
            subtitle="O livro mensal do lojista — o dado de que depende o aluguel percentual. Ato imutável, por competência."
          />
          {salesReports.length === 0 ? (
            <EmptyState
              title="Nenhuma venda declarada."
              hint="O livro mensal aparece aqui quando o lojista declarar a primeira competência — sem número inventado até lá."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Lojista</TH>
                  <TH>Competência</TH>
                  <TH num>Vendas declaradas</TH>
                  <TH>Nota</TH>
                </TR>
              </THead>
              <TBody>
                {salesReports.map((s) => (
                  <TR key={s.id}>
                    <TD>{storeByAgreement.get(s.agreementId) ?? '—'}</TD>
                    <TD className="whitespace-nowrap tabular">{competencyLabel(s.competency)}</TD>
                    <TD num className="whitespace-nowrap">
                      {money(s.amountCents, s.currency)}
                    </TD>
                    <TD className="text-bos-muted">{s.note || '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return <ErrorState title="Não foi possível carregar a locação." detail={detail} />;
  }
}
