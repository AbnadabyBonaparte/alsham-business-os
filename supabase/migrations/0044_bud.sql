-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0044_bud.sql
-- Módulo 29: Orçamentos. Schema `bud`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §20.
-- ⚠️ ESTA MIGRATION TRAZ CONSUMIDOR: o apps/api PRECISA de redeploy no apply
-- (a inscrição da projeção só existe no build novo). Ver runbook §20.
--
-- Taxonomia: Domain 💰 Financeiro — capacidade *Orçamento*.
-- Spec: docs/canon/MODULO-BUD-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ ATIVAR CONGELA A TRAVE — a física do goal, re-perguntada para o DINHEIRO
-- -----------------------------------------------------------------------------
-- O orçamento nasce no rascunho (edita-se). ATIVAR carimba e CONGELA a trave:
-- categoria, período e teto. Mover o teto no meio do período desmoraliza o
-- controle — um orçamento que se ajusta ao gasto não controla nada. É o
-- MANTIDO consciente do goal (a meta congela a trave ao ativar): dinheiro e
-- ambição partilham a física de "a régua não se move no meio do jogo". Há
-- teste de contraste goal×bud que assina a decisão. Período fechado é
-- TERMINAL — o período que vem é orçamento NOVO.
--
-- -----------------------------------------------------------------------------
-- ⭐ O REALIZADO É CALCULADO, NUNCA COLUNA — e vem do LIVRO do cash
-- -----------------------------------------------------------------------------
-- O gasto realizado NÃO se digita e NÃO é coluna. Ele é a SOMA dos
-- lançamentos do Fluxo de Caixa que caem na categoria e no período do
-- orçamento — projetados localmente por evento (`cash.entry.registered`), o
-- padrão E10 (dun/marketing). A projeção é alimentada SÓ por
-- `bud.record_external_movement()` (§5); o cliente LÊ. O saldo (teto −
-- realizado) é VIEW, calculado na leitura. Coluna de realizado é coluna que
-- alguém edita — e o CI barra qualquer uma.
--
-- ⭐ **A origem vem SEMPRE de envelope.producedBy**, por parâmetro, nunca
-- chumbada: um segundo produtor do mesmo formato grava a origem DELE. E o
-- módulo NÃO conhece o cash: não importa o pacote, não lê o schema, não cita
-- o nome de quem emite — o acoplamento é com o TIPO DO EVENTO, contrato
-- público (guarda "módulo não conhece módulo" no CI).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS / FORA (spec §5): categoria é DADO DO TENANT (texto livre, aqui
-- é O dado — a lição do cash); orçamento de RECEITA e por CENTRO são leituras
-- futuras declaradas; previsão/rolagem automática de período é cron fingido.
-- valor+moeda SEMPRE juntos.
-- =============================================================================

create schema if not exists bud;

comment on schema bud is
  'Módulo Orçamentos. Domain finance da Taxonomia. Ativar congela a trave (física do goal no dinheiro); o realizado é a soma do livro do cash projetada por evento — calculado, nunca coluna. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima nona vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function bud.emit_event(
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
  if p_event_type not like 'bud.%' then
    raise exception 'bud.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'bud',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function bud.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function bud.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'bud.budget.manage')
      or core.has_permission(p_tenant_id, 'bud.budget.close');
$$;

create or replace function bud.touch_updated_at()
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
-- 2. BUDGETS — o teto por categoria e período; ativar congela a trave
-- =============================================================================

create table bud.budgets (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  name         text        not null check (length(btrim(name)) > 0),
  -- ⭐ A categoria é O dado (não-vazia): é a chave que casa com o cash.
  category     text        not null check (length(btrim(category)) > 0),
  starts_on    date        not null,
  ends_on      date        not null,
  limit_cents  bigint      not null check (limit_cents > 0),
  currency     char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  status       text        not null default 'draft'
               check (status in ('draft', 'active', 'closed')),
  activated_at timestamptz,
  activated_by uuid        references auth.users (id) on delete set null,
  closed_at    timestamptz,
  closed_by    uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint bud_budgets_id_tenant unique (id, tenant_id),
  constraint bud_budgets_period check (ends_on >= starts_on),
  constraint bud_budgets_active_coherent check (
    (status = 'draft' and activated_at is null) or
    (status in ('active', 'closed') and activated_at is not null)
  ),
  constraint bud_budgets_closed_coherent check (
    (status = 'closed' and closed_at is not null) or
    (status in ('draft', 'active') and closed_at is null)
  )
);

create index bud_budgets_idx
  on bud.budgets (tenant_id, status, starts_on desc);
create index bud_budgets_match_idx
  on bud.budgets (tenant_id, lower(category), currency);

create trigger bud_budgets_touch
  before update on bud.budgets
  for each row execute function bud.touch_updated_at();

alter table bud.budgets enable row level security;
alter table bud.budgets force row level security;

