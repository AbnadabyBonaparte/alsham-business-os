-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0004_marketing.sql
-- Módulo 2: Campanhas de Marketing. Schema `marketing`.
-- =============================================================================
--
-- NÃO APLICADO. `0001` e `0002` estão CONGELADAS (CLAUDE.md §5.4.1) e `0003`
-- segue arquivo. Esta é a próxima da fila. Aplicar é ato do dono —
-- ver docs/runbook/APLICAR.md.
--
-- MAS PROVADO: aplicado de verdade a cada push, depois de 0001→0002→0003, num
-- PostgreSQL 17 limpo e efêmero (.github/workflows/db-verify.yml).
--
-- Taxonomia: Domain `marketing` (§5, Marketing — 13 capacidades) — capacidade
-- *Campanhas*. As outras 12 NÃO estão aqui porque não estão construídas.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTE ARQUIVO EXISTE PARA PROVAR — E É COISA NOVA
-- -----------------------------------------------------------------------------
-- O Módulo 1 provou que um módulo não toca o Core indevidamente. Este prova o
-- nível seguinte: **dois módulos coexistindo, um REAGINDO ao fato do outro,
-- sem que nenhum conheça o outro.**
--
--   1. NÃO cria nada em `core`, nem em `recon`. Todo objeto nasce em `marketing`.
--   2. NÃO faz join em `recon.*`. Nem um. A prova está em `spend_approvals`:
--      é PROJEÇÃO LOCAL, preenchida com o que veio NO PAYLOAD do evento.
--   3. Se o `recon` for desinstalado amanhã, este módulo continua inteiro —
--      a projeção fica, as campanhas seguem. O acoplamento é com o TIPO DO
--      EVENTO, que é contrato público, nunca com o código de quem emite.
--   4. Depende só do Core: `core.has_permission()` e `core.event_outbox`.
--
-- ⚠️ A afirmação "não faz join em recon" não é promessa: há guarda no CI que
-- reprova a string `recon.` dentro deste arquivo fora dos comentários.
--
-- -----------------------------------------------------------------------------
-- O TESTE ANTI-VIÉS — E POR QUE MARKETING É ONDE ELE MAIS DÓI
-- -----------------------------------------------------------------------------
-- Marketing é o Domain em que o viés mais tenta entrar, porque "como ESTA
-- empresa faz marketing" é a coisa mais fácil de codificar sem perceber.
--
-- A pergunta de cada coluna abaixo foi, literalmente: **"uma clínica, uma
-- fábrica e um shopping usariam esta coluna exatamente como está?"** O que
-- reprovou não virou coluna — virou chave em `core.tenant_modules.settings`,
-- e está registrado em cada tabela com ANTI-VIÉS.
--
-- O caso mais importante: **não existe tabela de canal, de rede social, de
-- público-alvo estruturado nem de tipo de campanha.** Toda lista dessas seria
-- o marketing de UMA empresa (ou de UMA década) fossilizado no schema.
--
-- =============================================================================

create schema if not exists marketing;

comment on schema marketing is
  'Módulo Campanhas de Marketing. Domain marketing da Taxonomia. Não cria objeto em core nem lê schema de outro módulo; fala com o mundo só por core.event_outbox.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- Idêntica em forma à do recon, e é de propósito: a segunda vez que um padrão
-- aparece é quando ele deixa de ser improviso e vira a Lei do Lego (§5.5).
-- =============================================================================

create or replace function marketing.emit_event(
  p_tenant_id      uuid,
  p_event_type     text,
  p_payload        jsonb,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  -- Cinto de segurança: o módulo não emite evento em nome de outro. Sem isto,
  -- `marketing` poderia forjar um `recon.approval.decided` e o correio
  -- entregaria — o contrato público viraria terra de ninguém.
  if p_event_type not like 'marketing.%' then
    raise exception 'marketing.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'marketing',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function marketing.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado.';

-- -----------------------------------------------------------------------------
-- Acesso ao módulo: quem tem QUALQUER uma das três permissões do manifesto.
-- Membro do tenant sem permissão `marketing.*` não lê campanha — leitura é
-- privilégio, não default de membro. Mesma regra do recon.
-- -----------------------------------------------------------------------------

create or replace function marketing.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'marketing.campaign.manage')
      or core.has_permission(p_tenant_id, 'marketing.campaign.publish')
      or core.has_permission(p_tenant_id, 'marketing.result.record');
