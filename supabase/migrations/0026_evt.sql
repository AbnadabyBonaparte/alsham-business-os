-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0026_evt.sql
-- Módulo 11: Eventos. Schema `evt`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §16,
-- depois do `0025_deal.sql`.
--
-- Taxonomia: Domain 📢 Marketing — capacidade *Eventos*.
-- Spec: docs/canon/MODULO-EVT-SPEC.md
--
-- -----------------------------------------------------------------------------
-- POR QUE O `module_id` É `evt` — E NÃO `event` NEM `events`
-- -----------------------------------------------------------------------------
-- "Evento" já significa OUTRA COISA no coração desta plataforma:
-- `core.event_outbox`, `emit_event()`, `EventEnvelope`, "APIs & Eventos" na
-- Taxonomia §3. Um módulo chamado `event` faria a palavra querer dizer duas
-- coisas no mesmo repositório — o argumento exato que derrubou `os` no
-- Módulo 7. Sol Único: `evt` é curto, greppável (zero colisões, conferido
-- com fronteira de palavra) e não disputa o vocabulário do Core.
--
-- E o Domain é `marketing`, NÃO o vertical `events`: este módulo é o evento
-- UNIVERSAL — a feira, o workshop, a inauguração, o culto, o coquetel — que
-- qualquer empresa organiza. O vertical 🎪 Eventos (Events OS™) é o OFÍCIO de
-- quem vive de evento: ingresso, credenciamento, line-up, patrocínio. A peça
-- universal desce para o Domain; o vertical fica com o ofício (Taxonomia §1).
--
-- ⚠️ A PEDREIRA (alsham-events-os) é CONCEITUAL: minerou-se o MAPA
-- (reservation/live/notification/forms como territórios), NENHUMA
-- implementação — lá é catedral de papel (engines são READMEs) e a stack é
-- outra (Drizzle). O perigo da pedreira é importar PROMESSA: cada nome de
-- engine é tentação de declarar capacidade não construída. Não se declarou.
--
-- -----------------------------------------------------------------------------
-- ESPELHO CONSCIENTE — MANTIDO × DIVERGE
-- -----------------------------------------------------------------------------
-- MANTIDO do quote: nasce rascunho; atos carimbados pelo servidor (a
--   presença registra QUEM e QUANDO, como o aceite); honestidade de
--   calendário (realizado só depois de começar, como expirada só vencida).
-- MANTIDO do ap/ar/po: cancelar é status; fins terminais.
-- ⭐ DIVERGE do quote: PUBLICADO NÃO VOLTA A RASCUNHO. Publicado com
--   inscritos é compromisso público — despublicar invalidaria inscrições em
--   silêncio. Corrigir é editar os dados (fato `updated`) ou cancelar (ato
--   com fato próprio, que todo inscrito pode escutar).
-- ⭐ DECISÃO DE LOTAÇÃO: capacidade OPCIONAL; quando informada, inscrição
--   além dela é RECUSADA com erro claro. Quem não quer teto não informa
--   capacidade. Lista de espera é capacidade futura DECLARADA (spec §6) —
--   aceitar além do teto "por enquanto" seria a lotação virando mentira.
-- =============================================================================

create schema if not exists evt;

comment on schema evt is
  'Módulo Eventos (o evento universal do tenant). Domain marketing da Taxonomia. Não cria objeto em core nem lê schema alheio; fala só por core.event_outbox.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima primeira vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function evt.emit_event(
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
  if p_event_type not like 'evt.%' then
    raise exception 'evt.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'evt',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function evt.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function evt.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'evt.event.manage')
      or core.has_permission(p_tenant_id, 'evt.event.decide')
      or core.has_permission(p_tenant_id, 'evt.registration.manage');
$$;

