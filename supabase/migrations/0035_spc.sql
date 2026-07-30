-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0035_spc.sql
-- Módulo 20: Reserva de Espaços. Schema `spc`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §18,
-- depois do `0034_chk.sql`.
--
-- Taxonomia: Domain 🏭 Operações — capacidade *Reserva de espaços* (a
-- leitura universal de *Facilities*; o vertical Condomínios chama de
-- "Reserva de áreas comuns", Hotelaria de "Reservas" — ver a spec §0).
-- Spec: docs/canon/MODULO-SPC-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A FÍSICA DO DOMÍNIO: dois usos não ocupam o MESMO espaço ao MESMO tempo
-- -----------------------------------------------------------------------------
-- O conflito é recusado pelo BANCO — EXCLUSION CONSTRAINT (gist) sobre
-- (espaço, período) — nunca por `if` de aplicação: o `if` da tela perde a
-- corrida entre duas reservas simultâneas; a constraint não perde nunca.
-- O período é MEIO-ABERTO ([início, fim)): a reunião que termina às 12h e a
-- que começa às 12h NÃO conflitam — é assim que toda agenda do mundo lê.
--
-- ⚠️ `create extension btree_gist` vem NESTA migration, argumentado: o gist
-- puro não indexa igualdade de uuid; sem btree_gist, `space_id with =` não
-- compila. A extensão é do contrib do Postgres, presente em todo Supabase.
--
-- ⭐ A constraint é PARCIAL — `where (status = 'booked')`: a reserva
-- CANCELADA libera o período SOZINHA, por definição, sem job nem flag.
--
-- -----------------------------------------------------------------------------
-- ⭐ RESERVA NO PASSADO É PERMITIDA — re-perguntado, e a resposta está escrita
-- -----------------------------------------------------------------------------
-- Registrar o uso que JÁ aconteceu é fato consumado (a física do inv, que
-- aceita o movimento retroativo): a sala FOI usada, e a agenda que recusa o
-- passado mente sobre a ocupação — obrigaria quem operou fora do sistema a
-- fingir que a sala esteve livre. O cash recusa o FUTURO porque previsão é
-- outro ofício (Orçamento); aqui o futuro é exatamente o ofício — reservar
-- É prometer o espaço adiante. Passado e futuro entram; o conflito é que
-- nunca entra.
--
-- -----------------------------------------------------------------------------
-- ⭐ CANCELAR EXIGE RAZÃO — e é terminal. `archived → active` EXISTE no espaço
-- -----------------------------------------------------------------------------
-- A reserva cancelada é UM par (booked → cancelled), com razão escrita e
-- carimbo do servidor: desmarcar sem porquê é agenda que se apaga. Quem
-- precisa do horário de novo RESERVA de novo — o período já está livre.
-- O ESPAÇO, por outro lado, volta do arquivo (o argumento do crm): a sala
-- reformada que reabre é a MESMA sala, e obrigá-la a renascer partiria o
-- histórico de uso em dois.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA espaço com nome/descrição TEXTO LIVRE e capacidade OPCIONAL
--      (sala, quadra, van, cadeira de estúdio — o produto não sabe nem
--      precisa saber o que é).
--   ✅ ENTRA finalidade TEXTO LIVRE na reserva — "reunião de diretoria",
--      "ensaio", "aula de spinning" são vocabulário de casa.
--   ❌ NÃO ENTRA preço/cobrança da reserva (viraria título — integração
--      futura DECLARADA com o ar, sem handler e sem promessa), calendário
--      visual (tela, não schema), aprovação de reserva em duas mãos
--      (capacidade futura declarada), recorrência de reserva (o cron da
--      agenda é futuro declarado — o padrão do mnt).
-- =============================================================================

create extension if not exists btree_gist;

create schema if not exists spc;

comment on schema spc is
  'Módulo Reserva de Espaços. Domain operations da Taxonomia (Facilities). Espaços do tenant e reservas com período; o conflito é recusado por EXCLUSION constraint no banco (parcial: cancelada libera sozinha); o passado é permitido — fato consumado. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function spc.emit_event(
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
  if p_event_type not like 'spc.%' then
    raise exception 'spc.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'spc',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function spc.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function spc.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'spc.reservation.manage')
      or core.has_permission(p_tenant_id, 'spc.setup.manage');
