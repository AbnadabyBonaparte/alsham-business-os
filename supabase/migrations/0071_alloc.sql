-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0071_alloc.sql
-- Módulo 56: Recursos / Alocação. Schema `alloc`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §25, um dos
-- módulos da Onda Doze (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa: 10
-- capacidades). Nasce sob `domain_key='pmo'`, ao lado do `proj`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Recursos* (§5).
-- Spec: docs/canon/MODULO-ALLOC-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ PERCENTUAL, NÃO HORAS — a decisão de anti-viés deste módulo
-- -----------------------------------------------------------------------------
-- Uma alocação diz QUANTO de um recurso vai a um projeto. A pergunta foi: em
-- horas ou em percentual? Horas dependem do CALENDÁRIO e da DURAÇÃO do projeto
-- (quantas horas por dia, quantos dias) — nada disso este módulo modela; modelar
-- isso seria um TIMESHEET, que é OUTRA capacidade de PMO (§5), fora do escopo
-- desta onda. Um PERCENTUAL da capacidade do recurso (`allocation_pct`, 0 < pct
-- <= 100) é AUTOSSUFICIENTE: não precisa de nada externo para significar. Puxar
-- horas arrastaria para dentro um calendário que o módulo não possui — por isso
-- a régua é percentual.
--
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ archived` EXISTE — a física do `vendor`/`dc`, re-perguntada
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- pergunta foi refeita: uma alocação que termina e depois VOLTA é uma linha de
-- planejamento NOVA (a física do `hr`, onde `terminated` é terminal) ou a MESMA
-- linha que retorna (a física do `vendor`/`dc`, relação que volta)? É a mesma: a
-- alocação de um recurso a um projeto que a empresa arquivou e depois retoma é o
-- MESMO plano — obrigá-la a renascer partiria o histórico de alocação em dois.
-- Então `archived → active` EXISTE, como no `vendor` e no `dc`. Born active,
-- autor carimbado pelo servidor, arquivar/reativar gated por `alloc.allocation.decide`.
--
-- -----------------------------------------------------------------------------
-- 🔴 VÍNCULOS POR ID SOLTO — nunca FK cruzada
-- -----------------------------------------------------------------------------
-- O projeto vem do módulo proj POR ID SOLTO (`project_id` + `project_name`
-- carimbado pela tela); o colaborador vem do módulo hr POR ID SOLTO
-- (`employee_id`, OPCIONAL — nem toda alocação tem colaborador cadastrado: o
-- recurso pode ser um terceiro, um freelancer). NENHUM schema alheio é lido.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o nome do recurso em TEXTO LIVRE (pode ser terceiro/freelancer), o
--      percentual de capacidade, e a janela (datas opcionais).
--   ❌ NÃO ENTRA cálculo de disponibilidade/conflito entre projetos (exigiria
--      ler as OUTRAS alocações do mesmo recurso — capacidade futura), horas
--      (é o Timesheet), nem custo da alocação (é o `pcost`/genérico por id solto).
-- =============================================================================

create schema if not exists alloc;

comment on schema alloc is
  'Módulo Recursos / Alocação. Domain pmo (PMO & Projetos) da Taxonomia. A alocação de um recurso a um projeto em PERCENTUAL de capacidade (não horas — horas seriam Timesheet, outra capacidade). Projeto (proj) e colaborador (hr) por id solto — nunca FK. active ↔ archived existe (a alocação que volta é a mesma linha — a física do vendor/dc). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo. É lei.
-- =============================================================================

create or replace function alloc.emit_event(
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
  if p_event_type not like 'alloc.%' then
    raise exception 'alloc.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'alloc',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function alloc.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function alloc.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'alloc.allocation.manage')
      or core.has_permission(p_tenant_id, 'alloc.allocation.decide');
$$;

create or replace function alloc.touch_updated_at()
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
-- 2. ALLOCATIONS — as alocações de recurso a projeto
-- =============================================================================

create table alloc.allocations (
  id              uuid          primary key default gen_random_uuid(),
  tenant_id       uuid          not null references core.tenants (id) on delete cascade,
  -- ⭐ O projeto vem do módulo proj POR ID SOLTO — sem FK cruzada. O nome é
  -- carimbado pela tela para sobreviver ao redesenho do outro módulo.
  project_id      uuid          not null,
  project_name    text          not null default '',
  -- ⭐ O recurso é TEXTO LIVRE — pode ser um terceiro/freelancer sem cadastro.
  resource_name   text          not null check (length(btrim(resource_name)) > 0),
  -- ⭐ O colaborador do módulo hr POR ID SOLTO, OPCIONAL: nem toda alocação tem
  -- um colaborador cadastrado (o recurso pode ser externo).
  employee_id     uuid,
  -- ⭐ PERCENTUAL de capacidade, não horas (ver cabeçalho): 0 < pct <= 100.
  allocation_pct  numeric(5,2)  not null check (allocation_pct > 0 and allocation_pct <= 100),
  starts_on       date,
  ends_on         date,
  status          text          not null default 'active'
                  check (status in ('active', 'archived')),
  created_at      timestamptz   not null default now(),
  created_by      uuid          references auth.users (id) on delete set null,
  updated_at      timestamptz   not null default now(),
  constraint alloc_allocations_id_tenant unique (id, tenant_id),
  -- Coerência OPCIONAL: se as duas datas existem, o fim não vem antes do início.
  constraint alloc_allocations_dates_coherent check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  )
);

create index alloc_allocations_roster_idx
  on alloc.allocations (tenant_id, status, project_id);

create trigger alloc_allocations_touch
  before update on alloc.allocations
  for each row execute function alloc.touch_updated_at();

alter table alloc.allocations enable row level security;
alter table alloc.allocations force row level security;

create policy alloc_allocations_select on alloc.allocations
  for select to authenticated
  using (alloc.can_access(tenant_id));

create policy alloc_allocations_insert on alloc.allocations
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'alloc.allocation.manage'));

-- ⚠️ USING = can_access (não allocation.decide): assim quem só arquiva ALCANÇA a
-- linha e bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE
-- afetar 0 linhas em silêncio. A decisão vive no gatilho (o padrão do vendor).
create policy alloc_allocations_update on alloc.allocations
  for update to authenticated
  using (alloc.can_access(tenant_id))
  with check (alloc.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Alocação que saiu é história de planejamento —
-- arquivar é status, e `archived → active` existe (a mesma linha volta).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function alloc.guard_allocation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'a alocação nasce ativa — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger alloc_allocations_stamp
  before insert on alloc.allocations
  for each row execute function alloc.guard_allocation_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/alloc
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (a alocação volta — a física do vendor/dc).

create or replace function alloc.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function alloc.allowed_transition(text, text) is
  'Ciclo de vida da alocação. Espelho de ALLOWED_TRANSITIONS em @alsham/alloc. active ↔ archived: a alocação que volta do arquivo é a MESMA linha de planejamento (a física do vendor/dc; o DIVERGE do hr, onde terminated é terminal).';

create or replace function alloc.guard_allocation_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not alloc.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da alocação', old.status, new.status
      using errcode = '22023';
  end if;

  -- Arquivar e reativar são DECISÕES (tiram/põem a alocação no plano vivo).
  if not core.has_permission(new.tenant_id, 'alloc.allocation.decide') then
    raise exception 'arquivar ou reativar uma alocação exige a permissão alloc.allocation.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger alloc_allocations_guard_status
  before update of status on alloc.allocations
  for each row execute function alloc.guard_allocation_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function alloc.allocation_payload(p alloc.allocations)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'allocationId',  p.id,
    'projectId',     p.project_id,
    'projectName',   p.project_name,
    'resourceName',  p.resource_name,
    'employeeId',    p.employee_id,
    'allocationPct', p.allocation_pct,
    'startsOn',      p.starts_on,
    'endsOn',        p.ends_on,
    'status',        p.status
  );
$$;

comment on function alloc.allocation_payload(alloc.allocations) is
  'O envelope de uma alocação — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function alloc.on_allocation_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform alloc.emit_event(new.tenant_id, 'alloc.allocation.registered', alloc.allocation_payload(new));
  return new;
end;
$$;

create trigger alloc_allocations_emit_registered
  after insert on alloc.allocations
  for each row execute function alloc.on_allocation_registered();

create or replace function alloc.on_allocation_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform alloc.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'alloc.allocation.archived'
           else 'alloc.allocation.reopened' end,
      alloc.allocation_payload(new)
    );
    return new;
  end if;

  if new.project_id     is distinct from old.project_id
     or new.project_name   is distinct from old.project_name
     or new.resource_name  is distinct from old.resource_name
     or new.employee_id    is distinct from old.employee_id
     or new.allocation_pct is distinct from old.allocation_pct
     or new.starts_on      is distinct from old.starts_on
     or new.ends_on        is distinct from old.ends_on then
    perform alloc.emit_event(new.tenant_id, 'alloc.allocation.updated', alloc.allocation_payload(new));
  end if;

  return new;
end;
$$;

create trigger alloc_allocations_emit_changed
  after update on alloc.allocations
  for each row execute function alloc.on_allocation_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema alloc                  from public, anon, authenticated;
revoke all on all tables    in schema alloc from public, anon, authenticated;
revoke all on all functions in schema alloc from public, anon, authenticated;

grant usage on schema alloc to authenticated;

grant select, insert, update on alloc.allocations to authenticated;

grant execute on function alloc.can_access(uuid) to authenticated;

-- `alloc.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `alloc.allocation_payload` é encanamento dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum. Nenhum nome de cliente. Nenhum objeto fora de
-- `alloc`. Nenhuma leitura de schema alheio (projeto e colaborador por id solto).
-- `consumes` VAZIO.
-- =============================================================================
