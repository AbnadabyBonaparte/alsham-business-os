-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0068_proj.sql
-- Módulo 53: Projetos. Schema `proj`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §25, o
-- primeiro módulo da Onda Doze (Fase 2 — o Domain PMO & Projetos, o MAIOR do
-- mapa: 10 capacidades, "mercado bilionário próprio"). Nasce sob
-- `domain_key='pmo'`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Projetos* (§5).
-- Spec: docs/canon/MODULO-PROJ-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A FÍSICA DO ENCERRAMENTO É A DO `bud`/`dem` — RE-PERGUNTADA
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- projeto nasce `planning`, vira `active`, e termina em `completed` ou
-- `cancelled` — os dois TERMINAIS (a física do `bud`/`dem`: período fechado não
-- reabre; aqui, projeto encerrado é registro fechado, e o próximo é projeto
-- novo). O DIVERGE é dos módulos que reabrem (o `ops`/`sched`): um PROJETO
-- concluído não volta a andar — reabrir seria fingir que o encerramento não
-- aconteceu.
--
-- ⭐ **Concluir e cancelar não pedem a mesma coisa:** cancelar (ABANDONAR) exige
-- uma RAZÃO — abandonar precisa de porquê. Concluir tem uma nota OPCIONAL — o
-- fim natural não precisa se justificar. A assimetria é a decisão.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA nome e descrição em TEXTO LIVRE. O que é um "projeto" — uma obra,
--      uma campanha, uma implantação, uma pesquisa — é vocabulário de cada casa.
--   ❌ NÃO ENTRA orçamento consolidado do projeto (é o `pcost` desta onda,
--      módulo próprio), aprovação formal de abertura (capacidade futura, seria
--      o `recon` genérico por id solto), nem WBS/EAP estruturada.
-- =============================================================================

create schema if not exists proj;

comment on schema proj is
  'Módulo Projetos. Domain pmo (PMO & Projetos) da Taxonomia. O projeto nasce planning, vira active, e termina em completed ou cancelled — os dois TERMINAIS (a física do bud/dem). Cancelar exige razão; concluir tem nota opcional. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function proj.emit_event(
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
  if p_event_type not like 'proj.%' then
    raise exception 'proj.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'proj',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function proj.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function proj.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'proj.project.manage');
$$;

create or replace function proj.touch_updated_at()
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
-- 2. PROJECTS — o registro do projeto
-- =============================================================================

create table proj.projects (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  name            text        not null check (length(btrim(name)) > 0),
  description     text        not null default '',
  status          text        not null default 'planning'
                  check (status in ('planning', 'active', 'completed', 'cancelled')),
  -- Nota de conclusão: OPCIONAL (o fim natural não se justifica).
  completion_note text        not null default '',
  -- Razão do cancelamento: OBRIGATÓRIA ao cancelar (abandonar precisa de porquê).
  cancel_reason   text        not null default '',
  activated_at    timestamptz,
  activated_by    uuid        references auth.users (id) on delete set null,
  closed_at       timestamptz,
  closed_by       uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid        references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint proj_projects_id_tenant unique (id, tenant_id),
  -- ⭐ O estado e o carimbo de fechamento contam a MESMA história: fechado ⇔
  -- terminal. Fora dos terminais, não há carimbo de fechamento.
  constraint proj_projects_close_coherent check (
    (status in ('completed', 'cancelled') and closed_at is not null)
    or
    (status in ('planning', 'active') and closed_at is null)
  )
);

create index proj_projects_open_idx
  on proj.projects (tenant_id, created_at desc)
  where status in ('planning', 'active');

create trigger proj_projects_touch
  before update on proj.projects
  for each row execute function proj.touch_updated_at();

alter table proj.projects enable row level security;
alter table proj.projects force row level security;

create policy proj_projects_select on proj.projects
  for select to authenticated
  using (proj.can_access(tenant_id));

create policy proj_projects_insert on proj.projects
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'proj.project.manage'));

