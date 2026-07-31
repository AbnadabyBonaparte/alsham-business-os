-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0063_dem.sql
-- Módulo 48: Planejamento de Demanda. Schema `dem`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §24, o
-- primeiro módulo da Onda Onze (Fase 2 — o Domain Supply Chain). Nasce sob
-- `domain_key='supply-chain'` — território SEPARADO de Compras (Taxonomia §5:
-- "Supply Chain — separado de Compras").
--
-- Taxonomia: Domain 🔗 Supply Chain — capacidade *Planejamento de demanda* (§5).
-- Spec: docs/canon/MODULO-DEM-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A IDENTIDADE É A DO `rfq`/`quote` — RE-PERGUNTADA — E O DIVERGE ASSINADO
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- plano de demanda REUSA a física do documento congelável: nasce `draft`,
-- PUBLICAR CONGELA as linhas (o que foi planejado não muda mais depois de
-- comunicado à cadeia).
--
-- ⭐ O DIVERGE do `rfq`: o `rfq` tem um SEGUNDO ato depois de enviar (o comprador
-- PREMIA — `open→awarded`). O plano de demanda NÃO: `published` é TERMINAL. Não
-- há "responder" nem "premiar" — o próximo período é PLANO NOVO. É a física do
-- `bud` (período fechado não reabre), assinada no `lifecycle.test.ts`: o `rfq`
-- tem `open→awarded`; o `dem` não tem transição alguma a partir de `published`.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o período em TEXTO LIVRE ("Q1 2027", "Março/2027", "Safra 26/27") —
--      o horizonte de planejamento é vocabulário de cada empresa. E as linhas em
--      texto livre (produto/categoria + quantidade planejada + unidade).
--   ❌ NÃO ENTRA previsão estatística/algorítmica — isso é ENGINE de IA (a Forja),
--      não módulo de Domain. Aqui o número é posto por GENTE (Lei 7).
--   ❌ NÃO ENTRA integração com vendas históricas — precisaria de handler real
--      consumindo eventos de vendas (capacidade futura declarada, não construída).
--   ❌ NÃO ENTRA vínculo FK — o plano não conhece o schema de ninguém.
-- =============================================================================

create schema if not exists dem;

comment on schema dem is
  'Módulo Planejamento de Demanda. Domain supply-chain (Supply Chain) da Taxonomia — separado de Compras. O plano nasce draft, PUBLICAR (draft→published) CONGELA as linhas, e published é TERMINAL (o próximo período é plano novo — a física do bud). O DIVERGE do rfq: lá há um segundo ato (awarded); aqui published encerra. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function dem.emit_event(
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
  if p_event_type not like 'dem.%' then
    raise exception 'dem.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'dem',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function dem.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function dem.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'dem.plan.manage');
$$;

create or replace function dem.touch_updated_at()
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
-- 2. PLANS — o cabeçalho do plano de demanda
-- =============================================================================

create table dem.plans (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Período em TEXTO LIVRE — o horizonte é dado do tenant, jamais enum.
  period        text        not null check (length(btrim(period)) > 0),
  title         text        not null default '',
  status        text        not null default 'draft'
                check (status in ('draft', 'published', 'cancelled')),
  cancel_reason text        not null default '',
  published_at  timestamptz,
  published_by  uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint dem_plans_id_tenant unique (id, tenant_id),
  -- ⭐ O estado e o carimbo de publicação contam a MESMA história, ou um mente:
  -- published ⇔ tem carimbo de quando. Fora de published, não há carimbo.
  constraint dem_plans_publish_coherent check (
    (status = 'published' and published_at is not null)
    or
    (status <> 'published' and published_at is null)
  )
);

create index dem_plans_draft_idx
  on dem.plans (tenant_id, created_at desc)
  where status = 'draft';

create trigger dem_plans_touch
  before update on dem.plans
  for each row execute function dem.touch_updated_at();