$$;

create or replace function marketing.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 2. CAMPAIGNS — a campanha
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS aplicado — aqui é o campo de batalha:
--
--   ✅ ENTRA `status` com os quatro estados do ciclo (rascunho → agendada →
--      publicada → encerrada), mais `cancelled`. O ciclo é universal: toda
--      empresa que faz campanha planeja, põe no ar, tira do ar.
--   ✅ ENTRA `scheduled_for`: quando vai ao ar. Universal.
--   ✅ ENTRA `budget_planned_cents` + `currency`: quanto se PRETENDE gastar.
--      Inteiro em centavos, sem ponto flutuante, sem moeda presumida.
--   ✅ ENTRA `audience_note` como TEXTO LIVRE.
--
--   ❌ NÃO ENTRA tipo/categoria de campanha ("lançamento", "sazonal",
--      "institucional"). Toda lista dessas é o vocabulário de UMA empresa.
--      É `settings.campaign.types`, se o tenant quiser uma.
--   ❌ NÃO ENTRA canal na campanha (Instagram, e-mail, rádio, mala direta).
--      Além de ser viés, é viés que APODRECE: uma coluna `instagram_handle`
--      escrita hoje é dívida em cinco anos. Canal vive na peça (§3), como
--      texto.
--   ❌ NÃO ENTRA público-alvo ESTRUTURADO (faixa etária, bairro, segmento).
--      Segmentação séria é capacidade própria (*CRM marketing*, Taxonomia §5)
--      e difere por canal. Aqui é uma nota que o humano lê — honesto sobre o
--      que o módulo faz.
--   ❌ NÃO ENTRA aprovação de peça, fluxo de briefing, alçada de verba. São
--      *Briefings* e *Produção*, capacidades à parte, e a POLÍTICA de quem
--      aprova é `settings`, nunca tabela (a mesma lição do recon §6).
--   ❌ NÃO ENTRA nada de lojista, praça, mall, unidade ou franqueado. Isso é
--      a Vertical Shopping (Taxonomia §6) — outro produto, outra etapa.
--
-- ⚠️ `budget_ref` merece parágrafo próprio. É uma referência OPACA ao item
-- financeiro que banca a campanha — o mesmo padrão de `recon.payables.
-- external_ref` e de `recon.bank_statements.account_ref`. Não é FK: apontar
-- para tabela de outro módulo é exatamente o que a Lei do Lego proíbe. Quem
-- decide o que vai aqui é o tenant, e o módulo não presume o significado.
-- =============================================================================

create table marketing.campaigns (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  name           text        not null check (length(btrim(name)) > 0),
  description    text        not null default '',
  status         text        not null default 'draft'
                 check (status in ('draft', 'scheduled', 'published', 'completed', 'cancelled')),
  -- Quando deve ir ao ar. Livre em rascunho; exigido para agendar (§2.1).
  scheduled_for  timestamptz,
  published_at   timestamptz,
  completed_at   timestamptz,
  -- O que se PRETENDE gastar. NULL = campanha sem verba declarada, que é
  -- situação real e não erro.
  budget_planned_cents bigint check (budget_planned_cents is null or budget_planned_cents >= 0),
  -- ISO 4217. Sem default: moeda presumida é viés de país.
  currency       char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  -- Referência OPACA ao item financeiro que banca a campanha. Não é FK.
  budget_ref     text,
  -- Preenchido pelo EVENTO de outro módulo (§5). `none` = ninguém se
  -- pronunciou; não é o mesmo que rejeitado.
  budget_status  text        not null default 'none'
                 check (budget_status in ('none', 'pending', 'approved', 'rejected')),
  audience_note  text        not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  -- Verba declarada exige moeda. Número sem moeda não é dinheiro, é número.
  constraint campaigns_currency_with_budget check (
    (budget_planned_cents is null) or (currency is not null)
  ),
  -- Carimbo e estado andam juntos: publicada tem data de publicação,
  -- encerrada tem data de encerramento. Integridade, não regra de negócio —
  -- a regra de TRANSIÇÃO vive em packages/marketing (Regra de Ouro).
  constraint campaigns_published_stamped check (
    (status in ('published', 'completed') and published_at is not null)
    or (status not in ('published', 'completed'))
  ),
  constraint campaigns_completed_stamped check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  ),
  constraint campaigns_scheduled_has_date check (
    (status = 'scheduled' and scheduled_for is not null) or (status <> 'scheduled')
  ),
  -- Alvo da FK composta das filhas: campanha e filha nunca em tenants
  -- diferentes, garantido pelo banco e não pela boa vontade de quem grava.
  constraint campaigns_id_tenant unique (id, tenant_id)
);