create policy proj_projects_update on proj.projects
  for update to authenticated
  using (proj.can_access(tenant_id))
  with check (proj.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Projeto encerrado é história.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre PLANNING, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function proj.guard_project_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'planning' then
    raise exception 'o projeto nasce em planejamento — ativar e encerrar são decisões à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger proj_projects_stamp
  before insert on proj.projects
  for each row execute function proj.guard_project_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/proj
-- -----------------------------------------------------------------------------
-- ⭐ planning→active (iniciar), planning→cancelled (abandonar antes de começar),
-- active→completed (concluir), active→cancelled (abandonar em andamento).
-- completed e cancelled são TERMINAIS: o projeto encerrado não reabre.

create or replace function proj.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('planning', 'active'),
    ('planning', 'cancelled'),
    ('active',   'completed'),
    ('active',   'cancelled')
  );
$$;

comment on function proj.allowed_transition(text, text) is
  'Ciclo de vida do projeto. Espelho de ALLOWED_TRANSITIONS em @alsham/proj — há teste que lê este arquivo e compara. completed e cancelled são TERMINAIS: o projeto encerrado não reabre (a física do bud/dem, o DIVERGE do ops/sched que reabrem).';

create or replace function proj.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not proj.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do projeto: o projeto encerrado não reabre',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'proj.project.manage') then
    raise exception 'mover o projeto exige a permissão proj.project.manage'
      using errcode = '42501';
  end if;

  -- Iniciar: carimba quem/quando pelo servidor.
  if new.status = 'active' then
    new.activated_at := now();
    new.activated_by := (select auth.uid());
  end if;

  -- Concluir: carimba o fechamento; a nota é OPCIONAL.
  if new.status = 'completed' then
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  -- ⭐ Cancelar: EXIGE razão — abandonar precisa de porquê — e carimba o fechamento.
  if new.status = 'cancelled' then
    if length(btrim(new.cancel_reason)) = 0 then
      raise exception 'cancelar o projeto exige uma razão'
        using errcode = '22023';
    end if;
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger proj_projects_guard_status
  before update of status on proj.projects
  for each row execute function proj.guard_status_transition();

-- ⭐ E o conteúdo (nome/descrição) CONGELA quando o projeto encerra: um projeto
-- fechado é história. Editar em planning/active é livre.
create or replace function proj.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('completed', 'cancelled')
     and (new.name is distinct from old.name
          or new.description is distinct from old.description) then
    raise exception 'o projeto já foi encerrado (%): nome e descrição não mudam mais', old.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger proj_projects_content_frozen
  before update on proj.projects
  for each row execute function proj.guard_content_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function proj.project_payload(p_project_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project proj.projects;
begin
  select * into v_project
    from proj.projects
   where id = p_project_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'name',           v_project.name,
    'status',         v_project.status,
    'completionNote', v_project.completion_note,
    'cancelReason',   v_project.cancel_reason,
    'activatedAt',    v_project.activated_at,
    'closedAt',       v_project.closed_at
  );
end;
$$;

comment on function proj.project_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE do projeto. Quem escuta não faz join.';

create or replace function proj.on_project_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform proj.emit_event(
    new.tenant_id,
    'proj.project.registered',
    proj.project_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger proj_projects_emit_registered
  after insert on proj.projects
  for each row execute function proj.on_project_registered();

create or replace function proj.on_project_changed()
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
                when 'active'    then 'proj.project.activated'
                when 'completed' then 'proj.project.completed'
                when 'cancelled' then 'proj.project.cancelled'
                else null
              end;
    if v_type is not null then
      perform proj.emit_event(new.tenant_id, v_type, proj.project_payload(new.id, new.tenant_id));
    end if;
  end if;

  return new;
end;
$$;

create trigger proj_projects_emit_changed
  after update of status on proj.projects
  for each row execute function proj.on_project_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema proj                  from public, anon, authenticated;
revoke all on all tables    in schema proj from public, anon, authenticated;
revoke all on all functions in schema proj from public, anon, authenticated;

grant usage on schema proj to authenticated;

grant select, insert, update on proj.projects to authenticated;

grant execute on function proj.can_access(uuid) to authenticated;

-- `proj.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `proj.project_payload` NÃO é concedida: é encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de tipo de projeto. Nenhum nome de cliente.
-- Nenhum objeto fora de `proj`. Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