alter table dem.plans enable row level security;
alter table dem.plans force row level security;

create policy dem_plans_select on dem.plans
  for select to authenticated
  using (dem.can_access(tenant_id));

create policy dem_plans_insert on dem.plans
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'dem.plan.manage'));

create policy dem_plans_update on dem.plans
  for update to authenticated
  using (dem.can_access(tenant_id))
  with check (dem.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Plano publicado é história de planejamento.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre RASCUNHO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function dem.guard_plan_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'o plano nasce em rascunho — publicar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger dem_plans_stamp
  before insert on dem.plans
  for each row execute function dem.guard_plan_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/dem
-- -----------------------------------------------------------------------------
-- ⭐ draft→published (publicar), draft→cancelled (abandonar o rascunho).
-- published e cancelled são TERMINAIS. O DIVERGE do rfq: NÃO há segundo ato
-- (nada de awarded) — publicar ENCERRA. O próximo período é plano novo.

create or replace function dem.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft', 'published'),
    ('draft', 'cancelled')
  );
$$;

comment on function dem.allowed_transition(text, text) is
  'Ciclo de vida do plano. Espelho de ALLOWED_TRANSITIONS em @alsham/dem — há teste que lê este arquivo e compara. published e cancelled são TERMINAIS. O DIVERGE do rfq: não há segundo ato a partir de published (nada de awarded) — publicar encerra.';

-- =============================================================================
-- 3. PLAN_LINES — as linhas planejadas (texto livre, sem catálogo)
-- =============================================================================

create table dem.plan_lines (
  id           uuid           primary key default gen_random_uuid(),
  tenant_id    uuid           not null,
  plan_id      uuid           not null,
  line_no      integer        not null check (line_no > 0),
  product      text           not null check (length(btrim(product)) > 0),
  quantity     numeric(18, 4) not null check (quantity > 0),
  unit         text           not null default '',
  created_at   timestamptz    not null default now(),
  constraint dem_plan_lines_line unique (plan_id, line_no),
  constraint dem_plan_lines_plan_fk
    foreign key (plan_id, tenant_id)
    references dem.plans (id, tenant_id) on delete cascade
);

create index dem_plan_lines_plan_idx on dem.plan_lines (plan_id);

alter table dem.plan_lines enable row level security;
alter table dem.plan_lines force row level security;

create policy dem_plan_lines_select on dem.plan_lines
  for select to authenticated
  using (dem.can_access(tenant_id));

create policy dem_plan_lines_insert on dem.plan_lines
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'dem.plan.manage'));

create policy dem_plan_lines_update on dem.plan_lines
  for update to authenticated
  using (core.has_permission(tenant_id, 'dem.plan.manage'))
  with check (core.has_permission(tenant_id, 'dem.plan.manage'));

-- Linha sai SÓ do rascunho: o que foi publicado não se apaga.
create policy dem_plan_lines_delete on dem.plan_lines
  for delete to authenticated
  using (
    core.has_permission(tenant_id, 'dem.plan.manage')
    and exists (
      select 1 from dem.plans p
       where p.id = plan_id and p.tenant_id = tenant_id and p.status = 'draft'
    )
  );

-- ⭐ A linha do plano PUBLICADO não muda: o gatilho recusa INSERT/UPDATE/DELETE
-- fora do rascunho.
create or replace function dem.guard_line_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from dem.plans
   where id = coalesce(new.plan_id, old.plan_id)
     and tenant_id = coalesce(new.tenant_id, old.tenant_id);

  if v_status is distinct from 'draft' then
    raise exception 'o plano já foi publicado (%): as linhas não mudam mais — o próximo período é plano novo', v_status
      using errcode = '22023';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger dem_plan_lines_frozen
  before insert or update or delete on dem.plan_lines
  for each row execute function dem.guard_line_frozen();

-- =============================================================================
-- 3.1 O PORTEIRO DO ESTADO — e o carimbo da publicação
-- =============================================================================

