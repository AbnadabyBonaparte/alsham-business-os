import { getPlantPort, DataPortError } from '@/lib/data';
import {
  Badge,
  DemoNotice,
  EmptyState,
  ErrorState,
  PageHero,
  SectionHeader,
} from '@/components/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/table';

export const dynamic = 'force-dynamic';

/**
 * Energia · Usinas — a tela-âncora de leitura do Módulo 81 (`plant`).
 *
 * Só apresenta: o parque de usinas e, se houver, a geração recente
 * (Módulo 83, `genreading`). Nenhuma decisão, nenhum formulário — a escrita
 * da usina vem numa frente própria. Toda cor vem dos tokens `--bos-*`.
 */
export default async function UsinasPage() {
  const port = await getPlantPort();
  try {
    const [permissions, plants, readings] = await Promise.all([
      port.listPermissions(),
      port.loadPlants(),
      port.loadRecentReadings(),
    ]);
    // As permissões carregam para a mesma cortesia de interface das outras
    // telas; nesta âncora de leitura não há botão a esconder ainda.
    void permissions;

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}
        <PageHero
          eyebrow="Energia · Usinas"
          title="As usinas e a geração."
          accent="A unidade geradora — e a geração distribuída são a mesma coisa."
          subtitle="O parque de usinas do tenant: nome, localização, capacidade instalada (kWp) e o tipo/porte em texto livre. A usina desativada que volta a operar é a mesma (active ↔ archived). Abaixo, a geração recente lida pelo Monitoramento."
        />

        {plants.length === 0 ? (
          <EmptyState
            title="Nenhuma usina cadastrada."
            hint="O módulo já vive no banco e no motor de domínio; o cadastro do parque vem numa frente de UI própria, sem dado fabricado até lá."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Usina</TH>
                <TH>Local</TH>
                <TH num>Potência</TH>
                <TH>Tipo</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {plants.map((p) => (
                <TR key={p.id}>
                  <TD>{p.name}</TD>
                  <TD>{p.location}</TD>
                  <TD num>{`${p.capacityKwp} kWp`}</TD>
                  <TD>{p.plantType}</TD>
                  <TD>
                    <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>
                      {p.status === 'active' ? 'Ativa' : 'Arquivada'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        {readings.length > 0 ? (
          <div className="mt-10">
            <SectionHeader
              title="Geração recente"
              subtitle="As últimas leituras do Monitoramento de Geração, por usina."
            />
            <Table>
              <THead>
                <TR>
                  <TH>Usina</TH>
                  <TH>Data</TH>
                  <TH num>Geração</TH>
                </TR>
              </THead>
              <TBody>
                {readings.map((r) => (
                  <TR key={r.id}>
                    <TD>{r.plantName}</TD>
                    <TD>{r.referenceOn}</TD>
                    <TD num>{`${r.generatedKwh} ${r.unit}`}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ) : null}
      </>
    );
  } catch (err) {
    const detail = err instanceof DataPortError ? err.message : undefined;
    return (
      <>
        <PageHero
          eyebrow="Energia · Usinas"
          title="As usinas e a geração."
          accent="A unidade geradora — e a geração distribuída são a mesma coisa."
        />
        <ErrorState title="Não foi possível carregar o parque de usinas." detail={detail} />
      </>
    );
  }
}
