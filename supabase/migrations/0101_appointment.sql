-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0101_appointment.sql
-- Módulo — Agenda médica. Schema `appointment`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — runbook §34, a Onda Vinte e Um (Fase 3
-- — o Vertical 🏥 Saúde). Nasce sob `vertical_key='health'`.
--
-- Taxonomia: Vertical 🏥 Saúde (§6) — capacidade *Agenda médica*.
-- Spec/decisões: docs/canon/ONDA-VINTE-E-UM-DECISOES.md · MODULO-APPOINTMENT-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ O NO-SHOW — a física minerada do Peritus (agendamentos.comparecimento)
-- -----------------------------------------------------------------------------
-- O `agendamentos` do Peritus (referência de física, NÃO integração) tem
-- `comparecimento` como estado do fato. É essa a decisão que justifica módulo
-- próprio, e não o Engine de Agenda genérico: o Engine agenda um horário; a
-- clínica precisa registrar QUE O PACIENTE FALTOU. A FALTA é dado — some ela e
-- a agenda mente sobre a ocupação da sala e sobre o histórico do paciente.
--
-- O ciclo: `scheduled → attended | no_show | cancelled`. Os TRÊS fins são
-- TERMINAIS — a consulta é um EVENTO no tempo; quem remarca abre OUTRA (a
-- física do `subscription`/`proj`: o que volta é novo). Enquanto `scheduled`, o
-- horário se remarca (manage); marcar o desfecho é decisão (decide).
--
-- ⚠️ O status `no_show` obedece à decisão da doc; o FATO emitido é `.missed`
-- (o outbox recusa `_` no verbo: event_type ~ '^[a-z0-9-]+\.…'). Status é
-- vocabulário de domínio; fato é contrato do correio.
--
-- ANTI-VIÉS: o registro profissional (CRM/CRO/CRP/COREN…) é TEXTO LIVRE —
-- conselhos variam por profissão e região. Profissional e paciente por ID
-- SOLTO (sem FK cruzada — Lei do Lego), com o nome carimbado pela tela.
-- =============================================================================

create schema if not exists appointment;

comment on schema appointment is
  'Módulo Agenda médica. Vertical health (Saúde). Horário + profissional (id solto, registro TEXTO LIVRE) + paciente (id solto ao patient). Ciclo com no-show: scheduled → attended | no_show | cancelled, os três TERMINAIS (quem remarca abre outra). Trilha de ESCRITA (a agenda não carrega conteúdo clínico). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA + acesso
-- =============================================================================

create or replace function appointment.emit_event(
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
  if p_event_type not like 'appointment.%' then
    raise exception 'appointment.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'appointment',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function appointment.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function appointment.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'appointment.appointment.manage')
      or core.has_permission(p_tenant_id, 'appointment.appointment.decide');
$$;

create or replace function appointment.touch_updated_at()
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
-- 2. APPOINTMENTS — a marcação
-- =============================================================================

create table appointment.appointments (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Paciente por ID SOLTO ao patient (NOT NULL — não há consulta sem
  -- paciente); nome carimbado pela tela.
  patient_id            uuid        not null,
  patient_name          text        not null default '',
  -- ⭐ Profissional por ID SOLTO (opcional — encaixe pode não ter profissional
  -- definido ainda); nome e REGISTRO TEXTO LIVRE (CRM/CRO/CRP/COREN…).
  professional_id       uuid,
  professional_name     text        not null default '',
  professional_registry text        not null default '',
  -- O horário da consulta. (Sem trava de futuro: registrar um encaixe/atendimento
  -- ocorrido é fato — a agenda que recusa o passado mente sobre a ocupação.)
  scheduled_at          timestamptz not null,
  reason                text        not null default '',
  status                text        not null default 'scheduled'
                        check (status in ('scheduled', 'attended', 'no_show', 'cancelled')),
  -- Cancelar exige razão (o padrão de sempre); os demais desfechos não.
  cancel_reason         text        not null default '',
  constraint appointment_cancel_reason_ck check (
    (status = 'cancelled' and length(btrim(cancel_reason)) > 0)
    or (status <> 'cancelled' and cancel_reason = '')
  ),
  -- O carimbo do desfecho — quem marcou attended/no_show/cancelled, e quando.
  decided_at            timestamptz,
  decided_by            uuid        references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  created_by            uuid        references auth.users (id) on delete set null,
  updated_at            timestamptz not null default now(),
  constraint appointment_appointments_id_tenant unique (id, tenant_id)
);

create index appointment_appointments_agenda_idx
  on appointment.appointments (tenant_id, scheduled_at desc);
create index appointment_appointments_by_patient_idx
  on appointment.appointments (tenant_id, patient_id, scheduled_at desc);

create trigger appointment_appointments_touch
  before update on appointment.appointments
  for each row execute function appointment.touch_updated_at();

alter table appointment.appointments enable row level security;
alter table appointment.appointments force row level security;

create policy appointment_appointments_select on appointment.appointments
  for select to authenticated
  using (appointment.can_access(tenant_id));

create policy appointment_appointments_insert on appointment.appointments
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'appointment.appointment.manage'));

