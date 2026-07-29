-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0025_deal.sql
-- Módulo 10: Funil Comercial. Schema `deal`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §16,
-- depois do `0024_quote.sql`.
--
-- Taxonomia: Domain 🤝 Comercial & CRM — capacidade *Pipeline*.
-- Spec: docs/canon/MODULO-DEAL-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A LEI DAS ETAPAS, SEGUNDA APLICAÇÃO: OS ESTÁGIOS SÃO DADO DO TENANT
-- -----------------------------------------------------------------------------
-- O desenho do `ops` (0018) RE-PERGUNTADO para o comercial — não copiado:
--
-- MANTIDO: estágio é linha de `deal.funnel_stages` com nome LIVRE, nunca
--   enum ('prospecção','qualificação','fechamento' é o funil de UMA casa);
--   funis MÚLTIPLOS por tenant (venda direta e licitação não andam no mesmo
--   mapa); posição `deferrable` para reordenar; DELETE de estágio permitido
--   (desenho é tentativa e erro) com a trilha sobrevivendo pelo NOME
--   CARIMBADO; trilha imutável em três camadas.
--
-- ⭐ DIVERGE 1: **O MOVIMENTO É LIVRE, nos dois sentidos.** A esteira do ops
--   é um processo com ordem de execução — avançar tem rito, voltar exige
--   devolução com instrução. O funil é um MAPA DE TEMPERATURA: a
--   oportunidade esfria e volta sem cerimônia, esquenta e pula estágio.
--   Exigir "devolução com instrução" de um vendedor transformaria o mapa em
--   burocracia — e o vendedor pararia de mover, que é a morte de qualquer
--   funil. TODO movimento vira linha imutável na trilha, com de-onde e
--   para-onde carimbados pelo nome: a liberdade é de mover, nunca de apagar.
--
-- ⭐ DIVERGE 2: **sem `requires_approval` e sem `skippable`.** Aprovação é
--   rito de execução (ops); no funil as DECISÕES são ganhar e perder, e elas
--   têm permissão própria (`deal.opportunity.decide`). Pular não existe
--   porque mover é livre.
--
-- ⭐ DIVERGE 3: **`won` e `lost` são TERMINAIS.** O `ops` reabre a OS
--   (trabalho tem identidade por serviço); aqui a negociação encerrada é
--   desfecho REGISTRADO COM RAZÃO — reabrir reescreveria o desfecho. O
--   cliente que volta em seis meses é negociação NOVA, com contexto novo, e
--   a história da anterior fica inteira para se aprender com ela.
--
-- -----------------------------------------------------------------------------
-- ⭐ A FRONTEIRA COM O CRM: ID SOLTO + NOME CARIMBADO, NUNCA FK
-- -----------------------------------------------------------------------------
-- A contraparte da oportunidade é OPCIONAL e vem do Módulo 4 — mas uma
-- `foreign key ... references crm.parties` atravessaria a fronteira de
-- schema, e a guarda da matriz ("módulo não conhece módulo") reprovaria este
-- arquivo. A lei decide pela gente: guarda-se `party_id` SOLTO + `party_name`
-- CARIMBADO no momento do ato — o desenho da trilha do ops aplicado ao
-- vínculo. Se a contraparte for arquivada, renomeada ou o crm desinstalado,
-- a oportunidade continua legível com o nome da época.
--
-- -----------------------------------------------------------------------------
-- PEDREIRA (360° PRIMA) — o que se minerou e o que se recusou
-- -----------------------------------------------------------------------------
-- MINERADO (vocabulário): value+currency · probability · expected_close_date
--   · tags. São campos que qualquer casa comercial usa como estão.
-- ⛔ NÃO MINERADO: `stage text default 'novo'` (enum implícito — a Lei das
--   Etapas mata isso); oportunidade algemada ao lead (`lead_id NOT NULL` —
--   aqui o vínculo é opcional e solto); competitors[]/pain_points[]/
--   decision_makers jsonb (metodologia de venda de UMA casa — anti-viés: a
--   `description` texto livre carrega o que a casa anotar); deal_size
--   (redundante com value); score_ia (capacidade de IA é do Core, não
--   coluna); a RLS deles (uma policy FOR ALL sem FORCE).
-- =============================================================================