create or replace function dem.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not dem.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do plano: o próximo período é plano novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- ⭐ PUBLICAR exige conteúdo: plano sem linha não vai à cadeia. O carimbo de
  -- quem/quando é do SERVIDOR — a tela não escolhe autor nem hora.
  if new.status = 'published' then
    if not core.has_permission(new.tenant_id, 'dem.plan.manage') then
      raise exception 'publicar o plano exige a permissão dem.plan.manage'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from dem.plan_lines l
       where l.plan_id = new.id and l.tenant_id = new.tenant_id
    ) then
      raise exception 'publicar o plano exige ao menos uma linha'
        using errcode = '22023';
    end if;
    new.published_at := now();
    new.published_by := (select auth.uid());
  end if;

  -- Cancelar (abandonar o rascunho) exige razão.
  if new.status = 'cancelled' then
    if not core.has_permission(new.tenant_id, 'dem.plan.manage') then
      raise exception 'cancelar o plano exige a permissão dem.plan.manage'
        using errcode = '42501';
    end if;
    if length(btrim(new.cancel_reason)) = 0 then
      raise exception 'cancelar o plano exige uma razão'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger dem_plans_guard_status
  before update of status on dem.plans
  for each row execute function dem.guard_status_transition();

-- ⭐ E o período/título CONGELAM quando o plano sai do rascunho.
create or replace function dem.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and (new.period is distinct from old.period
          or new.title is distinct from old.title) then
    raise exception 'o plano já foi publicado (%): período e título não mudam mais', old.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger dem_plans_content_frozen
  before update on dem.plans
  for each row execute function dem.guard_content_frozen();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS — envelope AUTOSSUFICIENTE (inclui as linhas)
-- =============================================================================

create or replace function dem.plan_payload(p_plan_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan  dem.plans;
  v_lines jsonb;
begin
  select * into v_plan
    from dem.plans
   where id = p_plan_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineNo',   l.line_no,
      'product',  l.product,
      'quantity', l.quantity,
      'unit',     l.unit
    ) order by l.line_no
  ), '[]'::jsonb)
    into v_lines
    from dem.plan_lines l
   where l.plan_id = p_plan_id
     and l.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'period',       v_plan.period,
    'title',        v_plan.title,
    'status',       v_plan.status,
    'publishedAt',  v_plan.published_at,
    'cancelReason', v_plan.cancel_reason,
    'lines',        v_lines
  );
end;
$$;

comment on function dem.plan_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE do plano — inclui as linhas planejadas. Quem escuta não faz join.';

create or replace function dem.on_plan_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform dem.emit_event(
    new.tenant_id,
    'dem.plan.registered',
    dem.plan_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger dem_plans_emit_registered
  after insert on dem.plans
  for each row execute function dem.on_plan_registered();

create or replace function dem.on_plan_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is distinct from old.status then
    v_type := case new.status
                when 'published' then 'dem.plan.published'
                when 'cancelled' then 'dem.plan.cancelled'
                else null
              end;
    if v_type is not null then
      perform dem.emit_event(new.tenant_id, v_type, dem.plan_payload(new.id, new.tenant_id));
    end if;
  end if;

  return new;
end;
$$;

create trigger dem_plans_emit_changed
  after update of status on dem.plans
  for each row execute function dem.on_plan_changed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema dem                  from public, anon, authenticated;
revoke all on all tables    in schema dem from public, anon, authenticated;
revoke all on all functions in schema dem from public, anon, authenticated;

grant usage on schema dem to authenticated;

grant select, insert, update on dem.plans to authenticated;
grant select, insert, update, delete on dem.plan_lines to authenticated;

grant execute on function dem.can_access(uuid) to authenticated;

-- `dem.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `dem.plan_payload` NÃO é concedida: é encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de produto. Nenhum nome de cliente. Nenhum
-- objeto fora de `dem`. Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
