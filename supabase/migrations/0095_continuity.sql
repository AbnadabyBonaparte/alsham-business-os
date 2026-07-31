-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0095_continuity.sql
-- Módulo 80: Continuidade de Negócios. Schema `continuity`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §32, o
-- SEXTO e último módulo da Onda Dezenove (Fase 3). Nasce sob
-- `domain_key='infosec'`.
--
-- Taxonomia: Domain 🔐 Segurança da Informação — capacidade *Continuidade de
-- negócios* (§5).
-- Spec: docs/canon/MODULO-CONTINUITY-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ O RECORTE — e por que NÃO é só o `pol`
-- -----------------------------------------------------------------------------
-- Um plano de continuidade (BCP/DRP) tem duas partes: o DOCUMENTO (o texto do
-- plano, com procedimentos) e a PRÁTICA (os testes/drills periódicos que provam
-- que o plano FUNCIONA). Investigado:
--   • O DOCUMENTO detalhado é o `pol` (Política): documento versionado com
--     ciência. Um BCP escrito pode viver lá — declarado, não duplicado.
--   • O que JUSTIFICA um módulo próprio é a PRÁTICA: o plano com seus alvos
--     (RTO/RPO) + o LIVRO DE DRILLS. Um plano de continuidade que nunca foi
--     testado é papel; o valor está no registro dos testes, e é isso que nem o
--     `pol` nem nenhum módulo existente guarda.
--
-- ⭐ O DRILL É LIVRO IMUTÁVEL (a física do `timesheet`/`control.tests`): cada
-- teste é um FATO CONSUMADO (data, cenário, desfecho, nota). A evidência de que
-- o plano foi exercitado não se rasura.
--
-- ⭐ RTO/RPO em TEXTO LIVRE (não número): "4 horas", "1 dia útil", "última
-- transação confirmada" — a forma como cada casa expressa o alvo é vocabulário
-- dela; congelar num inteiro de minutos faria o produto brigar com quem mede em
-- "meio período".
--
-- ⛔ FORA: o procedimento detalhado do plano (é o `pol`); failover automático /
-- orquestração de DR (operação da plataforma/infra); árvore de chamadas
-- estruturada (Engine de Notificações). `consumes` VAZIO.
-- =============================================================================

create schema if not exists continuity;

comment on schema continuity is
  'Módulo Continuidade de Negócios. Domain infosec da Taxonomia. O plano de continuidade (nome, escopo, RTO/RPO texto livre; active ↔ archived) + o LIVRO IMUTÁVEL de drills (data, cenário, desfecho, nota — a física do timesheet). O documento detalhado do plano é o pol (declarado FORA). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function continuity.emit_event(
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
  if p_event_type not like 'continuity.%' then
    raise exception 'continuity.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'continuity',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function continuity.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function continuity.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'continuity.plan.manage')
      or core.has_permission(p_tenant_id, 'continuity.plan.decide');
$$;

create or replace function continuity.touch_updated_at()
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
-- 2. PLANS — o cadastro dos planos de continuidade
-- =============================================================================

create table continuity.plans (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  scope       text        not null default '',
  -- ⭐ Os alvos em TEXTO LIVRE (nunca inteiro de minutos).
  rto         text        not null default '',
  rpo         text        not null default '',
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint continuity_plans_id_tenant unique (id, tenant_id)
);

create index continuity_plans_roster_idx
  on continuity.plans (tenant_id, status, name);

create trigger continuity_plans_touch
  before update on continuity.plans
  for each row execute function continuity.touch_updated_at();

alter table continuity.plans enable row level security;
alter table continuity.plans force row level security;

create policy continuity_plans_select on continuity.plans
  for select to authenticated
  using (continuity.can_access(tenant_id));

create policy continuity_plans_insert on continuity.plans
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'continuity.plan.manage'));