create policy bud_budgets_select on bud.budgets
  for select to authenticated
  using (bud.can_access(tenant_id));

create policy bud_budgets_insert on bud.budgets
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'bud.budget.manage'));

create policy bud_budgets_update on bud.budgets
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'bud.budget.manage')
    or core.has_permission(tenant_id, 'bud.budget.close')
  )
  with check (
    core.has_permission(tenant_id, 'bud.budget.manage')
    or core.has_permission(tenant_id, 'bud.budget.close')
  );

-- ⛔ Sem DELETE. Orçamento com história é história; fecha-se o período.

create or replace function bud.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft',  'active'),
    ('active', 'closed')
  );
$$;

comment on function bud.allowed_transition(text, text) is
  'Ciclo de vida do orçamento. Espelho de ALLOWED_TRANSITIONS em @alsham/budgets. closed é TERMINAL — o período que vem é orçamento novo.';

create or replace function bud.stamp_budget_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'o orçamento nasce no rascunho: ativar é ato à parte'
      using errcode = '22023';
  end if;
  new.activated_at := null; new.activated_by := null;
  new.closed_at := null; new.closed_by := null;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger bud_budgets_stamp
  before insert on bud.budgets
  for each row execute function bud.stamp_budget_insert();

-- ⭐ O PORTEIRO: ativar carimba e CONGELA a trave; fechar exige a permissão
-- própria; a trave não se move depois de ativa.
create or replace function bud.guard_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- ⭐ A TRAVE CONGELA: categoria, período e teto não mudam com o
    -- orçamento ativo (ou fechado). Só o rascunho é plano. O nome segue
    -- vivo — gente renomeia.
    if old.status <> 'draft'
       and (new.category is distinct from old.category
            or new.starts_on is distinct from old.starts_on
            or new.ends_on is distinct from old.ends_on
            or new.limit_cents is distinct from old.limit_cents
            or new.currency is distinct from old.currency) then
      raise exception 'a trave congelou na ativação: categoria, período e teto não mudam — o próximo período é orçamento novo'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not bud.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: o período fechado é terminal — o que vem é orçamento novo',
      old.status, new.status using errcode = '22023';
  end if;

  if new.status = 'active' then
    new.activated_at := now();
    new.activated_by := (select auth.uid());
  end if;

  if new.status = 'closed' then
    if not core.has_permission(new.tenant_id, 'bud.budget.close') then
      raise exception 'fechar o período é decisão: exige a permissão bud.budget.close'
        using errcode = '42501';
    end if;
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger bud_budgets_guard_status
  before update on bud.budgets
  for each row execute function bud.guard_transition();

-- =============================================================================
-- 3. REALIZED_MOVEMENTS — ⭐ a projeção do cash (padrão E10)
-- -----------------------------------------------------------------------------
-- Alimentada SÓ por `bud.record_external_movement()` (§5). O cliente LÊ; não
-- escreve. A origem vem de envelope.producedBy, por parâmetro.
-- =============================================================================

create table bud.realized_movements (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  source_module_id    text        not null check (length(btrim(source_module_id)) > 0),
  external_ref        text        not null,
  category_name       text        not null check (length(btrim(category_name)) > 0),
  currency            char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  occurred_on         date        not null,
  signed_amount_cents bigint      not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- ⭐ Idempotência por documento: a reentrega do correio não conta duas vezes.
  constraint bud_realized_unique_ref unique (tenant_id, external_ref)
);

create index bud_realized_match_idx
  on bud.realized_movements (tenant_id, lower(category_name), currency, occurred_on);

alter table bud.realized_movements enable row level security;
alter table bud.realized_movements force row level security;

create policy bud_realized_select on bud.realized_movements
  for select to authenticated
  using (bud.can_access(tenant_id));

-- ⛔ Nenhuma policy de escrita: quem escreve é a projeção (§5), service_role.

-- =============================================================================
-- 4. O REALIZADO E O SALDO — VIEW calculada, jamais coluna
-- -----------------------------------------------------------------------------
-- ⚠️ security_invoker: sem ela a view somaria o gasto de todos os tenants.
-- O realizado é o DESEMBOLSO (saída) que casa categoria + período + moeda.
-- =============================================================================

create view bud.budget_realized
  with (security_invoker = true)
as
select b.id                                                        as budget_id,
       b.tenant_id,
       b.limit_cents,
       b.currency,
       coalesce(sum(case when m.signed_amount_cents < 0
                         then -m.signed_amount_cents else 0 end), 0) as realized_cents,
       b.limit_cents
         - coalesce(sum(case when m.signed_amount_cents < 0
                             then -m.signed_amount_cents else 0 end), 0) as remaining_cents,
       count(m.id)                                                 as movement_count
  from bud.budgets b
  left join bud.realized_movements m
    on m.tenant_id     = b.tenant_id
   and lower(m.category_name) = lower(b.category)
   and m.currency      = b.currency
   and m.occurred_on  between b.starts_on and b.ends_on
 group by b.id, b.tenant_id, b.limit_cents, b.currency;