create or replace function evt.touch_updated_at()
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
-- 2. EVENTS — o evento do tenant
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS:
--   ✅ ENTRA `location` TEXTO LIVRE — "salão 2 do shopping", "sede", "Zoom",
--      "chácara do Juarez". Endereço estruturado congelaria o formato de um
--      país; evento online nem tem endereço.
--   ✅ ENTRA `capacity` OPCIONAL. Evento sem teto existe.
--   ❌ NÃO ENTRA tipo de evento (enum "feira/workshop/show") — vocabulário
--      de ofício; a descrição carrega.
--   ❌ NÃO ENTRA ingresso, preço, lote, meia-entrada — pagamento é outra
--      peça inteira (spec §6).
--   ❌ NÃO ENTRA credenciamento, QR, line-up, patrocínio — o OFÍCIO do
--      vertical 🎪 Eventos, não o evento universal.
-- =============================================================================

create table evt.events (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  description text        not null default '',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  location    text,
  capacity    integer     check (capacity is null or capacity > 0),
  status      text        not null default 'draft'
              check (status in ('draft', 'published', 'held', 'cancelled')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint events_id_tenant unique (id, tenant_id),
  constraint events_ends_after_starts check (ends_at is null or ends_at >= starts_at),
  constraint events_location_not_blank check (location is null or length(btrim(location)) > 0)
);

create index events_upcoming_idx
  on evt.events (tenant_id, starts_at)
  where status in ('draft', 'published');

create trigger events_touch
  before update on evt.events
  for each row execute function evt.touch_updated_at();

alter table evt.events enable row level security;
alter table evt.events force row level security;

create policy events_select on evt.events
  for select to authenticated
  using (evt.can_access(tenant_id));

create policy events_insert on evt.events
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'evt.event.manage'));

create policy events_update on evt.events
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'evt.event.manage')
    or core.has_permission(tenant_id, 'evt.event.decide')
  )
  with check (
    core.has_permission(tenant_id, 'evt.event.manage')
    or core.has_permission(tenant_id, 'evt.event.decide')
  );

-- ⛔ Sem policy / grant de DELETE. Evento cancelado é história.

-- -----------------------------------------------------------------------------
-- 2.1 Transições — espelho de EVENT_TRANSITIONS em @alsham/event-management
-- -----------------------------------------------------------------------------
-- ⭐ `published → draft` NÃO existe: publicado com inscritos é compromisso.
-- ⭐ `held` e `cancelled` são terminais: o que aconteceu, aconteceu.

create or replace function evt.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft',     'published'),
    ('draft',     'cancelled'),
    ('published', 'held'),
    ('published', 'cancelled')
  );
$$;

comment on function evt.allowed_transition(text, text) is
  'Ciclo de vida do evento. Espelho de EVENT_TRANSITIONS em @alsham/event-management — há teste que lê este arquivo e compara. Publicado não volta a rascunho; held e cancelled são terminais.';

create or replace function evt.guard_event_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not evt.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do evento', old.status, new.status
      using errcode = '22023';
  end if;

  -- Publicar, realizar e cancelar são DECISÕES.
  if not core.has_permission(new.tenant_id, 'evt.event.decide') then
    raise exception 'publicar, realizar ou cancelar um evento exige a permissão evt.event.decide'
      using errcode = '42501';
  end if;

  -- ⭐ Honestidade de calendário: não se registra como REALIZADO um evento
  -- que ainda nem começou — mesma régua da proposta expirada.
  if new.status = 'held' and old.starts_at > now() then
    raise exception 'o evento só começa em %: registrá-lo como realizado agora mentiria sobre o calendário', old.starts_at
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger events_guard_status
  before update of status on evt.events
  for each row execute function evt.guard_event_transition();

-- =============================================================================
-- 3. REGISTRATIONS — quem vem
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS:
--   ✅ ENTRA `attendee_name` + `contact` TEXTO LIVRE — e-mail, telefone,
--      "@fulano no instagram", ramal. Colunas email/phone congelariam o
--      instrumento de uma década (a lição do canal do crm).
--   ❌ NÃO ENTRA CPF, documento, assento, faixa etária. Credenciamento é o
--      ofício do vertical.
--
-- ⭐ A PRESENÇA É ATO: `attended` carimba QUEM registrou e QUANDO, pelo
-- servidor — como o aceite da proposta. Presença sem autor não se defende.
-- =============================================================================

