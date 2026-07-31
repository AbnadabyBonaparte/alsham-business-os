-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0073_scrum.sql
-- Módulo 58: Scrum / Sprints. Schema `scrum`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §26, o
-- primeiro módulo da Onda Treze (Fase 2 — FECHA o Domain PMO & Projetos, o
-- MAIOR do mapa: com esta onda o PMO tem as 10 capacidades). Nasce sob
-- `domain_key='pmo'`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Scrum* (§5).
-- Spec: docs/canon/MODULO-SCRUM-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ O QUE ESTE MÓDULO NÃO RECONSTRÓI — e por quê (a ressalva de honestidade)
-- -----------------------------------------------------------------------------
-- "Scrum", como conceito de mercado, é em boa parte um MÉTODO sobre dados que
-- já existem. Os ITENS DE TRABALHO de um sprint são os CARTÕES do `kanban`
-- (Módulo 55) — este módulo NÃO tem tabela de itens, e isso é decisão, não
-- esquecimento. Vincular cartões a sprints seria acoplar dois módulos; a
-- composição que cruza "os cartões deste sprint" mora na TELA (se e quando for
-- construída), nunca no schema. Aqui o recorte GENUÍNO de dado novo é a
-- MOLDURA TEMPORAL: o time-box (o sprint em si — nome, objetivo, janela) e a
-- regra de que UM projeto tem NO MÁXIMO UM sprint ativo por vez.
--
-- ⭐ A REGRA "UM SPRINT ATIVO POR PROJETO" mora numa CONSTRAINT, não em código
-- de aplicação (a lição do `spc`/`shift`: a física do domínio vive no banco).
-- É um índice único PARCIAL sobre (tenant, projeto) onde status='active'.
--
-- ⭐ `closed` é TERMINAL (a física do `bud`/`proj`): o sprint encerrado não
-- reabre; o próximo sprint é registro novo.
--
-- ANTI-VIÉS: nome e objetivo do sprint em TEXTO LIVRE. Vínculo ao projeto por
-- ID SOLTO (o `proj` não é lido). `consumes` VAZIO.
-- =============================================================================

create schema if not exists scrum;

comment on schema scrum is
  'Módulo Scrum / Sprints. Domain pmo da Taxonomia. O sprint é a MOLDURA TEMPORAL (time-box) de um projeto — não tem itens (os itens são os cartões do kanban; composição de tela, não de schema). UM projeto tem no máximo UM sprint active (índice único parcial). closed é TERMINAL. Vínculo ao proj por id solto. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function scrum.emit_event(
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
  if p_event_type not like 'scrum.%' then
    raise exception 'scrum.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'scrum',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function scrum.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function scrum.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'scrum.sprint.manage');
$$;

create or replace function scrum.touch_updated_at()
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
-- 2. SPRINTS — a moldura temporal
-- =============================================================================

create table scrum.sprints (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ O projeto por ID SOLTO — o scrum não conhece o schema do proj.
  project_id   uuid        not null,
  project_name text        not null default '',
  name         text        not null check (length(btrim(name)) > 0),
  goal         text        not null default '',
  starts_on    date,
  ends_on      date,
  status       text        not null default 'planned'
               check (status in ('planned', 'active', 'closed')),
  activated_at timestamptz,
  activated_by uuid        references auth.users (id) on delete set null,
  closed_at    timestamptz,
  closed_by    uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint scrum_sprints_id_tenant unique (id, tenant_id),
  -- janela coerente quando as duas datas existem.
  constraint scrum_sprints_window check (ends_on is null or starts_on is null or ends_on >= starts_on),
  -- ⭐ closed ⇔ tem carimbo de fechamento.
  constraint scrum_sprints_close_coherent check (
    (status = 'closed' and closed_at is not null)
    or
    (status <> 'closed' and closed_at is null)
  )
);

-- ⭐⭐ A REGRA NA CONSTRAINT: no máximo UM sprint `active` por projeto (por
-- tenant). Ativar um segundo bate aqui — a física do domínio no banco, não na
-- aplicação (a lição do spc/shift).
create unique index scrum_sprints_one_active
  on scrum.sprints (tenant_id, project_id)
  where status = 'active';

create index scrum_sprints_open_idx
  on scrum.sprints (tenant_id, created_at desc)
  where status in ('planned', 'active');

create trigger scrum_sprints_touch
  before update on scrum.sprints
  for each row execute function scrum.touch_updated_at();

alter table scrum.sprints enable row level security;
alter table scrum.sprints force row level security;