comment on view bud.budget_realized is
  'O realizado (desembolso que casa categoria+período+moeda) e o saldo (teto − realizado) — calculados do livro projetado. Nunca coluna. security_invoker: a RLS decide o que entra na soma.';

-- =============================================================================
-- 5. ⭐ A PORTA DE PROJEÇÃO — espelho consciente da recon/dun
-- -----------------------------------------------------------------------------
-- Idempotente por (tenant_id, external_ref). A origem vem por argumento
-- (envelope.producedBy). Só service_role — o cliente não projeta.
-- =============================================================================

create or replace function bud.record_external_movement(
  p_tenant_id           uuid,
  p_source_module_id    text,
  p_external_ref        text,
  p_category_name       text,
  p_currency            char(3),
  p_occurred_on         date,
  p_signed_amount_cents bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touched integer;
begin
  if p_source_module_id is null or length(btrim(p_source_module_id)) = 0 then
    raise exception 'bud.record_external_movement: origem do lançamento não informada'
      using errcode = '22023';
  end if;
  if p_category_name is null or length(btrim(p_category_name)) = 0 then
    raise exception 'bud.record_external_movement: lançamento sem categoria não casa orçamento'
      using errcode = '22023';
  end if;

  insert into bud.realized_movements (
    tenant_id, source_module_id, external_ref, category_name,
    currency, occurred_on, signed_amount_cents
  )
  values (
    p_tenant_id, p_source_module_id, p_external_ref, btrim(p_category_name),
    p_currency, p_occurred_on, p_signed_amount_cents
  )
  on conflict (tenant_id, external_ref) do update
     set source_module_id    = excluded.source_module_id,
         category_name       = excluded.category_name,
         currency            = excluded.currency,
         occurred_on         = excluded.occurred_on,
         signed_amount_cents = excluded.signed_amount_cents,
         updated_at          = now()
   where (bud.realized_movements.category_name, bud.realized_movements.currency,
          bud.realized_movements.occurred_on, bud.realized_movements.signed_amount_cents)
         is distinct from
         (btrim(excluded.category_name), excluded.currency,
          excluded.occurred_on, excluded.signed_amount_cents);

  get diagnostics v_touched = row_count;
  return case when v_touched > 0 then 'projected' else 'unchanged' end;
end;
$$;

comment on function bud.record_external_movement(uuid, text, text, text, char, date, bigint) is
  'Projeta um lançamento do cash no livro local do orçamento. Idempotente por (tenant_id, external_ref). Origem por argumento (envelope.producedBy). Só service_role.';

-- =============================================================================
-- 6. OS FATOS
-- =============================================================================

create or replace function bud.budget_payload(p bud.budgets)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'budgetId',   p.id,
    'name',       p.name,
    'category',   p.category,
    'startsOn',   p.starts_on,
    'endsOn',     p.ends_on,
    'limitCents', p.limit_cents,
    'currency',   p.currency,
    'status',     p.status
  );
$$;

create or replace function bud.on_budget_opened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform bud.emit_event(new.tenant_id, 'bud.budget.opened', bud.budget_payload(new));
  return new;
end;
$$;

create trigger bud_budgets_emit_opened
  after insert on bud.budgets
  for each row execute function bud.on_budget_opened();

create or replace function bud.on_budget_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform bud.emit_event(
      new.tenant_id,
      case when new.status = 'active' then 'bud.budget.activated'
           else 'bud.budget.closed' end,
      bud.budget_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger bud_budgets_emit_changed
  after update on bud.budgets
  for each row execute function bud.on_budget_changed();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema bud                  from public, anon, authenticated;
revoke all on all tables    in schema bud from public, anon, authenticated;
revoke all on all functions in schema bud from public, anon, authenticated;

grant usage on schema bud to authenticated;

grant select, insert, update on bud.budgets to authenticated;

-- ⛔ SÓ SELECT na projeção: quem escreve é bud.record_external_movement().
grant select on bud.realized_movements to authenticated;
grant select on bud.budget_realized    to authenticated;

grant execute on function bud.can_access(uuid) to authenticated;

-- ⛔ `bud.record_external_movement` NÃO é concedida a authenticated — só
-- service_role a chama, pela composição do apps/api. `bud.emit_event` e os
-- payloads são encanamento. `anon` não recebe NADA.

-- =============================================================================
-- FIM. Nenhuma coluna de realizado/saldo. Nenhum INSERT de cliente na
-- projeção. Nenhuma FK para o cash. Nenhuma leitura de schema alheio. A
-- trave congela; o realizado é calculado.
-- =============================================================================
