import { Suspense } from 'react';

import {
  PERMISSIONS,
  budgetStatusFor,
  planTransition,
  summarizeCampaigns,
} from '@alsham/marketing';
import type { Campaign, CampaignStatus, TransitionVerdict } from '@alsham/marketing';

import { getMarketingPort, DataPortError } from '@/lib/data';
import {
  Badge,
  DemoNotice,
  ErrorState,
  SectionHeader,
  TableSkeleton,
} from '@/components/states';
import { CampaignBoard, type CampaignRow } from '@/components/campaign-board';
import { CampaignForm } from '@/components/campaign-form';

export const dynamic = 'force-dynamic';

export default function CampanhasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Conteudo />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <SectionHeader title="Campanhas" subtitle="Carregando a carteira…" />
      <TableSkeleton rows={3} />
    </>
  );
}

/** Os destinos que a tela oferece — o motor diz quais estão liberados. */
const DESTINOS: readonly CampaignStatus[] = [
  'draft',
  'scheduled',
  'published',
  'completed',
  'cancelled',
];

/**
 * A carteira de campanhas — o rosto do Módulo 2.
 *
 * ⭐ **A tela não decide.** Ela chama `planTransition()` uma vez por destino
 * possível e entrega o veredito pronto ao componente. Quem responde "pode
 * publicar?" é o pacote; quem mostra a resposta é isto aqui.
 *
 * ⭐ **E a tela não sabe o que é o `recon`.** A coluna de verba desenhada
 * abaixo chegou pelo correio, vinda de um evento de outro módulo. Nada nesta
 * página, em nenhum adaptador dela e em nenhuma consulta que ela faz toca o
 * schema daquele módulo.
 *
 * `budgetStatusFor()` fecha a janela em que a decisão chegou ANTES de a
 * campanha existir: o fato está na projeção local, e a tela o encontra.
 */
async function Conteudo() {
  const port = await getMarketingPort();

  try {
    const [permissions, settings, campaigns, approvals] = await Promise.all([
      port.listPermissions(),
      port.loadSettings(),
      port.loadCampaigns(),
      port.loadSpendApprovals(),
    ]);

    const canManage = permissions.has(PERMISSIONS.campaignManage);
    const canPublish = permissions.has(PERMISSIONS.campaignPublish);
    const agora = new Date();

    const rows: CampaignRow[] = campaigns.map((c) => {
      const projetado = budgetStatusFor(c.budgetRef, approvals);
      const efetivo: Campaign = {
        ...c,
        budgetStatus: c.budgetStatus === 'none' ? projetado : c.budgetStatus,
      };

      const verdicts: Record<string, TransitionVerdict> = {};
      for (const to of DESTINOS) {
        verdicts[to] = planTransition({ campaign: efetivo, to, now: agora, settings });
      }
      return { campaign: efetivo, verdicts };
    });

    const resumo = summarizeCampaigns(rows.map((r) => r.campaign));

    return (
      <>
        {port.kind === 'mock' ? <DemoNotice /> : null}

        <SectionHeader
          eyebrow="Campanhas de Marketing · marketing"
          title="Campanhas"
          subtitle="Planeje, ponha no ar e encerre. A verba aprovada chega sozinha, do financeiro."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resumo.live > 0 ? 'success' : 'neutral'}>{resumo.live} no ar</Badge>
              <Badge tone="neutral">{resumo.draft} em rascunho</Badge>
              {resumo.awaitingBudget > 0 ? (
                <Badge tone="warning">{resumo.awaitingBudget} esperando verba</Badge>
              ) : null}
              {settings.requireBudgetClearance ? (
                <Badge tone="info">este tenant exige verba aprovada para publicar</Badge>
              ) : null}
              {canPublish ? null : (
                <Badge tone="neutral">sem marketing.campaign.publish</Badge>
              )}
            </div>
          }
        />

        <div className="mb-6">
          <CampaignForm canManage={canManage} />
        </div>

        <CampaignBoard rows={rows} canPublish={canPublish} />

        <p className="mt-6 max-w-3xl text-xs text-bos-muted">
          Publicar, encerrar e cancelar põem{' '}
          <code className="font-mono">marketing.campaign.*</code> na caixa de saída do Core, na
          mesma transação. O estado da verba veio pelo caminho inverso: outro módulo emitiu a
          decisão, o correio entregou, e este módulo guardou a própria cópia em{' '}
          <code className="font-mono">marketing.spend_approvals</code> — sem ler nenhuma tabela
          alheia e sem saber quem emitiu.
        </p>
      </>
    );
  } catch (err) {
    return (
      <>
        <SectionHeader title="Campanhas" />
        <ErrorState
          title="Não foi possível carregar as campanhas"
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