create schema if not exists deal;

comment on schema deal is
  'Módulo Funil Comercial. Domain crm da Taxonomia. Estágios são dado do tenant; movimento livre com trilha imutável. Não cria objeto em core nem lê schema alheio; fala só por core.event_outbox.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima vez que este bloco aparece. O padrão é lei.
-- =============================================================================

create or replace function deal.emit_event(
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
  if p_event_type not like 'deal.%' then
    raise exception 'deal.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'deal',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function deal.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function deal.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'deal.funnel.design')
      or core.has_permission(p_tenant_id, 'deal.opportunity.manage')
      or core.has_permission(p_tenant_id, 'deal.opportunity.decide');
$$;

create or replace function deal.touch_updated_at()
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
-- 2. FUNNELS + FUNNEL_STAGES — o mapa que o tenant desenha
-- =============================================================================

create table deal.funnels (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  description text        not null default '',
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint funnels_id_tenant unique (id, tenant_id)
);

create unique index funnels_unique_active_name
  on deal.funnels (tenant_id, lower(name))
  where status = 'active';

create trigger funnels_touch
  before update on deal.funnels
  for each row execute function deal.touch_updated_at();

alter table deal.funnels enable row level security;
alter table deal.funnels force row level security;

create policy funnels_select on deal.funnels
  for select to authenticated
  using (deal.can_access(tenant_id));

create policy funnels_insert on deal.funnels
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'deal.funnel.design'));

create policy funnels_update on deal.funnels
  for update to authenticated
  using (core.has_permission(tenant_id, 'deal.funnel.design'))
  with check (core.has_permission(tenant_id, 'deal.funnel.design'));

-- ⛔ Sem policy de DELETE. Funil que já rodou negociação é história.

-- ⭐ Sem `requires_approval`, sem `skippable`, e a ausência é a DIVERGÊNCIA 2
-- do cabeçalho: as decisões do funil são ganhar e perder, e têm permissão
-- própria. O estágio é só posição e nome — do tenant.
create table deal.funnel_stages (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  funnel_id  uuid        not null,
  position   integer     not null check (position >= 0),
  name       text        not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stages_id_tenant unique (id, tenant_id),
  constraint stages_funnel_fk
    foreign key (funnel_id, tenant_id)
    references deal.funnels (id, tenant_id)
    on delete cascade,
  -- `deferrable`: reordenar é trocar duas posições, e a troca passa por um
  -- instante em que as duas são iguais. Mesma decisão do ops, mesmo motivo.
  constraint stages_position_unique unique (funnel_id, position)
    deferrable initially deferred
);

create index stages_funnel_idx
  on deal.funnel_stages (tenant_id, funnel_id, position);

create trigger stages_touch
  before update on deal.funnel_stages
  for each row execute function deal.touch_updated_at();

alter table deal.funnel_stages enable row level security;
alter table deal.funnel_stages force row level security;

create policy stages_select on deal.funnel_stages
  for select to authenticated
  using (deal.can_access(tenant_id));

create policy stages_insert on deal.funnel_stages
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'deal.funnel.design'));

create policy stages_update on deal.funnel_stages
  for update to authenticated
  using (core.has_permission(tenant_id, 'deal.funnel.design'))
  with check (core.has_permission(tenant_id, 'deal.funnel.design'));

-- A ÚNICA porta de DELETE do módulo: desenhar é tentativa e erro. A trilha
-- sobrevive pelo NOME CARIMBADO; a oportunidade parada segura o estágio pela
-- FK `restrict` abaixo.
create policy stages_delete on deal.funnel_stages
  for delete to authenticated
  using (core.has_permission(tenant_id, 'deal.funnel.design'));

-- =============================================================================
-- 3. OPPORTUNITIES — a negociação
-- =============================================================================

