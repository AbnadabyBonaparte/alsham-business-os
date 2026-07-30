-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0049_shift.sql
-- Módulo 34: Escalas. Schema `shift`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §21,
-- depois do `0048_hr.sql`. Segundo módulo da Missão Oito (Onda 5 — o
-- BLOCO DE PESSOAS).
--
-- Taxonomia: Domain 👥 RH — capacidade *Escalas* (o Domain RH tem 14
-- capacidades; esta onda constrói 5). Spec: docs/canon/MODULO-SHIFT-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⚠️ `create extension btree_gist` vem NESTA migration, argumentado (a mesma
-- razão do `0035_spc.sql`): o gist puro não indexa igualdade de uuid; sem
-- btree_gist, `employee_id with =` não compila. A extensão é do contrib do
-- Postgres, presente em todo Supabase.
-- -----------------------------------------------------------------------------
--
-- ⭐ A FÍSICA DO DOMÍNIO — reaproveitada do `spc`, com outro DONO
-- -----------------------------------------------------------------------------
-- O `spc` recusa dois usos do MESMO ESPAÇO ao MESMO tempo. Aqui o dono do
-- conflito é OUTRO: o mesmo COLABORADOR não roda dois turnos que se cruzam.
-- MESMA física (EXCLUSION constraint gist, período meio-aberto, PARCIAL —
-- a cancelada libera sozinha); DONO diferente (`employee_id`, não
-- `space_id`). O `if` da tela perde a corrida entre duas escalas
-- simultâneas; a constraint não perde nunca.
--
-- ⭐ VÍNCULO COM O `hr` — ID SOLTO, NUNCA FK (Lei do Lego §6)
-- -----------------------------------------------------------------------------
-- `employee_id` é uuid solto (sem FK para `hr.employees`) e `employee_name`
-- é carimbado PELA TELA no momento da escala — a mesma física do vínculo
-- `deal↔crm` e `mnt↔pat`. Este módulo não lê o schema `hr`; se o colaborador
-- for editado ou desligado depois, o nome na escala já emitida não muda —
-- é o retrato do momento em que a escala foi feita.
--
-- -----------------------------------------------------------------------------
-- ⭐ O TURNO É TEXTO LIVRE — anti-viés
-- -----------------------------------------------------------------------------
-- `shift_label` é texto do tenant ("Manhã", "12x36", "Plantão noturno",
-- "Turno B") — o produto não sabe nem precisa saber a nomenclatura de
-- escala de cada setor. Enum de turno congelaria o vocabulário de uma casa
-- e envelheceria todas as outras.
--
-- -----------------------------------------------------------------------------
-- ⭐ O PASSADO É PERMITIDO — o DIVERGE consciente do `cash`, o MANTIDO do `spc`
-- -----------------------------------------------------------------------------
-- Registrar a escala que JÁ RODOU é fato consumado (a física do `spc`, que
-- por sua vez é a física do `inv`): o turno FOI cumprido, e uma agenda que
-- recusa o passado mente sobre quem trabalhou quando. O `cash` recusa o
-- FUTURO porque previsão é outro ofício (Orçamento); aqui não há esse
-- ofício — passado e futuro entram; só o CONFLITO nunca entra. NÃO existe
-- `starts_at >= now()`/`current_date` nesta migration, e é lei, não
-- esquecimento.
--
-- -----------------------------------------------------------------------------
-- ⭐ CANCELAR EXIGE RAZÃO — e é TERMINAL. O MANTIDO do `spc`
-- -----------------------------------------------------------------------------
-- A escala cancelada é UM par (scheduled → cancelled), com razão escrita e
-- carimbo do servidor: desmarcar sem porquê é agenda que se apaga. Quem
-- precisa do turno de novo ESCALA de novo — o período já está livre.
-- Diferente do `hr` (onde `on_leave` volta), aqui não existe "parar
-- reversível": a escala rodou, foi cancelada, ou não foi criada — não há
-- terceiro estado.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA turno TEXTO LIVRE — o vocabulário de escala é de cada empresa.
--   ✅ ENTRA colaborador por ID SOLTO + nome carimbado — o mesmo padrão do
--      `deal`/`mnt`, e por LEI (nenhum módulo lê o schema de outro).
--   ❌ NÃO ENTRA cálculo de horas extras/banco de horas (matéria fiscal e
--      trabalhista de verdade — integração declarada, nunca atalho).
--   ❌ NÃO ENTRA registro de ponto/batida (é a capacidade *Ponto* do Domain
--      RH, NÃO CONSTRUÍDA nesta onda — ver spec §5; a escala é o PLANO, o
--      ponto seria o REALIZADO, e confundir os dois é o erro do `bud`
--      re-perguntado ao contrário).
--   ❌ NÃO ENTRA aprovação de escala em duas mãos (capacidade futura
--      declarada), nem recorrência de escala (o cron da agenda é futuro
--      declarado — o padrão do `mnt`).
-- =============================================================================

