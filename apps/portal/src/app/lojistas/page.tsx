import { Suspense } from 'react';

import { getMallPort, DataPortError } from '@/lib/data';
import {
  Badge,
  DemoNotice,
  EmptyState,
  ErrorState,
  PageHero,
  TableSkeleton,
} from '@/components/states';
import { Table, THead, TBody, TR, TH, TD } from '@/components/table';

export const dynamic = 'force-dynamic';

/**
 * Shopping Centers · Lojistas — a tela-âncora do Módulo 38 (`mall`).
 *
 * Somente leitura: lista os lojistas do tenant a partir de `mall.stores`. O
 * cadastro e o arquivamento são frente de UI à parte; aqui a tela consome — não
 * decide (Regra de Ouro §5.3).
 */
export default function LojistasPage() {
  return (
    <>
      <PageHero
        eyebrow="Shopping Centers · Lojistas"
        title="Os lojistas do shopping."
        accent="O quadro de quem ocupa cada unidade."
        subtitle="Segmento em texto livre e a unidade física por id solto ao spc; o lojista volta do arquivo. O módulo mall vive no banco e no motor @alsham/mall."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  const port = await getMallPort();
  try {
    const [, stores] = await Promise.all([port.listPermissions(), port.loadStores()]);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        {stores.length === 0 ? (
          <EmptyState
            title="Nenhum lojista cadastrado."
            hint="Quando o primeiro lojista entrar no banco, ele aparece aqui — sem dado fabricado até lá."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Loja</TH>
                <TH>Segmento</TH>
                <TH>Unidade</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {stores.map((s) => (
                <TR key={s.id}>
                  <TD>{s.storeName}</TD>
                  <TD>{s.segment || '—'}</TD>
                  <TD>{s.spaceName || '—'}</TD>
                  <TD>
                    {s.status === 'active' ? (
                      <Badge tone="success">Ativo</Badge>
                    ) : (
                      <Badge tone="neutral">Arquivado</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return <ErrorState title="Não foi possível carregar os lojistas." detail={detail} />;
  }
}
