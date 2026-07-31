-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0091_control.sql
-- Módulo 76: Controles Internos. Schema `control`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §32, o
-- segundo módulo da Onda Dezenove (Fase 3). Nasce sob `domain_key='grc'`.
--
-- Taxonomia: Domain 🏛 GRC — capacidade *Controles internos* (§5).
-- Spec: docs/canon/MODULO-CONTROL-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ O QUE É — E POR QUE NÃO É `pol`, NEM `audit`, NEM `erisk`
-- -----------------------------------------------------------------------------
-- Controle interno é a rotina de verificação que a empresa desenha para se
-- proteger: "toda nota acima de X exige dupla aprovação", "o estoque é contado
-- todo mês". Investigado contra o que já existe:
--   • NÃO é `pol` (Política): a política é o DOCUMENTO versionado com ciência; o
--     controle é a ROTINA OPERACIONAL, com dono, frequência e RESULTADO do
--     último teste. O documento pode existir à parte, no pol.
--   • NÃO é `audit` (Auditoria): a auditoria é o EVENTO periódico de verificação
--     externa/interna com achados; o controle é o mecanismo PERMANENTE que a
--     auditoria testa.
--   • NÃO é `erisk` (Risco): o risco é o que PODE dar errado; o controle é o que
--     se faz para impedir. O erisk aponta para o control por id solto.
--
-- ⭐ O TIPO É CHECK ARGUMENTADO (preventive/detective/corrective): é a física do
-- MÉTODO de controle interno (COSO), não vocabulário de casa — a lição do
-- `capa`/`mnt`. Fora dos três não é "outro tipo de controle"; é dado inválido.
--
-- ⭐ O TESTE DO CONTROLE É LIVRO IMUTÁVEL (a física do `timesheet`/`inv`): cada
-- teste é um FATO CONSUMADO (data, resultado pass/fail, nota). Corrigir é
-- registrar OUTRO teste, nunca reescrever — a evidência de conformidade não se
-- rasura.
--
-- ANTI-VIÉS: nome/dono/frequência TEXTO LIVRE; `active ↔ archived` (o controle
-- descontinuado volta — a física do vendor). `consumes` VAZIO.
-- =============================================================================

create schema if not exists control;

comment on schema control is
  'Módulo Controles Internos. Domain grc da Taxonomia. O cadastro de controles (nome/dono/frequência texto livre; tipo preventive/detective/corrective CHECK — física do COSO) + o LIVRO IMUTÁVEL de testes do controle (data, resultado pass/fail, nota — a física do timesheet). active ↔ archived no cadastro. Vínculo opcional ao erisk por id solto. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function control.emit_event(
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
  if p_event_type not like 'control.%' then
    raise exception 'control.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'control',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function control.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function control.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'control.control.manage')
      or core.has_permission(p_tenant_id, 'control.control.decide');
$$;

create or replace function control.touch_updated_at()
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
-- 2. CONTROLS — o cadastro dos controles internos
-- =============================================================================

create table control.controls (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  name         text        not null check (length(btrim(name)) > 0),
  description  text        not null default '',
  -- ⭐ Tipo CHECK argumentado (física do COSO).
  control_type text        not null check (control_type in ('preventive', 'detective', 'corrective')),
  -- Dono e frequência de teste em TEXTO LIVRE.
  owner        text        not null default '',
  frequency    text        not null default '',
  -- ⭐ Vínculo OPCIONAL ao risco que o controle mitiga (id solto ao erisk).
  erisk_id     uuid,
  status       text        not null default 'active'
               check (status in ('active', 'archived')),
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint control_controls_id_tenant unique (id, tenant_id)
);

create index control_controls_roster_idx
  on control.controls (tenant_id, status, name);

create trigger control_controls_touch
  before update on control.controls
  for each row execute function control.touch_updated_at();

alter table control.controls enable row level security;
alter table control.controls force row level security;

create policy control_controls_select on control.controls
  for select to authenticated
  using (control.can_access(tenant_id));

create policy control_controls_insert on control.controls
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'control.control.manage'));