create table deal.opportunities (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  funnel_id           uuid        not null,
  current_stage_id    uuid,
  title               text        not null check (length(btrim(title)) > 0),
  description         text        not null default '',
  -- ⭐ VOCABULÁRIO PRIMA, decisão nossa: valor SEMPRE com moeda, sem default.
  value_cents         bigint      check (value_cents is null or value_cents >= 0),
  currency            char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  -- Probabilidade da MÃO HUMANA, 0–100. Score de máquina é capacidade da
  -- Forja, e teria coluna própria no dia em que existir — mão ≠ máquina.
  probability         integer     check (probability is null or (probability >= 0 and probability <= 100)),
  expected_close_date date,
  -- ⭐ ID SOLTO + NOME CARIMBADO — ver o cabeçalho. Nunca FK para crm.
  party_id            uuid,
  party_name          text,
  tags                text[]      not null default '{}',
  status              text        not null default 'open'
                      check (status in ('open', 'won', 'lost')),
  -- A razão do desfecho. Obrigatória na perda (ver §5).
  outcome_reason      text        not null default '',
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint opportunities_id_tenant unique (id, tenant_id),
  constraint opportunities_funnel_fk
    foreign key (funnel_id, tenant_id)
    references deal.funnels (id, tenant_id)
    on delete restrict,
  -- ⚠️ `restrict`: o estágio onde há negociação parada não se apaga — o
  -- contrapeso da única porta de DELETE, como no ops.
  constraint opportunities_stage_fk
    foreign key (current_stage_id, tenant_id)
    references deal.funnel_stages (id, tenant_id)
    on delete restrict,
  -- Valor e moeda andam juntos: valor sem moeda é número que mente.
  constraint opportunities_value_currency check (
    (value_cents is null and currency is null) or
    (value_cents is not null and currency is not null)
  ),
  -- Aberta está num estágio; encerrada saiu do mapa.
  constraint opportunities_stage_coherent check (
    (status = 'open' and current_stage_id is not null) or
    (status in ('won', 'lost'))
  )
);

create index opportunities_board_idx
  on deal.opportunities (tenant_id, funnel_id, current_stage_id)
  where status = 'open';
create index opportunities_party_idx
  on deal.opportunities (tenant_id, party_id)
  where party_id is not null;

create trigger opportunities_touch
  before update on deal.opportunities
  for each row execute function deal.touch_updated_at();

alter table deal.opportunities enable row level security;
alter table deal.opportunities force row level security;

create policy opportunities_select on deal.opportunities
  for select to authenticated
  using (deal.can_access(tenant_id));

create policy opportunities_insert on deal.opportunities
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'deal.opportunity.manage'));

create policy opportunities_update on deal.opportunities
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'deal.opportunity.manage')
    or core.has_permission(tenant_id, 'deal.opportunity.decide')
  )
  with check (
    core.has_permission(tenant_id, 'deal.opportunity.manage')
    or core.has_permission(tenant_id, 'deal.opportunity.decide')
  );

-- ⛔ Sem policy de DELETE. Negociação perdida é a aula mais cara da casa.

-- -----------------------------------------------------------------------------
-- 3.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/deals
-- -----------------------------------------------------------------------------

create or replace function deal.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('open', 'won'),
    ('open', 'lost')
  );
$$;

comment on function deal.allowed_transition(text, text) is
  'Ciclo de vida da oportunidade. Espelho de ALLOWED_TRANSITIONS em @alsham/deals. won e lost são TERMINAIS: o cliente que volta é negociação nova.';

-- O porteiro: mudar status por UPDATE direto é recusado — ganhar e perder
-- passam pelas FUNÇÕES (§5), que escrevem a trilha e conferem a razão. O
-- porteiro existe para o UPDATE "esperto" não contornar o rito.
create or replace function deal.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not deal.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: negociação encerrada é desfecho registrado — voltar é oportunidade nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'deal.opportunity.decide') then
    raise exception 'ganhar ou perder é decisão: exige a permissão deal.opportunity.decide'
      using errcode = '42501';
  end if;

  if new.status = 'lost' and length(btrim(new.outcome_reason)) = 0 then
    raise exception 'perder exige a razão: o funil existe para se aprender por que se perde'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger opportunities_guard_status
  before update of status on deal.opportunities
  for each row execute function deal.guard_status_transition();