create policy continuity_plans_update on continuity.plans
  for update to authenticated
  using (continuity.can_access(tenant_id))
  with check (continuity.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Plano com drills é história.

create or replace function continuity.guard_plan_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o plano nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger continuity_plans_stamp
  before insert on continuity.plans
  for each row execute function continuity.guard_plan_insert();

-- ⭐ active ↔ archived — a física do vendor.
create or replace function continuity.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function continuity.allowed_transition(text, text) is
  'Ciclo de vida do plano. Espelho de ALLOWED_TRANSITIONS em @alsham/continuity. active ↔ archived (o plano descontinuado volta — a física do vendor).';

create or replace function continuity.guard_plan_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not continuity.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do plano', old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'continuity.plan.decide') then
    raise exception 'arquivar ou reativar um plano exige a permissão continuity.plan.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger continuity_plans_guard_status
  before update of status on continuity.plans
  for each row execute function continuity.guard_plan_transition();

-- =============================================================================
-- 3. DRILLS — ⭐ O LIVRO IMUTÁVEL de testes do plano (física do timesheet)
-- =============================================================================

create table continuity.drills (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null,
  plan_id     uuid        not null,
  drilled_on  date        not null,
  scenario    text        not null check (length(btrim(scenario)) > 0),
  outcome     text        not null check (length(btrim(outcome)) > 0),
  note        text        not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  constraint continuity_drills_plan_fk
    foreign key (plan_id, tenant_id)
    references continuity.plans (id, tenant_id) on delete restrict
);

create index continuity_drills_book_idx
  on continuity.drills (tenant_id, plan_id, drilled_on desc);

alter table continuity.drills enable row level security;
alter table continuity.drills force row level security;

create policy continuity_drills_select on continuity.drills
  for select to authenticated
  using (continuity.can_access(tenant_id));

create policy continuity_drills_insert on continuity.drills
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'continuity.plan.manage'));

-- ⛔ SEM policy de UPDATE/DELETE — o drill é fato consumado.

create or replace function continuity.guard_drill_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger continuity_drills_stamp
  before insert on continuity.drills
  for each row execute function continuity.guard_drill_insert();

create or replace function continuity.guard_drill_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o drill de continuidade é fato consumado: não se edita nem se apaga. Registre outro.'
    using errcode = '42501';
end;
$$;

create trigger continuity_drills_immutable
  before update or delete on continuity.drills
  for each row execute function continuity.guard_drill_immutable();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function continuity.plan_payload(p continuity.plans)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'planId', p.id,
    'name',   p.name,
    'scope',  p.scope,
    'rto',    p.rto,
    'rpo',    p.rpo,
    'status', p.status
  );
$$;

comment on function continuity.plan_payload(continuity.plans) is
  'O envelope de um plano — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function continuity.on_plan_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform continuity.emit_event(new.tenant_id, 'continuity.plan.registered', continuity.plan_payload(new));
  return new;
end;
$$;

create trigger continuity_plans_emit_registered
  after insert on continuity.plans
  for each row execute function continuity.on_plan_registered();

create or replace function continuity.on_plan_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform continuity.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'continuity.plan.archived'
           else 'continuity.plan.reopened' end,
      continuity.plan_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger continuity_plans_emit_changed
  after update on continuity.plans
  for each row execute function continuity.on_plan_changed();

create or replace function continuity.on_drill_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform continuity.emit_event(
    new.tenant_id, 'continuity.drill.recorded',
    jsonb_build_object('planId', new.plan_id, 'drillId', new.id, 'drilledOn', new.drilled_on)
  );
  return new;
end;
$$;

create trigger continuity_drills_emit_recorded
  after insert on continuity.drills
  for each row execute function continuity.on_drill_recorded();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema continuity                  from public, anon, authenticated;
revoke all on all tables    in schema continuity from public, anon, authenticated;
revoke all on all functions in schema continuity from public, anon, authenticated;

grant usage on schema continuity to authenticated;

grant select, insert, update on continuity.plans to authenticated;
-- ⛔ SÓ SELECT e INSERT no livro de drills: reescrever não existe.
grant select, insert on continuity.drills to authenticated;

grant execute on function continuity.can_access(uuid) to authenticated;

-- `continuity.emit_event` e os payloads NÃO são concedidos. `anon` nada.

-- =============================================================================
-- FIM. Nenhum INSERT. O documento do plano é o pol (FORA). O drill é imutável.
-- RTO/RPO texto livre. Nenhum objeto fora de `continuity`. Nenhuma leitura de
-- schema alheio. `consumes` VAZIO.
-- =============================================================================