create index campaigns_tenant_idx
  on marketing.campaigns (tenant_id, created_at desc);
create index campaigns_live_idx
  on marketing.campaigns (tenant_id, scheduled_for)
  where status in ('draft', 'scheduled', 'published');
-- O índice que o consumo de evento usa (§5). Parcial: campanha sem referência
-- financeira nunca é alvo de decisão de verba.
create index campaigns_budget_ref_idx
  on marketing.campaigns (tenant_id, budget_ref)
  where budget_ref is not null;

create trigger campaigns_touch
  before update on marketing.campaigns
  for each row execute function marketing.touch_updated_at();

alter table marketing.campaigns enable row level security;
alter table marketing.campaigns force row level security;

create policy campaigns_select on marketing.campaigns
  for select to authenticated
  using (marketing.can_access(tenant_id));

create policy campaigns_insert on marketing.campaigns
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'marketing.campaign.manage'));

-- Editar exige `manage` OU `publish`. A separação real entre as duas está no
-- trigger de §2.1 — policy não enxerga `old`, e por isso não consegue
-- distinguir "corrigiu o texto" de "pôs no ar".
create policy campaigns_update on marketing.campaigns
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'marketing.campaign.manage')
    or core.has_permission(tenant_id, 'marketing.campaign.publish')
  )
  with check (
    core.has_permission(tenant_id, 'marketing.campaign.manage')
    or core.has_permission(tenant_id, 'marketing.campaign.publish')
  );

-- Sem policy de DELETE: cancelar é `status = 'cancelled'`, não apagar linha.
-- Campanha apagada é verba gasta sem história.

-- -----------------------------------------------------------------------------
-- 2.1 QUEM PODE PÔR NO AR
-- -----------------------------------------------------------------------------
-- **Quem cria não é necessariamente quem publica.** É a mesma decisão que o
-- recon tomou entre `match.manage` e `approval.decide`, e pelo mesmo motivo:
-- o produto PERMITE que sejam a mesma pessoa (basta pôr as duas permissões no
-- mesmo papel), mas não PRESUME.
--
-- Vive num trigger, e não numa policy, porque policy de UPDATE não recebe o
-- `old`: ela sabe QUEM está escrevendo, não O QUE mudou. Sem isto, qualquer
-- um com `manage` publicaria — e a separação seria decorativa.
-- -----------------------------------------------------------------------------

create or replace function marketing.guard_publish_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status in ('published', 'completed', 'cancelled')
     and not core.has_permission(new.tenant_id, 'marketing.campaign.publish') then
    raise exception
      'marketing: mudar campanha para % exige a permissão marketing.campaign.publish',
      new.status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger campaigns_guard_publish
  before update of status on marketing.campaigns
  for each row execute function marketing.guard_publish_permission();

-- =============================================================================
-- 3. CAMPAIGN_ASSETS — as peças
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS aplicado:
--   ✅ ENTRA `channel` como TEXTO LIVRE. Um enum de canais seria o marketing
--      de uma década: quem escrevesse a lista em 2010 não teria TikTok, e
--      quem a escrever hoje não terá o que vier em 2030.
--   ✅ ENTRA `asset_ref` opaco — onde a peça mora (URL, id de GED, caminho).
--      A capacidade *GED/Documentos* é uma ENGINE à parte (Taxonomia §4);
--      este módulo guarda a referência, não o arquivo.
--   ❌ NÃO ENTRA aprovação de peça, versão, comentário, marca d'água. É
--      *Produção* e *Design*, capacidades próprias — e o fluxo de aprovação
--      muda de empresa para empresa.
--   ❌ NÃO ENTRA formato/dimensão/spec de rede. Apodrece igual ao enum.
-- =============================================================================

