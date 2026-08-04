import { getCatalogPort, DataPortError } from '@/lib/data';
import { Badge, DemoNotice, EmptyState, ErrorState, PageHero } from '@/components/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/table';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Varejo & Supermercados · Catálogo de Produtos — a tela-âncora (read-only).
 *
 * O módulo nasceu no banco (Onda Dezoito — o Vertical Varejo & Supermercados):
 * schema, RLS, gatilhos e o motor @alsham/catalog estão provados no CI. Esta
 * página lê o cadastro e o mostra; a grade com busca e a edição de preço vêm
 * numa frente de UI própria.
 */
export default async function CatalogoPage() {
  const port = await getCatalogPort();
  try {
    const [, products] = await Promise.all([port.listPermissions(), port.loadProducts()]);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Varejo · Catálogo"
          title="O catálogo de produtos."
          accent="O cadastro do que a loja vende."
          subtitle="Nome, um SKU em texto livre (opcional — nem toda casa usa código) e o preço de tabela, valor e moeda juntos. O produto descontinuado que volta é o mesmo produto (active ↔ archived)."
        />
        {products.length === 0 ? (
          <EmptyState
            title="Nenhum produto no catálogo."
            hint="O cadastro de produtos aparece aqui assim que a loja registrar o primeiro item."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Produto</TH>
                <TH>SKU</TH>
                <TH num>Preço</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {products.map((p) => (
                <TR key={p.id}>
                  <TD>{p.name}</TD>
                  <TD>{p.sku ?? '—'}</TD>
                  <TD num>{money(p.priceCents, p.currency)}</TD>
                  <TD>
                    <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>
                      {p.status === 'active' ? 'Ativo' : 'Arquivado'}
                    </Badge>
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
    return (
      <>
        <PageHero
          eyebrow="Varejo · Catálogo"
          title="O catálogo de produtos."
          accent="O cadastro do que a loja vende."
        />
        <ErrorState title="Não foi possível carregar o catálogo de produtos." detail={detail} />
      </>
    );
  }
}