-- ⚠️ USING = can_access: quem só marca desfecho ALCANÇA a linha e bate no
-- gatilho, que decide (o padrão do catalog).
create policy appointment_appointments_update on appointment.appointments
  for update to authenticated
  using (appointment.can_access(tenant_id))
  with check (appointment.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Consulta é história de agenda; o desfecho
-- (inclusive cancelada) é status, não apagar.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre SCHEDULED, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function appointment.guard_appointment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'scheduled' then
    raise exception 'a consulta nasce agendada — o desfecho é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  new.decided_at := null;
  new.decided_by := null;
  return new;
end;
$$;

create trigger appointment_appointments_stamp
  before insert on appointment.appointments
  for each row execute function appointment.guard_appointment_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/appointment
-- ⭐ scheduled → attended | no_show | cancelled — os três TERMINAIS.
-- -----------------------------------------------------------------------------

create or replace function appointment.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('scheduled', 'attended'),
    ('scheduled', 'no_show'),
    ('scheduled', 'cancelled')
  );
$$;

comment on function appointment.allowed_transition(text, text) is
  'Ciclo da consulta. scheduled → attended | no_show | cancelled — os TRÊS fins são TERMINAIS: a consulta é evento no tempo, quem remarca abre outra (a física do subscription/proj).';

create or replace function appointment.guard_appointment_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- Sem mudança de status: é remarcação/edição. Só enquanto AGENDADA — o
    -- desfecho congela a linha (a física do fato consumado).
    if old.status <> 'scheduled' then
      raise exception 'consulta com desfecho não se edita: quem remarca abre outra'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if not appointment.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: o desfecho da consulta é terminal', old.status, new.status
      using errcode = '22023';
  end if;

  -- Marcar o desfecho (comparecer/faltar/cancelar) é DECISÃO.
  if not core.has_permission(new.tenant_id, 'appointment.appointment.decide') then
    raise exception 'marcar o desfecho de uma consulta exige a permissão appointment.appointment.decide'
      using errcode = '42501';
  end if;

  -- Carimbo do desfecho — sempre do servidor.
  new.decided_at := now();
  new.decided_by := (select auth.uid());
  return new;
end;
$$;

create trigger appointment_appointments_guard_transition
  before update on appointment.appointments
  for each row execute function appointment.guard_appointment_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente, SEM o motivo clínico
-- =============================================================================

create or replace function appointment.appointment_payload(p appointment.appointments)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  -- ⚠️ Sem `reason`/`cancel_reason`: o motivo pode ser clínico. O fato diz a
  -- marcação e o desfecho, nunca o porquê escrito.
  select jsonb_build_object(
    'appointmentId', p.id,
    'patientId',     p.patient_id,
    'patientName',   p.patient_name,
    'professionalId', p.professional_id,
    'scheduledAt',   p.scheduled_at,
    'status',        p.status
  );
$$;

comment on function appointment.appointment_payload(appointment.appointments) is
  'O envelope de uma consulta — AUTOSSUFICIENTE e sem o motivo (pode ser clínico). Quem escuta não faz join.';

create or replace function appointment.on_appointment_scheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform appointment.emit_event(new.tenant_id, 'appointment.appointment.scheduled', appointment.appointment_payload(new));
  return new;
end;
$$;

create trigger appointment_appointments_emit_scheduled
  after insert on appointment.appointments
  for each row execute function appointment.on_appointment_scheduled();

create or replace function appointment.on_appointment_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform appointment.emit_event(
      new.tenant_id,
      case new.status
        when 'attended'  then 'appointment.appointment.attended'
        when 'no_show'   then 'appointment.appointment.missed'
        when 'cancelled' then 'appointment.appointment.cancelled'
      end,
      appointment.appointment_payload(new)
    );
    return new;
  end if;

  -- Remarcação (só enquanto agendada — o gatilho de transição já garantiu).
  if new.scheduled_at is distinct from old.scheduled_at
     or new.professional_id is distinct from old.professional_id then
    perform appointment.emit_event(new.tenant_id, 'appointment.appointment.rescheduled', appointment.appointment_payload(new));
  end if;

  return new;
end;
$$;

create trigger appointment_appointments_emit_changed
  after update on appointment.appointments
  for each row execute function appointment.on_appointment_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022: o revoke vem DEPOIS de toda função; função nasce aberta a
-- PUBLIC — por isso o revoke de funções vem aqui, no fim.
-- =============================================================================

revoke all on schema appointment                  from public, anon, authenticated;
revoke all on all tables    in schema appointment from public, anon, authenticated;
revoke all on all functions in schema appointment from public, anon, authenticated;

grant usage on schema appointment to authenticated;

grant select, insert, update on appointment.appointments to authenticated;

grant execute on function appointment.can_access(uuid) to authenticated;

-- `appointment.emit_event`, `appointment.appointment_payload` são encanamento.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Agenda com no-show. Três fins terminais. Registro profissional texto
-- livre. Profissional e paciente por id solto. Trilha de ESCRITA (sem conteúdo
-- clínico). Nenhum objeto fora de `appointment`. `consumes` VAZIO.
-- =============================================================================