create policy scrum_sprints_select on scrum.sprints
  for select to authenticated
  using (scrum.can_access(tenant_id));

create policy scrum_sprints_insert on scrum.sprints
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'scrum.sprint.manage'));

create policy scrum_sprints_update on scrum.sprints
  for update to authenticated
  using (scrum.can_access(tenant_id))
  with check (scrum.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Sprint encerrado é história.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre PLANNED, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function scrum.guard_sprint_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'planned' then
    raise exception 'o sprint nasce planejado — ativar e encerrar são decisões à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger scrum_sprints_stamp
  before insert on scrum.sprints
  for each row execute function scrum.guard_sprint_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/scrum
-- -----------------------------------------------------------------------------
-- ⭐ planned→active (iniciar), planned→closed (encerrar sem rodar),
-- active→closed (encerrar em andamento). closed é TERMINAL.

create or replace function scrum.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('planned', 'active'),
    ('planned', 'closed'),
    ('active',  'closed')
  );
$$;

comment on function scrum.allowed_transition(text, text) is
  'Ciclo de vida do sprint. Espelho de ALLOWED_TRANSITIONS em @alsham/scrum — há teste que lê este arquivo e compara. closed é TERMINAL (a física do bud/proj): o próximo sprint é registro novo.';

create or replace function scrum.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not scrum.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do sprint: o encerrado não reabre',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'scrum.sprint.manage') then
    raise exception 'mover o sprint exige a permissão scrum.sprint.manage'
      using errcode = '42501';
  end if;

  if new.status = 'active' then
    new.activated_at := now();
    new.activated_by := (select auth.uid());
  end if;

  if new.status = 'closed' then
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger scrum_sprints_guard_status
  before update of status on scrum.sprints
  for each row execute function scrum.guard_status_transition();

-- ⭐ O conteúdo (nome/objetivo/janela) CONGELA quando o sprint encerra.
create or replace function scrum.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed'
     and (new.name is distinct from old.name
          or new.goal is distinct from old.goal
          or new.starts_on is distinct from old.starts_on
          or new.ends_on is distinct from old.ends_on) then
    raise exception 'o sprint já foi encerrado: nome, objetivo e janela não mudam mais'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger scrum_sprints_content_frozen
  before update on scrum.sprints
  for each row execute function scrum.guard_content_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function scrum.sprint_payload(p_sprint_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sprint scrum.sprints;
begin
  select * into v_sprint from scrum.sprints
   where id = p_sprint_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'projectId',   v_sprint.project_id,
    'projectName', v_sprint.project_name,
    'name',        v_sprint.name,
    'goal',        v_sprint.goal,
    'status',      v_sprint.status,
    'startsOn',    v_sprint.starts_on,
    'endsOn',      v_sprint.ends_on,
    'activatedAt', v_sprint.activated_at,
    'closedAt',    v_sprint.closed_at
  );
end;
$$;

comment on function scrum.sprint_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE do sprint. Quem escuta não faz join.';

create or replace function scrum.on_sprint_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform scrum.emit_event(
    new.tenant_id, 'scrum.sprint.registered',
    scrum.sprint_payload(new.id, new.tenant_id));
  return new;
end;
$$;

create trigger scrum_sprints_emit_registered
  after insert on scrum.sprints
  for each row execute function scrum.on_sprint_registered();

create or replace function scrum.on_sprint_changed()
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
                when 'active' then 'scrum.sprint.activated'
                when 'closed' then 'scrum.sprint.closed'
                else null
              end;
    if v_type is not null then
      perform scrum.emit_event(new.tenant_id, v_type, scrum.sprint_payload(new.id, new.tenant_id));
    end if;
  end if;

  return new;
end;
$$;

create trigger scrum_sprints_emit_changed
  after update of status on scrum.sprints
  for each row execute function scrum.on_sprint_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema scrum                  from public, anon, authenticated;
revoke all on all tables    in schema scrum from public, anon, authenticated;
revoke all on all functions in schema scrum from public, anon, authenticated;

grant usage on schema scrum to authenticated;

grant select, insert, update on scrum.sprints to authenticated;

grant execute on function scrum.can_access(uuid) to authenticated;

-- `scrum.emit_event` e `scrum.sprint_payload` NÃO são concedidas. `anon` nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma tabela de itens (são os cartões do kanban).
-- Nenhum nome de cliente. Nenhum objeto fora de `scrum`. Nenhuma leitura de
-- schema alheio. `consumes` VAZIO.
-- =============================================================================
