-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0112_booking.sql
-- Módulo 97: Agendamento. Schema `booking`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver o runbook. Módulo do Vertical
-- 💇 Beleza & Estética (`vertical_key='beauty'`, VerticalKey do `@alsham/core`).
--
-- Taxonomia: Vertical 💇 Beleza & Estética (§6, "vertical viva: Suprema Beleza")
-- — capacidade *Agendamento*.
-- Spec: docs/canon/MODULO-BOOKING-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ REAPROVEITA a física do no-show do `appointment` (0101) — mas DIVERGE
-- -----------------------------------------------------------------------------
-- O `appointment` (Vertical Saúde) minerou do Peritus o estado `no-show`: a
-- agenda precisa registrar QUE O CLIENTE FALTOU — some a falta e a agenda mente
-- sobre a ocupação da cadeira e o histórico do cliente. A mesma física serve ao
-- salão: `scheduled → attended | no_show | cancelled`, os TRÊS fins TERMINAIS
-- (o agendamento é evento no tempo; quem remarca abre OUTRO). Enquanto
-- `scheduled`, o horário se remarca (manage); marcar o desfecho é decisão
-- (decide), carimbada pelo servidor.
--
-- ⭐⭐ O DIVERGE ASSINADO do `appointment`, escrito de propósito:
--   1. o cliente é a contraparte do `crm` por ID SOLTO (`client_id`), NÃO um
--      `patient` e NÃO PHI — agendar um corte não é ato de saúde. Por isso este
--      módulo NÃO tem a trilha de LEITURA clínica (`access_log`/`read_*()`) do
--      `record`/`exam`/`prescription`: fica no write-trail simples do
--      `appointment`. O `client_id` é OPCIONAL (o encaixe/walk-in não tem
--      cadastro), com o nome carimbado pela tela.
--   2. o serviço é `service` TEXTO LIVRE ("corte"/"coloração"/"limpeza de
--      pele") — NUNCA enum: o salão de bairro e a clínica estética avançada
--      usam o mesmo módulo sem uma linha diferente (a Lei 3 / anti-viés, como o
--      registro profissional texto livre do appointment).
--   3. o profissional é ID SOLTO (`professional_id`) ao módulo `professional` —
--      sem FK, sem ler aquele schema (Lei do Lego).
--
-- ⚠️ O status `no_show` obedece à decisão da doc; o FATO emitido é `.missed`
-- (o outbox recusa `_` no verbo: event_type ~ '^[a-z0-9-]+\.…'). Status é
-- vocabulário de domínio; fato é contrato do correio — exatamente como no
-- appointment.
-- =============================================================================

create schema if not exists booking;

comment on schema booking is
  'Módulo Agendamento. Vertical beauty (Beleza & Estética). Cliente (id solto ao crm — não paciente, não PHI), profissional (id solto ao módulo professional), serviço em TEXTO LIVRE e horário. Reaproveita a física do no-show: scheduled → attended | no_show | cancelled, os três TERMINAIS (quem remarca abre outro). Trilha de ESCRITA (agendar um corte não é ato de saúde — sem trilha de leitura clínica). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA + acesso
-- =============================================================================

create or replace function booking.emit_event(
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
  if p_event_type not like 'booking.%' then
    raise exception 'booking.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'booking',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function booking.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function booking.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'booking.booking.manage')
      or core.has_permission(p_tenant_id, 'booking.booking.decide');
$$;

create or replace function booking.touch_updated_at()
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
-- 2. BOOKINGS — o agendamento do salão
-- =============================================================================

create table booking.bookings (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Cliente por ID SOLTO ao crm (OPCIONAL — o encaixe/walk-in não tem
  -- cadastro); nome carimbado pela tela, obrigatório. NÃO é paciente, NÃO é PHI.
  client_id         uuid,
  client_name       text        not null check (length(btrim(client_name)) > 0),
  -- ⭐ Profissional por ID SOLTO ao módulo professional (OPCIONAL — pode não
  -- estar definido ainda); SEM FK, SEM ler aquele schema.
  professional_id   uuid,
  -- ⭐ O serviço — TEXTO LIVRE (corte/coloração/limpeza de pele), NUNCA enum
  -- (Lei 3 / anti-viés). Obrigatório.
  service           text        not null check (length(btrim(service)) > 0),
  -- O horário. (Sem trava de futuro: registrar um atendimento ocorrido é fato —
  -- a agenda que recusa o passado mente sobre a ocupação da cadeira.)
  scheduled_at      timestamptz not null,
  status            text        not null default 'scheduled'
                    check (status in ('scheduled', 'attended', 'no_show', 'cancelled')),
  -- Cancelar exige razão (o padrão de sempre); os demais desfechos não.
  cancel_reason     text        not null default '',
  constraint booking_cancel_reason_ck check (
    (status = 'cancelled' and length(btrim(cancel_reason)) > 0)
    or (status <> 'cancelled' and cancel_reason = '')
  ),
  -- O carimbo do desfecho — quem marcou attended/no_show/cancelled, e quando.
  decided_at        timestamptz,
  decided_by        uuid        references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  created_by        uuid        references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint booking_bookings_id_tenant unique (id, tenant_id)
);

create index booking_bookings_agenda_idx
  on booking.bookings (tenant_id, scheduled_at desc);
create index booking_bookings_by_client_idx
  on booking.bookings (tenant_id, client_id, scheduled_at desc);
create index booking_bookings_by_professional_idx
  on booking.bookings (tenant_id, professional_id, scheduled_at desc);

create trigger booking_bookings_touch
  before update on booking.bookings
  for each row execute function booking.touch_updated_at();

alter table booking.bookings enable row level security;
alter table booking.bookings force row level security;

create policy booking_bookings_select on booking.bookings
  for select to authenticated
  using (booking.can_access(tenant_id));

create policy booking_bookings_insert on booking.bookings
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'booking.booking.manage'));

