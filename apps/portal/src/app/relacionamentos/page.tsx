import { Suspense } from 'react';

import { PERMISSIONS, summarizeParties } from '@alsham/crm';

import { getCrmPort, DataPortError } from '@/lib/data';
import type { InteractionRow } from '@/lib/data';
import { Badge, DemoNotice, ErrorState, SectionHeader, TableSkeleton } from '@/components/states';
import { PartyList } from '@/components/party-list';
import { PartyForm } from '@/components/party-form';

export const dynamic = 'force-dynamic';

export default function RelacionamentosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Relacionamentos" subtitle="Carregando a carteira…" />
      <TableSkeleton rows={4} />
    </>
  );
}

/**
 * A carteira de contrapartes — o rosto do Módulo 4.
 *
 * ⭐ **A tela não decide.** O resumo vem de `summarizeParties()` e a busca de
 * `matchesQuery()`, os dois em `@alsham/crm`. Se alguém contar as ativas com um
 * `filter` aqui, a mesma pergunta passa a ter duas respostas — e há guarda no
 * CI para o dia em que tentarem.
 *
 * ⭐ **E a tela não sabe o que são os outros módulos.** Cadastrar uma
 * contraparte põe `crm.party.registered` na caixa de saída do Core, na mesma
 * transação do `insert`. Se um dia alguém escutar isso, escuta pelo tipo do
 * evento — nada nesta página toca o schema de ninguém.
 */
async function Conteudo() {
  const port = await getCrmPort();

  try {
    const [permissions, parties] = await Promise.all([
      port.listPermissions(),
      port.loadParties(),
    ]);

    const canManage = permissions.has(PERMISSIONS.partyManage);
    const canArchiveParties = permissions.has(PERMISSIONS.partyArchive);
    const canRecord = permissions.has(PERMISSIONS.interactionRecord);

    /**
     * ⭐ **A DÍVIDA DO N+1, PAGA.**
     *
     * A Etapa 11 carregava o histórico com uma consulta POR contraparte e
     * registrou a escolha em voz alta, dizendo qual seria o conserto: *"uma
     * consulta só — agrupada — na porta, e não um `fetch` no cliente, que
     * exigiria expor outra rota e outra checagem de permissão"*. É exatamente
     * isto: `loadInteractionsFor()` traz o histórico de todas as contrapartes
     * de uma vez, com `in`.
     *
     * O histórico continua sendo carregado no SERVIDOR, e continua sob RLS —
     * o que mudou foi o número de idas ao banco, de N+1 para 2.
     */
    const interactionsByParty: Record<string, readonly InteractionRow[]> =
      await port.loadInteractionsFor(parties.map((p) => p.id));

    const resumo = summarizeParties(parties);
    const contatos = Object.values(interactionsByParty).reduce((n, lista) => n + lista.length, 0);

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          title="Relacionamentos"
          subtitle="Quem a empresa conhece, e o que já foi conversado com cada um."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.active > 0 ? 'success' : 'neutral'}>{resumo.active} ativas</Badge>
              {resumo.archived > 0 ? (
                <Badge tone="neutral">{resumo.archived} arquivadas</Badge>
              ) : null}
              <Badge tone="info">
                {resumo.orgs} organização(ões) · {resumo.people} pessoa(s)
              </Badge>
              <Badge tone="neutral">{contatos} contato(s) registrado(s)</Badge>
              {canArchiveParties ? null : <Badge tone="neutral">sem crm.party.archive</Badge>}
            </div>
          }
        />

        <div className="mb-6">
          <PartyForm canManage={canManage} />
        </div>

        <PartyList
          parties={parties}
          interactionsByParty={interactionsByParty}
          canManage={canManage}
          canArchiveParties={canArchiveParties}
          canRecord={canRecord}
        />

        <p className="mt-6 max-w-3xl text-xs text-bos-muted">
          Cadastrar, editar e arquivar põem <code className="font-mono">crm.party.*</code> na caixa
          de saída do Core, na mesma transação; registrar um contato põe{' '}
          <code className="font-mono">crm.interaction.registered</code>. Este módulo não escuta
          ninguém e funciona inteiro sozinho — o que os outros fazem com esses fatos é problema
          deles. E <strong className="text-bos-text">um contato registrado não se edita nem se
          apaga</strong>: para corrigir, registre outro.
        </p>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Relacionamentos" />
        <ErrorState
          title="Não foi possível carregar a carteira"
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