create table marketing.campaign_assets (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null,
  campaign_id    uuid        not null,
  -- Livre de propósito. Ver ANTI-VIÉS acima.
  channel        text        not null check (length(btrim(channel)) > 0),
  title          text        not null check (length(btrim(title)) > 0),
  -- Onde a peça mora. Opaco: o módulo não abre, não valida, não baixa.
  asset_ref      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint campaign_assets_campaign_fk
    foreign key (campaign_id, tenant_id)
    references marketing.campaigns (id, tenant_id) on delete cascade,
  constraint campaign_assets_id_tenant unique (id, tenant_id)
);

create index campaign_assets_campaign_idx
  on marketing.campaign_assets (tenant_id, campaign_id);

create trigger campaign_assets_touch
  before update on marketing.campaign_assets
  for each row execute function marketing.touch_updated_at();

alter table marketing.campaign_assets enable row level security;
alter table marketing.campaign_assets force row level security;

create policy campaign_assets_select on marketing.campaign_assets
  for select to authenticated
  using (marketing.can_access(tenant_id));

create policy campaign_assets_insert on marketing.campaign_assets
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'marketing.campaign.manage'));

create policy campaign_assets_update on marketing.campaign_assets
  for update to authenticated
  using      (core.has_permission(tenant_id, 'marketing.campaign.manage'))
  with check (core.has_permission(tenant_id, 'marketing.campaign.manage'));

create policy campaign_assets_delete on marketing.campaign_assets
  for delete to authenticated
  using (core.has_permission(tenant_id, 'marketing.campaign.manage'));

-- =============================================================================
-- 4. CAMPAIGN_RESULTS — o resultado medido
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS aplicado:
--   ✅ ENTRA `metric` como TEXTO e `value` como numérico genérico com `unit`.
--      Uma clínica mede consultas agendadas, uma fábrica mede cotações, um
--      shopping mede fluxo. Colunas fixas `impressoes`/`cliques`/`leads`
--      seriam o funil de UM negócio — e obrigariam migration a cada métrica
--      nova.
--   ✅ ENTRA `measured_at`: resultado é fato datado. Sem a data, não há série.
--   ✅ ENTRA `source` — de onde veio o número (medição manual, integração).
--      Saber a procedência é o que separa dado de palpite (Lei 7 em miniatura).
--   ❌ NÃO ENTRA ROI, CAC, CPL, taxa de conversão. São CONTAS sobre estes
--      números, e a fórmula muda por empresa. Conta é *Analytics* (ENGINE,
--      Taxonomia §4) ou é `settings`; guardar o resultado da conta como se
--      fosse fato é como um número perde a origem.
--
-- O par (métrica, momento) é único por campanha: remedir o mesmo instante é
-- correção, e correção vira UPDATE com trilha — não uma segunda linha que
-- ninguém sabe qual vale.
-- =============================================================================

create table marketing.campaign_results (
  id             uuid          primary key default gen_random_uuid(),
  tenant_id      uuid          not null,
  campaign_id    uuid          not null,
  metric         text          not null check (length(btrim(metric)) > 0),
  value          numeric(20,4) not null,
  -- A unidade do número. `null` = contagem pura.
  unit           text,
  measured_at    timestamptz   not null,
  source         text          not null default 'manual',
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  constraint campaign_results_unique_point
    unique (campaign_id, metric, measured_at),
  constraint campaign_results_campaign_fk
    foreign key (campaign_id, tenant_id)
    references marketing.campaigns (id, tenant_id) on delete cascade
);

create index campaign_results_campaign_idx
  on marketing.campaign_results (tenant_id, campaign_id, measured_at desc);

create trigger campaign_results_touch
  before update on marketing.campaign_results
  for each row execute function marketing.touch_updated_at();

alter table marketing.campaign_results enable row level security;
alter table marketing.campaign_results force row level security;

create policy campaign_results_select on marketing.campaign_results
  for select to authenticated
  using (marketing.can_access(tenant_id));

create policy campaign_results_insert on marketing.campaign_results
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'marketing.result.record'));

create policy campaign_results_update on marketing.campaign_results
  for update to authenticated
  using      (core.has_permission(tenant_id, 'marketing.result.record'))
  with check (core.has_permission(tenant_id, 'marketing.result.record'));