-- =============================================================================
-- 4. OPPORTUNITY_EVENTS — ⭐ A TRILHA, E ELA É IMUTÁVEL (três camadas)
-- -----------------------------------------------------------------------------
-- `from_stage_id`/`to_stage_id` SOLTOS + NOME CARIMBADO: o estágio é dado
-- vivo do tenant — renomeia, reordena, some — e a trilha de 2026 tem de ser
-- legível em 2028 com o vocabulário de 2026. Regra do ops, mantida.
-- =============================================================================

create table deal.opportunity_events (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  opportunity_id  uuid        not null,
  kind            text        not null check (kind in ('opened', 'moved', 'won', 'lost')),
  from_stage_id   uuid,
  from_stage_name text,
  to_stage_id     uuid,
  to_stage_name   text,
  note            text        not null default '',
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid        references auth.users (id) on delete set null,
  constraint opportunity_events_fk
    foreign key (opportunity_id, tenant_id)
    references deal.opportunities (id, tenant_id)
    on delete restrict
);

create index opportunity_events_timeline_idx
  on deal.opportunity_events (tenant_id, opportunity_id, occurred_at desc);

alter table deal.opportunity_events enable row level security;
alter table deal.opportunity_events force row level security;

create policy opportunity_events_select on deal.opportunity_events
  for select to authenticated
  using (deal.can_access(tenant_id));

-- ⚠️ Sem policy de INSERT: quem escreve são as funções de §5, que conferem a
-- permissão do ato ANTES. Trilha que a aplicação escreve direto é trilha que
-- a aplicação pode escrever errado.

create or replace function deal.guard_trail_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a trilha da oportunidade é registro de fato consumado: não se edita nem se apaga. Registre outro movimento.'
    using errcode = '42501';
end;
$$;

create trigger opportunity_events_immutable
  before update or delete on deal.opportunity_events
  for each row execute function deal.guard_trail_immutable();

-- =============================================================================
-- 5. OS ATOS — mover, ganhar, perder
-- -----------------------------------------------------------------------------
-- Funções `security definer` porque escrevem na trilha (sem porta de INSERT).
-- A PRIMEIRA coisa que cada uma faz é conferir o acesso no tenant da
-- OPORTUNIDADE — nunca num tenant recebido por parâmetro.
-- =============================================================================

create or replace function deal.opportunity_payload(p deal.opportunities)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'opportunityId', p.id,
    'title',         p.title,
    'status',        p.status,
    'funnelId',      p.funnel_id,
    'funnelName',    (select f.name from deal.funnels f where f.id = p.funnel_id),
    'stageId',       p.current_stage_id,
    'stageName',     (select s.name from deal.funnel_stages s where s.id = p.current_stage_id),
    'valueCents',    p.value_cents,
    'currency',      p.currency,
    'probability',   p.probability,
    'expectedCloseDate', p.expected_close_date,
    'partyId',       p.party_id,
    'partyName',     p.party_name,
    'tags',          to_jsonb(p.tags),
    'outcomeReason', p.outcome_reason
  );
$$;

comment on function deal.opportunity_payload(deal.opportunities) is
  'O envelope de uma oportunidade — AUTOSSUFICIENTE: funil e estágio pelo NOME, contraparte pelo nome carimbado.';