create table evt.registrations (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  event_id      uuid        not null,
  attendee_name text        not null check (length(btrim(attendee_name)) > 0),
  contact       text,
  note          text        not null default '',
  status        text        not null default 'registered'
                check (status in ('registered', 'confirmed', 'cancelled', 'attended')),
  -- ⭐ O carimbo do ATO da presença. Do servidor, nunca da tela.
  attended_at   timestamptz,
  attended_by   uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint registrations_event_fk
    foreign key (event_id, tenant_id)
    references evt.events (id, tenant_id) on delete restrict,
  constraint registrations_contact_not_blank check (
    contact is null or length(btrim(contact)) > 0
  ),
  -- O estado e o carimbo contam a mesma história.
  constraint registrations_attended_coherent check (
    (status = 'attended' and attended_at is not null) or
    (status <> 'attended')
  )
);

create index registrations_event_idx
  on evt.registrations (tenant_id, event_id, status);

create trigger registrations_touch
  before update on evt.registrations
  for each row execute function evt.touch_updated_at();

alter table evt.registrations enable row level security;
alter table evt.registrations force row level security;

create policy registrations_select on evt.registrations
  for select to authenticated
  using (evt.can_access(tenant_id));

create policy registrations_insert on evt.registrations
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'evt.registration.manage'));

create policy registrations_update on evt.registrations
  for update to authenticated
  using (core.has_permission(tenant_id, 'evt.registration.manage'))
  with check (core.has_permission(tenant_id, 'evt.registration.manage'));

-- ⛔ Sem policy / grant de DELETE. Quem cancelou a vinda fica registrado
-- como quem cancelou — a lista de um evento é história dele.

-- -----------------------------------------------------------------------------
-- 3.1 Transições da inscrição — espelho de REGISTRATION_TRANSITIONS
-- -----------------------------------------------------------------------------
-- ⭐ `cancelled` e `attended` são terminais. Quem cancelou e voltou atrás é
-- INSCRIÇÃO NOVA — a linha antiga conta a história da desistência.

create or replace function evt.allowed_registration_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('registered', 'confirmed'),
    ('registered', 'cancelled'),
    ('registered', 'attended'),
    ('confirmed',  'cancelled'),
    ('confirmed',  'attended')
  );
$$;

comment on function evt.allowed_registration_transition(text, text) is
  'Ciclo de vida da inscrição. Espelho de REGISTRATION_TRANSITIONS em @alsham/event-management. Presença e cancelamento são terminais.';

-- -----------------------------------------------------------------------------
-- 3.2 O porteiro da inscrição: só evento PUBLICADO recebe inscrição, e a
-- lotação é recusa clara — não silêncio.
-- -----------------------------------------------------------------------------

create or replace function evt.guard_registration_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event evt.events;
  v_ativos integer;
begin
  select * into v_event
    from evt.events
   where id = new.event_id and tenant_id = new.tenant_id;

  if v_event.status is distinct from 'published' then
    raise exception 'inscrição só em evento PUBLICADO (este está %): publicar é justamente abrir a lista', coalesce(v_event.status, 'inexistente')
      using errcode = '22023';
  end if;

  -- ⭐ A LOTAÇÃO: cancelada não ocupa vaga; todo o resto ocupa.
  if v_event.capacity is not null then
    select count(*) into v_ativos
      from evt.registrations r
     where r.event_id = new.event_id
       and r.tenant_id = new.tenant_id
       and r.status <> 'cancelled';

    if v_ativos >= v_event.capacity then
      raise exception 'o evento está LOTADO (% de % vagas): lista de espera é capacidade futura — não aceite além do teto', v_ativos, v_event.capacity
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger registrations_guard_insert
  before insert on evt.registrations
  for each row execute function evt.guard_registration_insert();

create or replace function evt.guard_registration_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_status text;
begin
  if new.status = old.status then
    return new;
  end if;

  if not evt.allowed_registration_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: quem cancelou e voltou atrás é inscrição nova', old.status, new.status
      using errcode = '22023';
  end if;

  -- ⭐ A PRESENÇA: só em evento publicado ou realizado, e o carimbo é do
  -- servidor — a tela não escolhe autor nem hora.
  if new.status = 'attended' then
    select status into v_event_status
      from evt.events
     where id = new.event_id and tenant_id = new.tenant_id;

    if v_event_status not in ('published', 'held') then
      raise exception 'presença só em evento publicado ou realizado (este está %)', v_event_status
        using errcode = '22023';
    end if;

    new.attended_at := now();
    new.attended_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger registrations_guard_status
  before update of status on evt.registrations
  for each row execute function evt.guard_registration_transition();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS DA CAIXA DE SAÍDA