$$;

create or replace function spc.touch_updated_at()
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
-- 2. SPACES — os lugares que o tenant desenha (e que voltam do arquivo)
-- =============================================================================

create table spc.spaces (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  description text        not null default '',
  capacity    integer     check (capacity is null or capacity > 0),
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint spc_spaces_id_tenant unique (id, tenant_id)
);

-- Dois espaços ATIVOS com o mesmo nome só geram engano.
create unique index spc_spaces_unique_active_name
  on spc.spaces (tenant_id, lower(name))
  where status = 'active';

create trigger spc_spaces_touch
  before update on spc.spaces
  for each row execute function spc.touch_updated_at();

alter table spc.spaces enable row level security;
alter table spc.spaces force row level security;

create policy spc_spaces_select on spc.spaces
  for select to authenticated using (spc.can_access(tenant_id));
create policy spc_spaces_insert on spc.spaces
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'spc.setup.manage'));
create policy spc_spaces_update on spc.spaces
  for update to authenticated
  using (core.has_permission(tenant_id, 'spc.setup.manage'))
  with check (core.has_permission(tenant_id, 'spc.setup.manage'));

-- ⛔ Sem DELETE: espaço com reservas é história; arquivar é status —
-- e `archived → active` existe: a sala reformada que reabre é a MESMA sala.

-- =============================================================================
-- 3. RESERVATIONS — o período prometido
-- =============================================================================

create table spc.reservations (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  space_id      uuid        not null,
  purpose       text        not null default '',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text        not null default 'booked'
                check (status in ('booked', 'cancelled')),
  -- O ATO do cancelamento: quem, quando e POR QUÊ. Terminal.
  cancelled_at  timestamptz,
  cancelled_by  uuid        references auth.users (id) on delete set null,
  cancel_reason text        not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint spc_reservations_id_tenant unique (id, tenant_id),
  constraint spc_reservations_space_fk
    foreign key (space_id, tenant_id)
    references spc.spaces (id, tenant_id) on delete restrict,
  constraint spc_reservations_period check (ends_at > starts_at),
  -- Cancelada tem carimbo e razão; reservada não tem nenhum dos dois.
  constraint spc_reservations_cancel_coherent check (
    (status = 'cancelled' and cancelled_at is not null
      and length(btrim(cancel_reason)) > 0)
    or (status = 'booked' and cancelled_at is null and cancel_reason = '')
  ),
  -- ⭐ A FÍSICA, no banco: mesmo espaço + períodos que se cruzam = recusa.
  -- Parcial: a cancelada LIBERA o período sozinha, por definição.
  -- Meio-aberto: terminar às 12h e começar às 12h convivem.
  constraint spc_reservations_no_overlap exclude using gist (
    space_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'booked')
);

create index spc_reservations_agenda_idx
  on spc.reservations (tenant_id, space_id, starts_at);

create trigger spc_reservations_touch
  before update on spc.reservations
  for each row execute function spc.touch_updated_at();

alter table spc.reservations enable row level security;
alter table spc.reservations force row level security;

create policy spc_reservations_select on spc.reservations
  for select to authenticated
  using (spc.can_access(tenant_id));

create policy spc_reservations_insert on spc.reservations
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'spc.reservation.manage'));

create policy spc_reservations_update on spc.reservations
  for update to authenticated
  using (core.has_permission(tenant_id, 'spc.reservation.manage'))
  with check (core.has_permission(tenant_id, 'spc.reservation.manage'));

-- ⛔ Sem policy / grant de DELETE. Reserva desfeita é cancelamento com razão.

-- -----------------------------------------------------------------------------
-- 3.1 O espaço precisa existir, estar ATIVO — e ser deste tenant
-- -----------------------------------------------------------------------------