-- ⚠️ USING = can_access: quem só marca desfecho ALCANÇA a linha e bate no
-- gatilho, que decide (o padrão do appointment/catalog).
create policy booking_bookings_update on booking.bookings
  for update to authenticated
  using (booking.can_access(tenant_id))
  with check (booking.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Agendamento é história de agenda; o desfecho
-- (inclusive cancelado) é status, não apagar.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre SCHEDULED, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function booking.guard_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'scheduled' then
    raise exception 'o agendamento nasce agendado — o desfecho é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  new.decided_at := null;
  new.decided_by := null;
  return new;
end;
$$;

create trigger booking_bookings_stamp
  before insert on booking.bookings
  for each row execute function booking.guard_booking_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/booking
-- ⭐ scheduled → attended | no_show | cancelled — os três TERMINAIS.
-- -----------------------------------------------------------------------------

create or replace function booking.allowed_transition(p_from text, p_to text)
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

comment on function booking.allowed_transition(text, text) is
  'Ciclo do agendamento. Espelho de ALLOWED_TRANSITIONS em @alsham/booking. scheduled → attended | no_show | cancelled — os TRÊS fins são TERMINAIS: o agendamento é evento no tempo, quem remarca abre outro (a física do appointment).';

create or replace function booking.guard_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- Sem mudança de status: é remarcação/edição. Só enquanto AGENDADO — o
    -- desfecho congela a linha (a física do fato consumado).
    if old.status <> 'scheduled' then
      raise exception 'agendamento com desfecho não se edita: quem remarca abre outro'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if not booking.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: o desfecho do agendamento é terminal', old.status, new.status
      using errcode = '22023';
  end if;

  -- Marcar o desfecho (comparecer/faltar/cancelar) é DECISÃO.
  if not core.has_permission(new.tenant_id, 'booking.booking.decide') then
    raise exception 'marcar o desfecho de um agendamento exige a permissão booking.booking.decide'
      using errcode = '42501';
  end if;

  -- Carimbo do desfecho — sempre do servidor.
  new.decided_at := now();
  new.decided_by := (select auth.uid());
  return new;
end;
$$;

create trigger booking_bookings_guard_transition
  before update on booking.bookings
  for each row execute function booking.guard_booking_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente, SEM a razão do cancelamento
-- =============================================================================

create or replace function booking.booking_payload(p booking.bookings)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  -- ⚠️ Sem `cancel_reason`: o fato diz a marcação e o desfecho, nunca o porquê
  -- escrito. Cliente e profissional pelo id solto (+ nome do cliente).
  select jsonb_build_object(
    'bookingId',      p.id,
    'clientId',       p.client_id,
    'clientName',     p.client_name,
    'professionalId', p.professional_id,
    'service',        p.service,
    'scheduledAt',    p.scheduled_at,
    'status',         p.status
  );
$$;

comment on function booking.booking_payload(booking.bookings) is
  'O envelope de um agendamento — AUTOSSUFICIENTE, com cliente/profissional pelo id solto. Quem escuta não faz join.';

create or replace function booking.on_booking_scheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform booking.emit_event(new.tenant_id, 'booking.booking.scheduled', booking.booking_payload(new));
  return new;
end;
$$;

create trigger booking_bookings_emit_scheduled
  after insert on booking.bookings
  for each row execute function booking.on_booking_scheduled();

create or replace function booking.on_booking_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform booking.emit_event(
      new.tenant_id,
      case new.status
        when 'attended'  then 'booking.booking.attended'
        when 'no_show'   then 'booking.booking.missed'
        when 'cancelled' then 'booking.booking.cancelled'
      end,
      booking.booking_payload(new)
    );
  end if;
  -- ⚠️ A remarcação (mudança de horário/profissional enquanto agendado) NÃO
  -- emite fato: não está no manifesto (Tudo pelo manifesto). O calendário é
  -- plano; o fato é o desfecho.
  return new;
end;
$$;

create trigger booking_bookings_emit_changed
  after update on booking.bookings
  for each row execute function booking.on_booking_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022: o revoke vem DEPOIS de toda função; função nasce aberta a
-- PUBLIC — por isso o revoke de funções vem aqui, no fim.
-- =============================================================================

revoke all on schema booking                  from public, anon, authenticated;
revoke all on all tables    in schema booking from public, anon, authenticated;
revoke all on all functions in schema booking from public, anon, authenticated;

grant usage on schema booking to authenticated;

grant select, insert, update on booking.bookings to authenticated;

grant execute on function booking.can_access(uuid) to authenticated;

-- `booking.emit_event`, `booking.booking_payload` são encanamento dos gatilhos,
-- não API de tela. `anon` não recebe nada.

-- =============================================================================
-- FIM. Agenda de salão com no-show. Três fins terminais. Serviço texto livre.
-- Cliente (crm) e profissional por id solto — não paciente, não PHI. Trilha de
-- ESCRITA (sem leitura clínica). Nenhum objeto fora de `booking`. Nenhuma
-- leitura de schema alheio. `consumes` VAZIO (Lei 7).
-- =============================================================================