-- =============================================================================

create or replace function evt.event_payload(p evt.events)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'eventId',     p.id,
    'name',        p.name,
    'description', p.description,
    'startsAt',    p.starts_at,
    'endsAt',      p.ends_at,
    'location',    p.location,
    'capacity',    p.capacity,
    'status',      p.status
  );
$$;

comment on function evt.event_payload(evt.events) is
  'O envelope de um evento — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function evt.registration_payload(p evt.registrations)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event evt.events;
begin
  select * into v_event from evt.events where id = p.event_id;

  return jsonb_build_object(
    'registrationId', p.id,
    'eventId',        p.event_id,
    'eventName',      v_event.name,
    'eventStartsAt',  v_event.starts_at,
    'attendeeName',   p.attendee_name,
    'contact',        p.contact,
    'status',         p.status,
    'attendedAt',     p.attended_at
  );
end;
$$;

comment on function evt.registration_payload(evt.registrations) is
  'O envelope de uma inscrição — AUTOSSUFICIENTE, com o evento pelo NOME e a data. Quem escuta não faz join.';

-- 4.1 Fatos do evento
create or replace function evt.on_event_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform evt.emit_event(new.tenant_id, 'evt.event.registered', evt.event_payload(new));
  return new;
end;
$$;

create trigger events_emit_registered
  after insert on evt.events
  for each row execute function evt.on_event_registered();

create or replace function evt.on_event_changed()
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
                when 'published' then 'evt.event.published'
                when 'held'      then 'evt.event.held'
                when 'cancelled' then 'evt.event.cancelled'
                else null
              end;
    if v_type is not null then
      perform evt.emit_event(new.tenant_id, v_type, evt.event_payload(new));
    end if;
    return new;
  end if;

  if new.name is distinct from old.name
     or new.starts_at is distinct from old.starts_at
     or new.ends_at   is distinct from old.ends_at
     or new.location  is distinct from old.location
     or new.capacity  is distinct from old.capacity then
    perform evt.emit_event(new.tenant_id, 'evt.event.updated', evt.event_payload(new));
  end if;

  return new;
end;
$$;

create trigger events_emit_changed
  after update on evt.events
  for each row execute function evt.on_event_changed();

-- 4.2 Fatos da inscrição
create or replace function evt.on_registration_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform evt.emit_event(new.tenant_id, 'evt.registration.registered', evt.registration_payload(new));
  return new;
end;
$$;

create trigger registrations_emit_registered
  after insert on evt.registrations
  for each row execute function evt.on_registration_registered();

create or replace function evt.on_registration_changed()
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
                when 'confirmed' then 'evt.registration.confirmed'
                when 'cancelled' then 'evt.registration.cancelled'
                when 'attended'  then 'evt.registration.attended'
                else null
              end;
    if v_type is not null then
      perform evt.emit_event(new.tenant_id, v_type, evt.registration_payload(new));
    end if;
  end if;

  return new;
end;
$$;

create trigger registrations_emit_changed
  after update on evt.registrations
  for each row execute function evt.on_registration_changed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema evt                  from public, anon, authenticated;
revoke all on all tables    in schema evt from public, anon, authenticated;
revoke all on all functions in schema evt from public, anon, authenticated;

grant usage on schema evt to authenticated;

grant select, insert, update on evt.events        to authenticated;
grant select, insert, update on evt.registrations to authenticated;

grant execute on function evt.can_access(uuid) to authenticated;

-- `evt.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- Os payloads não são concedidos: são encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum ingresso, pagamento ou QR — o evento universal,
-- não o ofício do vertical. Nenhum objeto fora de `evt`. Nenhuma leitura de
-- schema alheio.
-- =============================================================================