create or replace function spc.guard_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from spc.spaces
   where id = new.space_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'o espaço não existe neste tenant' using errcode = '22023';
  end if;

  if v_status = 'archived' then
    raise exception 'espaço fora de uso não recebe reserva nova: reative-o primeiro'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger spc_reservations_stamp
  before insert on spc.reservations
  for each row execute function spc.guard_reservation_insert();

-- -----------------------------------------------------------------------------
-- 3.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/spaces
-- -----------------------------------------------------------------------------

create or replace function spc.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('booked', 'cancelled')
  );
$$;

comment on function spc.allowed_transition(text, text) is
  'Ciclo de vida da reserva. Espelho de ALLOWED_TRANSITIONS em @alsham/spaces. UM par só: cancelar é terminal — o período já está livre, e quem precisa dele de novo reserva de novo.';

create or replace function spc.guard_reservation_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- Cancelada congela o conteúdo — inclusive o período e a razão.
    if old.status = 'cancelled'
       and (new.purpose is distinct from old.purpose
            or new.starts_at is distinct from old.starts_at
            or new.ends_at is distinct from old.ends_at
            or new.space_id is distinct from old.space_id
            or new.cancel_reason is distinct from old.cancel_reason) then
      raise exception 'reserva cancelada não se edita: o horário quem quiser reserva de novo'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not spc.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: cancelar é terminal — o horário livre se reserva de novo',
      old.status, new.status
      using errcode = '22023';
  end if;

  if length(btrim(new.cancel_reason)) = 0 then
    raise exception 'cancelar exige a razão escrita: desmarcar sem porquê é agenda que se apaga'
      using errcode = '22023';
  end if;

  new.cancelled_at := now();
  new.cancelled_by := (select auth.uid());

  return new;
end;
$$;

create trigger spc_reservations_guard_status
  before update on spc.reservations
  for each row execute function spc.guard_reservation_transition();

-- =============================================================================
-- 4. OS FATOS — payload autossuficiente (espaço pelo NOME, período dentro)
-- =============================================================================

create or replace function spc.reservation_payload(p spc.reservations)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_space text;
begin
  select name into v_space from spc.spaces where id = p.space_id;

  return jsonb_build_object(
    'reservationId', p.id,
    'spaceId',       p.space_id,
    'spaceName',     v_space,
    'purpose',       p.purpose,
    'startsAt',      p.starts_at,
    'endsAt',        p.ends_at,
    'status',        p.status,
    'cancelReason',  p.cancel_reason
  );
end;
$$;

comment on function spc.reservation_payload(spc.reservations) is
  'O envelope de uma reserva — AUTOSSUFICIENTE, com o espaço pelo NOME e o período dentro. Quem escuta não faz join.';

create or replace function spc.on_reservation_booked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform spc.emit_event(new.tenant_id, 'spc.reservation.booked', spc.reservation_payload(new));
  return new;
end;
$$;

create trigger spc_reservations_emit_booked
  after insert on spc.reservations
  for each row execute function spc.on_reservation_booked();

create or replace function spc.on_reservation_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform spc.emit_event(new.tenant_id, 'spc.reservation.cancelled', spc.reservation_payload(new));
    return new;
  end if;

  if new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.purpose is distinct from old.purpose
     or new.space_id is distinct from old.space_id then
    perform spc.emit_event(new.tenant_id, 'spc.reservation.updated', spc.reservation_payload(new));
  end if;

  return new;
end;
$$;

create trigger spc_reservations_emit_changed
  after update on spc.reservations
  for each row execute function spc.on_reservation_changed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema spc                  from public, anon, authenticated;
revoke all on all tables    in schema spc from public, anon, authenticated;
revoke all on all functions in schema spc from public, anon, authenticated;

grant usage on schema spc to authenticated;

grant select, insert, update on spc.spaces       to authenticated;
grant select, insert, update on spc.reservations to authenticated;

grant execute on function spc.can_access(uuid) to authenticated;

-- `spc.emit_event` NÃO é concedida. `spc.reservation_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum preço. Nenhuma recorrência. Nenhum `if` de
-- conflito — a física mora na constraint. Nenhum objeto fora de `spc` (a
-- extensão btree_gist é do banco, não do módulo). Nenhuma leitura de schema
-- alheio.
-- =============================================================================