-- =============================================================================
-- 5. ⭐ SPEND_APPROVALS — A PROJEÇÃO LOCAL, E A PROVA DA ETAPA
-- =============================================================================
--
-- Esta tabela é o motivo de esta etapa existir. Ela guarda **a cópia local de
-- uma decisão financeira tomada em OUTRO módulo** — e guarda apenas o que veio
-- no payload do evento.
--
-- O que ela NÃO é, e o que isso prova:
--
--   · **Não é uma FK para `recon.approval_queue`.** Não há referência, não há
--     join, não há `select` em schema alheio. Se houvesse, desinstalar o recon
--     derrubaria o marketing — e o Lego seria propaganda.
--   · **Não é fonte da verdade.** A verdade da aprovação é de quem a decidiu.
--     Aqui é cópia, e `source_module_id` diz de quem.
--   · **Não é escrita por gente.** Não existe policy de INSERT, UPDATE nem
--     DELETE para `authenticated`. Só o correio escreve, com `service_role`,
--     pela função de §5.1. Deixar o cliente lançar a própria aprovação de
--     verba seria deixá-lo aprovar a própria verba.
--
-- `external_ref` é o identificador da decisão NO MÓDULO DE ORIGEM — opaco.
-- Este módulo não sabe o que é um `approvalId`, e não precisa saber: para ele
-- é uma string que veio no contrato público.
--
-- ANTI-VIÉS: nenhuma coluna aqui é de marketing. É o registro de um fato
-- externo. Qualquer empresa que amarre campanha a verba aprovada usa isto
-- igual — e quem não amarrar simplesmente nunca terá linha nesta tabela.
-- =============================================================================

create table marketing.spend_approvals (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references core.tenants (id) on delete cascade,
  -- Quem decidiu. Texto, não FK: módulo não referencia módulo.
  source_module_id text        not null,
  -- O id da decisão no módulo de origem. Opaco para este módulo.
  external_ref     text        not null,
  decision         text        not null check (decision in ('approved', 'rejected')),
  amount_cents     bigint,
  currency         char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  decided_at       timestamptz,
  -- Quando ESTE módulo soube. Diferente de `decided_at` de propósito: a
  -- distância entre os dois é a latência do correio, e é diagnóstico.
  received_at      timestamptz not null default now(),
  -- ⭐ A CHAVE DA IDEMPOTÊNCIA NO BANCO.
  --
  -- O correio já garante uma entrega por consumidor (`processed_events`).
  -- Isto aqui é o cinto além do suspensório: um replay vindo por qualquer
  -- outro caminho — reprocessamento manual, restauração, um segundo correio
  -- ligado por engano — bate neste `unique` e não duplica o efeito.
  constraint spend_approvals_unique_fact
    unique (tenant_id, source_module_id, external_ref)
);

create index spend_approvals_ref_idx
  on marketing.spend_approvals (tenant_id, external_ref);

alter table marketing.spend_approvals enable row level security;
alter table marketing.spend_approvals force row level security;

-- Só leitura, e só para quem acessa o módulo. Escrita é do correio.
create policy spend_approvals_select on marketing.spend_approvals
  for select to authenticated
  using (marketing.can_access(tenant_id));

-- ⛔ Sem policy de INSERT/UPDATE/DELETE para `authenticated`. É deliberado, e
-- há teste no CI que prova que um usuário real não consegue escrever aqui.

-- -----------------------------------------------------------------------------
-- 5.1 A FUNÇÃO QUE O CORREIO CHAMA
-- -----------------------------------------------------------------------------
-- Recebe o conteúdo do payload — e SÓ o conteúdo do payload. Repare que não há
-- um `select` sequer fora do schema `marketing`.
--
-- Faz duas coisas, na mesma transação:
--   1. grava a projeção (uma vez — `on conflict do nothing`);
--   2. carimba o `budget_status` das campanhas que apontam para aquela
--      referência.
--
-- E devolve quantas campanhas foram afetadas, sendo **0 quando o fato já era
-- conhecido**. É assim que "o efeito acontece uma vez só" deixa de ser
-- promessa e vira retorno conferível.
--
-- ⚠️ SECURITY DEFINER porque quem chama é o correio, que roda com
-- `service_role` do lado de fora — mas a função não recebe `tenant_id` de
-- lugar nenhum além do próprio envelope, e o envelope é do Core.
-- -----------------------------------------------------------------------------