-- ⭐ MOVER — livre nos dois sentidos, sempre com linha na trilha.
create or replace function deal.move_opportunity(
  p_opportunity_id uuid,
  p_to_stage_id    uuid,
  p_note           text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp      deal.opportunities;
  v_de       deal.funnel_stages;
  v_para     deal.funnel_stages;
  v_event_id uuid;
begin
  select * into v_opp from deal.opportunities where id = p_opportunity_id;
  if v_opp.id is null then
    raise exception 'oportunidade não encontrada' using errcode = 'P0002';
  end if;

  if not deal.can_access(v_opp.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_opp.tenant_id, 'deal.opportunity.manage') then
    raise exception 'mover a oportunidade exige a permissão deal.opportunity.manage'
      using errcode = '42501';
  end if;

  if v_opp.status <> 'open' then
    raise exception 'oportunidade encerrada não se move: o desfecho já foi registrado'
      using errcode = '22023';
  end if;

  select * into v_para
    from deal.funnel_stages
   where id = p_to_stage_id and funnel_id = v_opp.funnel_id;

  if v_para.id is null then
    raise exception 'o estágio de destino não pertence ao funil desta oportunidade'
      using errcode = '22023';
  end if;

  if v_para.id = v_opp.current_stage_id then
    raise exception 'a oportunidade já está neste estágio' using errcode = '22023';
  end if;

  select * into v_de from deal.funnel_stages where id = v_opp.current_stage_id;

  insert into deal.opportunity_events (
    tenant_id, opportunity_id, kind,
    from_stage_id, from_stage_name, to_stage_id, to_stage_name,
    note, actor_user_id
  ) values (
    v_opp.tenant_id, v_opp.id, 'moved',
    v_de.id, v_de.name, v_para.id, v_para.name,
    coalesce(p_note, ''), (select auth.uid())
  )
  returning id into v_event_id;

  update deal.opportunities
     set current_stage_id = v_para.id
   where id = v_opp.id;

  return v_event_id;
end;
$$;

comment on function deal.move_opportunity(uuid, uuid, text) is
  'Move a oportunidade para QUALQUER estágio do funil dela — o movimento é livre; a trilha é obrigatória.';

-- ⭐ GANHAR e PERDER — os ATOS. Perder exige razão; ganhar aceita nota.
create or replace function deal.close_opportunity(
  p_opportunity_id uuid,
  p_outcome        text,
  p_reason         text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp      deal.opportunities;
  v_stage    deal.funnel_stages;
  v_event_id uuid;
begin
  if p_outcome not in ('won', 'lost') then
    raise exception 'desfecho % não existe: uma negociação se ganha ou se perde', p_outcome
      using errcode = '22023';
  end if;

  select * into v_opp from deal.opportunities where id = p_opportunity_id;
  if v_opp.id is null then
    raise exception 'oportunidade não encontrada' using errcode = 'P0002';
  end if;

  if not deal.can_access(v_opp.tenant_id) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if not core.has_permission(v_opp.tenant_id, 'deal.opportunity.decide') then
    raise exception 'ganhar ou perder é decisão: exige a permissão deal.opportunity.decide'
      using errcode = '42501';
  end if;

  if v_opp.status <> 'open' then
    raise exception 'oportunidade encerrada não se encerra de novo' using errcode = '22023';
  end if;

  if p_outcome = 'lost' and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'perder exige a razão: o funil existe para se aprender por que se perde'
      using errcode = '22023';
  end if;

  -- O nome do estágio se lê ANTES do update — depois dele a oportunidade já
  -- saiu do mapa e o carimbo se perderia.
  select * into v_stage from deal.funnel_stages where id = v_opp.current_stage_id;

  -- O UPDATE vem PRIMEIRO (e passa pelo porteiro de §3.1, que reconfere
  -- permissão e razão): a trilha nasce depois, para o fato emitido pelo
  -- gatilho dela sair com o desfecho JÁ GRAVADO — um fato `won` com payload
  -- dizendo `open` seria o envelope mentindo sobre o próprio ato.
  update deal.opportunities
     set status = p_outcome,
         outcome_reason = btrim(coalesce(p_reason, '')),
         current_stage_id = null
   where id = v_opp.id;

  insert into deal.opportunity_events (
    tenant_id, opportunity_id, kind,
    from_stage_id, from_stage_name, note, actor_user_id
  ) values (
    v_opp.tenant_id, v_opp.id, p_outcome,
    v_stage.id, v_stage.name, btrim(coalesce(p_reason, '')), (select auth.uid())
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function deal.close_opportunity(uuid, text, text) is
  'Encerra a negociação: won ou lost. Perder EXIGE a razão. O desfecho é terminal — voltar é oportunidade nova.';

-- =============================================================================
-- 6. OS FATOS
-- =============================================================================

-- 6.1 `deal.opportunity.opened` — nasce com a primeira linha da trilha.
create or replace function deal.on_opportunity_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_name text;
begin
  select name into v_stage_name
    from deal.funnel_stages where id = new.current_stage_id;

  insert into deal.opportunity_events (
    tenant_id, opportunity_id, kind, to_stage_id, to_stage_name, note, actor_user_id
  ) values (
    new.tenant_id, new.id, 'opened', new.current_stage_id, v_stage_name, '', (select auth.uid())
  );

  perform deal.emit_event(new.tenant_id, 'deal.opportunity.opened', deal.opportunity_payload(new));
  return new;
end;
$$;

create trigger opportunities_emit_opened
  after insert on deal.opportunities
  for each row execute function deal.on_opportunity_opened();

-- 6.2 `deal.opportunity.updated` — só o que MUDA O FATO da negociação.
create or replace function deal.on_opportunity_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    return new;   -- o desfecho tem fatos próprios, emitidos pela trilha.
  end if;

  if new.value_cents is distinct from old.value_cents
     or new.currency is distinct from old.currency
     or new.probability is distinct from old.probability
     or new.expected_close_date is distinct from old.expected_close_date
     or new.party_id is distinct from old.party_id then
    perform deal.emit_event(new.tenant_id, 'deal.opportunity.updated', deal.opportunity_payload(new));
  end if;

  return new;
end;
$$;

create trigger opportunities_emit_updated
  after update on deal.opportunities
  for each row execute function deal.on_opportunity_updated();

-- 6.3 Os fatos de movimento e desfecho — emitidos a partir da TRILHA, como no
-- ops: a trilha já sabe o que foi feito, porque foi ela quem registrou.
create or replace function deal.on_trail_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp  deal.opportunities;
  v_type text;
begin
  v_type := case new.kind
              when 'moved' then 'deal.opportunity.moved'
              when 'won'   then 'deal.opportunity.won'
              when 'lost'  then 'deal.opportunity.lost'
              else null
            end;

  if v_type is null then
    return new;   -- `opened` tem gatilho próprio.
  end if;

  select * into v_opp from deal.opportunities where id = new.opportunity_id;

  perform deal.emit_event(
    new.tenant_id,
    v_type,
    deal.opportunity_payload(v_opp) || jsonb_build_object(
      'movementId',  new.id,
      'occurredAt',  new.occurred_at,
      'fromStageId', new.from_stage_id,
      'fromStage',   new.from_stage_name,
      'toStageId',   new.to_stage_id,
      'toStage',     new.to_stage_name,
      'note',        new.note
    )
  );
  return new;
end;
$$;

create trigger opportunity_events_emit
  after insert on deal.opportunity_events
  for each row execute function deal.on_trail_movement();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema deal                  from public, anon, authenticated;
revoke all on all tables    in schema deal from public, anon, authenticated;
revoke all on all functions in schema deal from public, anon, authenticated;

grant usage on schema deal to authenticated;

grant select, insert, update on deal.funnels to authenticated;

-- A ÚNICA com DELETE — a trilha sobrevive pelo nome carimbado.
grant select, insert, update, delete on deal.funnel_stages to authenticated;

grant select, insert, update on deal.opportunities to authenticated;

-- ⛔ SÓ SELECT: a trilha se escreve pelas funções de §5.
grant select on deal.opportunity_events to authenticated;

grant execute on function deal.can_access(uuid)                       to authenticated;
grant execute on function deal.move_opportunity(uuid, uuid, text)     to authenticated;
grant execute on function deal.close_opportunity(uuid, text, text)    to authenticated;

-- `deal.emit_event` NÃO é concedida. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de estágio. Nenhum funil semeado — semear
-- um seria escolher o processo do cliente por ele. Nenhum objeto fora de
-- `deal`. Nenhuma leitura de schema alheio — nem do crm: o vínculo é solto.
-- =============================================================================