create extension if not exists btree_gist;

create schema if not exists shift;

comment on schema shift is
  'Módulo Escalas. Domain hr da Taxonomia (RH). A escala de trabalho do tenant: turno TEXTO LIVRE, colaborador por ID SOLTO + nome carimbado pela tela. Duas escalas não ocupam o mesmo colaborador no mesmo período — EXCLUSION constraint (parcial: cancelada libera sozinha). O passado é permitido — fato consumado. Não cria objeto em core nem lê schema alheio (nem o hr).';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima quarta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function shift.emit_event(
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
  if p_event_type not like 'shift.%' then
    raise exception 'shift.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'shift',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function shift.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function shift.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'shift.schedule.manage')
      or core.has_permission(p_tenant_id, 'shift.schedule.decide');
$$;

create or replace function shift.touch_updated_at()
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
-- 2. SCHEDULES — a escala prometida
-- =============================================================================

create table shift.schedules (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO — sem FK para hr.employees (Lei do Lego §6: nenhum módulo lê
  -- o schema de outro). O nome é carimbado PELA TELA no momento da escala.
  employee_id    uuid        not null,
  employee_name  text        not null check (length(btrim(employee_name)) > 0),
  -- ⭐ Turno TEXTO LIVRE — o vocabulário de escala é de cada empresa.
  shift_label    text        not null check (length(btrim(shift_label)) > 0),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text        not null default 'scheduled'
                 check (status in ('scheduled', 'cancelled')),
  -- O ATO do cancelamento: quem, quando e POR QUÊ. Terminal.
  cancelled_at   timestamptz,
  cancelled_by   uuid        references auth.users (id) on delete set null,
  cancel_reason  text        not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint shift_schedules_id_tenant unique (id, tenant_id),
  constraint shift_schedules_period check (ends_at > starts_at),
  -- Cancelada tem carimbo e razão; escalada não tem nenhum dos dois.
  constraint shift_schedules_cancel_coherent check (
    (status = 'cancelled' and cancelled_at is not null
      and length(btrim(cancel_reason)) > 0)
    or (status = 'scheduled' and cancelled_at is null and cancel_reason = '')
  ),
  -- ⭐ A FÍSICA, no banco: mesmo colaborador + períodos que se cruzam = recusa.
  -- Parcial: a cancelada LIBERA o período sozinha, por definição.
  -- Meio-aberto: terminar às 12h e começar às 12h convivem.
  -- ⭐ SEM trava de now()/current_date: o passado é permitido (fato consumado).
  constraint shift_schedules_no_overlap exclude using gist (
    employee_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'scheduled')
);

create index shift_schedules_agenda_idx
  on shift.schedules (tenant_id, employee_id, starts_at);

create trigger shift_schedules_touch
  before update on shift.schedules
  for each row execute function shift.touch_updated_at();

alter table shift.schedules enable row level security;
alter table shift.schedules force row level security;

create policy shift_schedules_select on shift.schedules
  for select to authenticated
  using (shift.can_access(tenant_id));

create policy shift_schedules_insert on shift.schedules
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'shift.schedule.manage'));

create policy shift_schedules_update on shift.schedules
  for update to authenticated
  using (shift.can_access(tenant_id))
  with check (shift.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Escala desfeita é cancelamento com razão.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ESCALADA (escalar é o ato de entrada)
-- -----------------------------------------------------------------------------

create or replace function shift.guard_schedule_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'scheduled' then
    raise exception 'a escala nasce escalada — cancelar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger shift_schedules_stamp
  before insert on shift.schedules
  for each row execute function shift.guard_schedule_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/shift-scheduling
-- -----------------------------------------------------------------------------
-- ⭐ UM par só: scheduled → cancelled. Diferente do `hr` (on_leave ↔ active
-- existe): aqui não há "parar reversível" — a escala rodou, foi cancelada,
-- ou nunca existiu.

create or replace function shift.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('scheduled', 'cancelled')
  );