create or replace function marketing.record_spend_decision(
  p_tenant_id        uuid,
  p_source_module_id text,
  p_external_ref     text,
  p_decision         text,
  p_amount_cents     bigint  default null,
  p_currency         char(3) default null,
  p_decided_at       timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted uuid;
  v_touched  integer := 0;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'marketing.record_spend_decision: decisão % não reconhecida', p_decision;
  end if;

  insert into marketing.spend_approvals (
    tenant_id, source_module_id, external_ref, decision,
    amount_cents, currency, decided_at
  )
  values (
    p_tenant_id, p_source_module_id, p_external_ref, p_decision,
    p_amount_cents, p_currency, p_decided_at
  )
  on conflict (tenant_id, source_module_id, external_ref) do nothing
  returning id into v_inserted;

  -- Fato já conhecido: nada a fazer. É aqui que a reentrega para de doer.
  if v_inserted is null then
    return 0;
  end if;

  update marketing.campaigns c
     set budget_status = p_decision
   where c.tenant_id  = p_tenant_id
     and c.budget_ref = p_external_ref
     -- Campanha já encerrada ou cancelada não muda de estado por causa de
     -- verba: o dinheiro chegou tarde, e reescrever o passado é pior do que
     -- não registrar.
     and c.status in ('draft', 'scheduled', 'published');

  get diagnostics v_touched = row_count;
  return v_touched;
end;
$$;

comment on function marketing.record_spend_decision(uuid, text, text, text, bigint, char, timestamptz) is
  'Projeta localmente uma decisão de verba vinda de OUTRO módulo, pelo payload do evento. Idempotente: devolve 0 quando o fato já era conhecido. Nenhum acesso a schema alheio.';

-- =============================================================================
-- 6. OS EVENTOS QUE ESTE MÓDULO CONTA AO MUNDO
-- -----------------------------------------------------------------------------
-- Três, e todos declarados no ModuleManifest. Nada sai daqui que não esteja lá.
-- Verbo no passado, sempre: evento é fato consumado, não pedido.
-- =============================================================================

create or replace function marketing.on_campaign_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status = old.status then
    return new;
  end if;

  v_type := case new.status
              when 'published' then 'marketing.campaign.published'
              when 'completed' then 'marketing.campaign.completed'
              when 'cancelled' then 'marketing.campaign.cancelled'
              else null
            end;

  -- Rascunho e agendamento não são fato para o mundo — são trabalho interno.
  -- Emitir evento para cada rascunho salvo encheria a caixa de saída de ruído
  -- e faria o tenant pagar por ele (a cobrança conta evento entregue).
  if v_type is null then
    return new;
  end if;

  perform marketing.emit_event(
    new.tenant_id,
    v_type,
    jsonb_build_object(
      'campaignId',         new.id,
      'name',               new.name,
      'previousStatus',     old.status,
      'scheduledFor',       new.scheduled_for,
      'publishedAt',        new.published_at,
      'completedAt',        new.completed_at,
      'budgetPlannedCents', new.budget_planned_cents,
      'currency',           new.currency,
      'budgetStatus',       new.budget_status
    )
  );
  return new;
end;
$$;

create trigger campaigns_emit_status
  after update of status on marketing.campaigns
  for each row execute function marketing.on_campaign_status_changed();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- RLS decide linha a linha; GRANT decide se a porta existe. As duas coisas.
-- =============================================================================

revoke all on schema marketing                from public, anon, authenticated;
revoke all on all tables    in schema marketing from public, anon, authenticated;
revoke all on all functions in schema marketing from public, anon, authenticated;

grant usage on schema marketing to authenticated;

grant select, insert, update         on marketing.campaigns        to authenticated;
grant select, insert, update, delete on marketing.campaign_assets  to authenticated;
grant select, insert, update         on marketing.campaign_results to authenticated;
-- ⛔ SÓ SELECT. A projeção é escrita pelo correio, nunca pela tela.
grant select                         on marketing.spend_approvals  to authenticated;

grant execute on function marketing.can_access(uuid) to authenticated;

-- `marketing.emit_event` NÃO é concedida a `authenticated`: ninguém emite
-- evento à mão. Só os triggers a chamam, e eles são SECURITY DEFINER.
-- `marketing.record_spend_decision` NÃO é concedida a `authenticated`: quem a
-- chama é o correio, com `service_role`. Conceder aqui seria dar ao cliente a
-- caneta para aprovar a própria verba.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum dado semeado. Nenhum segredo.
-- Nenhum objeto criado em `core`. Nenhuma leitura de schema de outro módulo.
-- =============================================================================