create policy control_controls_update on control.controls
  for update to authenticated
  using (control.can_access(tenant_id))
  with check (control.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Controle com testes é história de conformidade.

create or replace function control.guard_control_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o controle nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger control_controls_stamp
  before insert on control.controls
  for each row execute function control.guard_control_insert();

-- ⭐ active ↔ archived — a física do vendor.
create or replace function control.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function control.allowed_transition(text, text) is
  'Ciclo de vida do controle. Espelho de ALLOWED_TRANSITIONS em @alsham/control. active ↔ archived (o controle descontinuado volta — a física do vendor).';

create or replace function control.guard_control_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not control.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do controle', old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'control.control.decide') then
    raise exception 'arquivar ou reativar um controle exige a permissão control.control.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger control_controls_guard_status
  before update of status on control.controls
  for each row execute function control.guard_control_transition();

-- =============================================================================
-- 3. TESTS — ⭐ O LIVRO IMUTÁVEL de testes do controle (física do timesheet)
-- -----------------------------------------------------------------------------
-- Cada teste é um FATO CONSUMADO: data, resultado, nota. Sem status, sem
-- allowed_transition, sem updated_at. O cliente não tem porta de UPDATE/DELETE.
-- =============================================================================

create table control.tests (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null,
  control_id  uuid        not null,
  tested_on   date        not null,
  -- ⭐ Resultado CHECK: pass/fail (a física do teste de controle é binária).
  result      text        not null check (result in ('pass', 'fail')),
  note        text        not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  constraint control_tests_control_fk
    foreign key (control_id, tenant_id)
    references control.controls (id, tenant_id) on delete restrict
);

create index control_tests_book_idx
  on control.tests (tenant_id, control_id, tested_on desc);

alter table control.tests enable row level security;
alter table control.tests force row level security;

create policy control_tests_select on control.tests
  for select to authenticated
  using (control.can_access(tenant_id));

create policy control_tests_insert on control.tests
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'control.control.manage'));

-- ⛔ SEM policy de UPDATE/DELETE — o teste é fato consumado.

create or replace function control.guard_test_insert()
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

create trigger control_tests_stamp
  before insert on control.tests
  for each row execute function control.guard_test_insert();

create or replace function control.guard_test_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o teste do controle é fato consumado: não se edita nem se apaga. Registre outro teste.'
    using errcode = '42501';
end;
$$;

create trigger control_tests_immutable
  before update or delete on control.tests
  for each row execute function control.guard_test_immutable();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function control.control_payload(p control.controls)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'controlId',   p.id,
    'name',        p.name,
    'controlType', p.control_type,
    'owner',       p.owner,
    'frequency',   p.frequency,
    'eriskId',     p.erisk_id,
    'status',      p.status
  );
$$;

comment on function control.control_payload(control.controls) is
  'O envelope de um controle — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function control.on_control_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform control.emit_event(new.tenant_id, 'control.control.registered', control.control_payload(new));
  return new;
end;
$$;

create trigger control_controls_emit_registered
  after insert on control.controls
  for each row execute function control.on_control_registered();

create or replace function control.on_control_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform control.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'control.control.archived'
           else 'control.control.reopened' end,
      control.control_payload(new)
    );
  end if;

  return new;
end;
$$;

create trigger control_controls_emit_changed
  after update on control.controls
  for each row execute function control.on_control_changed();

create or replace function control.on_test_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform control.emit_event(
    new.tenant_id,
    'control.test.recorded',
    jsonb_build_object(
      'controlId', new.control_id,
      'testId',    new.id,
      'testedOn',  new.tested_on,
      'result',    new.result
    )
  );
  return new;
end;
$$;

create trigger control_tests_emit_recorded
  after insert on control.tests
  for each row execute function control.on_test_recorded();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema control                  from public, anon, authenticated;
revoke all on all tables    in schema control from public, anon, authenticated;
revoke all on all functions in schema control from public, anon, authenticated;

grant usage on schema control to authenticated;

grant select, insert, update on control.controls to authenticated;
-- ⛔ SÓ SELECT e INSERT no livro de testes: reescrever não existe.
grant select, insert on control.tests to authenticated;

grant execute on function control.can_access(uuid) to authenticated;

-- `control.emit_event` e os payloads NÃO são concedidos. `anon` nada.

-- =============================================================================
-- FIM. Nenhum INSERT. O tipo é CHECK (não enum de casa). O teste é imutável.
-- Nenhum objeto fora de `control`. Nenhuma leitura de schema alheio. `consumes`
-- VAZIO.
-- =============================================================================