$$;

comment on function shift.allowed_transition(text, text) is
  'Ciclo de vida da escala. Espelho de ALLOWED_TRANSITIONS em @alsham/shift-scheduling. UM par só: cancelar é terminal — o período já está livre, e quem precisa dele de novo escala de novo.';

create or replace function shift.guard_schedule_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- Cancelada congela o conteúdo inteiro — inclusive o período.
    if old.status = 'cancelled'
       and (new.employee_id is distinct from old.employee_id
            or new.employee_name is distinct from old.employee_name
            or new.shift_label is distinct from old.shift_label
            or new.starts_at is distinct from old.starts_at
            or new.ends_at is distinct from old.ends_at
            or new.cancel_reason is distinct from old.cancel_reason) then
      raise exception 'escala cancelada não se edita: quem precisa do horário escala de novo'
        using errcode = '22023';
    end if;

    -- Remarcar uma escala viva exige a mão de quem escala (manage).
    if old.status = 'scheduled'
       and not core.has_permission(new.tenant_id, 'shift.schedule.manage') then
      raise exception 'remarcar uma escala exige a permissão shift.schedule.manage'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if not shift.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: cancelar é terminal — o horário livre se escala de novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'cancelled' then
    if not core.has_permission(new.tenant_id, 'shift.schedule.decide') then
      raise exception 'cancelar uma escala exige a permissão shift.schedule.decide'
        using errcode = '42501';
    end if;
    if length(btrim(new.cancel_reason)) = 0 then
      raise exception 'cancelar exige a razão escrita: desmarcar sem porquê é agenda que se apaga'
        using errcode = '22023';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger shift_schedules_guard_status
  before update on shift.schedules
  for each row execute function shift.guard_schedule_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente (colaborador pelo ID SOLTO + NOME)
-- =============================================================================

create or replace function shift.schedule_payload(p shift.schedules)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'scheduleId',   p.id,
    'employeeId',   p.employee_id,
    'employeeName', p.employee_name,
    'shiftLabel',   p.shift_label,
    'startsAt',     p.starts_at,
    'endsAt',       p.ends_at,
    'status',       p.status,
    'cancelReason', p.cancel_reason
  );
$$;

comment on function shift.schedule_payload(shift.schedules) is
  'O envelope de uma escala — AUTOSSUFICIENTE, com o colaborador pelo ID SOLTO e pelo NOME carimbado. Quem escuta não faz join, e não lê o schema hr.';

create or replace function shift.on_schedule_scheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform shift.emit_event(new.tenant_id, 'shift.schedule.scheduled', shift.schedule_payload(new));
  return new;
end;
$$;

create trigger shift_schedules_emit_scheduled
  after insert on shift.schedules
  for each row execute function shift.on_schedule_scheduled();

create or replace function shift.on_schedule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform shift.emit_event(new.tenant_id, 'shift.schedule.cancelled', shift.schedule_payload(new));
    return new;
  end if;

  if new.employee_id is distinct from old.employee_id
     or new.employee_name is distinct from old.employee_name
     or new.shift_label is distinct from old.shift_label
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at then
    perform shift.emit_event(new.tenant_id, 'shift.schedule.updated', shift.schedule_payload(new));
  end if;

  return new;
end;
$$;

create trigger shift_schedules_emit_changed
  after update on shift.schedules
  for each row execute function shift.on_schedule_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema shift                  from public, anon, authenticated;
revoke all on all tables    in schema shift from public, anon, authenticated;
revoke all on all functions in schema shift from public, anon, authenticated;

grant usage on schema shift to authenticated;

grant select, insert, update on shift.schedules to authenticated;

grant execute on function shift.can_access(uuid) to authenticated;

-- `shift.emit_event` NÃO é concedida. `shift.schedule_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum CPF/saúde/banco. Nenhum enum de turno. Nenhuma
-- FK cruzada para hr.employees (vínculo é ID SOLTO + nome carimbado). Nenhum
-- objeto fora de `shift` (a extensão btree_gist é do banco, não do módulo).
-- `consumes` VAZIO — nenhum handler de Escalas nesta onda (Lei 7).
-- =============================================================================
