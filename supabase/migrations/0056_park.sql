-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0056_park.sql
-- Módulo 41: Estacionamento. Schema `park`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §22,
-- na esteira do `0053_mall.sql`. Missão Nove (Onda 6 — a ÚLTIMA da campanha),
-- vertical `shopping-centers`.
--
-- Taxonomia: Vertical 🛍 Shopping Centers — capacidade *Estacionamento* (§6).
-- Spec: docs/canon/MODULO-PARK-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A IDENTIDADE DO `vis` APLICADA AO VEÍCULO
-- -----------------------------------------------------------------------------
-- A portaria (vis) carimba entrada e saída de PESSOAS pelo servidor e congela
-- o registro depois de visto. O `park` re-pergunta a MESMA identidade para o
-- VEÍCULO: entrada e saída carimbadas PELO SERVIDOR (nunca pela tela — a hora
-- que o cliente mandar é descartada), e correção é registro novo — não se
-- rasura o carimbo. A diferença de forma: o `vis` tem um plano anterior
-- (`scheduled`/`no_show` — a visita pode ser agendada); o `park` NASCE DIRETO
-- no "dentro" — não há agenda de vaga nesta onda. Dentro/fora é IMPLÍCITO:
-- não existe coluna de status nem enum — `exited_at is null` É o "dentro".
--
-- -----------------------------------------------------------------------------
-- ⭐ O QUE A CANCELA VIU NÃO SE RASURA — depois da saída, o registro CONGELA
-- -----------------------------------------------------------------------------
-- Enquanto o veículo está dentro (`exited_at is null`), o único movimento
-- permitido é registrar a SAÍDA — o carimbo é do servidor, sobrescrevendo
-- qualquer valor que a tela tenha mandado. Depois de registrada a saída, a
-- linha CONGELA por completo (a física do `vis`/`occ`): corrigir é registro
-- novo, nunca UPDATE na linha errada.
--
-- -----------------------------------------------------------------------------
-- ⭐ DUAS MÃOS NA CANCELA — asimetria de permissão
-- -----------------------------------------------------------------------------
-- `park.entry.manage` registra a ENTRADA (INSERT); `park.entry.close`
-- registra a SAÍDA (o UPDATE que fecha o registro). São ATOS distintos, como
-- a agenda × a cancela no `vis` — nada impede o mesmo papel de ter as duas,
-- mas o produto não pressupõe isso.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA veículo NEUTRO (placa/identificador TEXTO LIVRE — moto, bike,
--      veículo de visitante sem placa do país), tarifa OPCIONAL em texto (o
--      tenant decide se cobra e quanto, sem o produto calcular nada).
--   ❌ NÃO ENTRA cálculo de tarifa progressiva (motor de regras futuro —
--      fração de hora, mensalista, isenção), integração com cancela física
--      ou leitura de placa por câmera (LPR), reserva de vaga. `consumes`
--      VAZIO (Lei 7).
-- =============================================================================

create schema if not exists park;

comment on schema park is
  'Módulo Estacionamento. Vertical shopping-centers da Taxonomia. A identidade do vis (portaria) aplicada ao veículo: entrada e saída carimbadas PELO SERVIDOR (nunca pela tela), correção é registro novo (não se rasura o carimbo). Dentro/fora é implícito (exited_at null = dentro). Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — quadragésima primeira vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function park.emit_event(
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
  if p_event_type not like 'park.%' then
    raise exception 'park.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'park',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function park.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function park.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'park.entry.manage')
      or core.has_permission(p_tenant_id, 'park.entry.close');
$$;

create or replace function park.touch_updated_at()
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
-- 2. ENTRIES — o livro do pátio: um veículo, uma passagem
-- =============================================================================

create table park.entries (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  -- O veículo NEUTRO: placa/identificador em TEXTO LIVRE — carro, moto,
  -- bike, veículo de visitante sem placa do país.
  vehicle_plate  text        not null check (length(btrim(vehicle_plate)) > 0),
  -- ⭐ Os DOIS carimbos do fato — sempre do servidor, nunca da tela.
  entered_at     timestamptz not null,
  entered_by     uuid        references auth.users (id) on delete set null,
  exited_at      timestamptz,
  exited_by      uuid        references auth.users (id) on delete set null,
  -- Tarifa OPCIONAL em texto — o tenant decide se cobra; sem cálculo aqui.
  fee            text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint park_entries_id_tenant unique (id, tenant_id),
  constraint park_entries_exit_coherent check (exited_at is null or exited_at >= entered_at)
);

-- O pátio agora: quem está dentro, do mais antigo pro mais novo.
create index park_entries_inside_idx
  on park.entries (tenant_id, entered_at)
  where exited_at is null;

create trigger park_entries_touch
  before update on park.entries
  for each row execute function park.touch_updated_at();

alter table park.entries enable row level security;
alter table park.entries force row level security;

create policy park_entries_select on park.entries
  for select to authenticated
  using (park.can_access(tenant_id));

create policy park_entries_insert on park.entries
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'park.entry.manage'));

create policy park_entries_update on park.entries
  for update to authenticated
  using (park.can_access(tenant_id))
  with check (park.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. O livro do pátio não se apaga.

-- -----------------------------------------------------------------------------
-- 2.1 O NASCIMENTO — sempre "dentro"; o carimbo de entrada é do servidor
-- -----------------------------------------------------------------------------

create or replace function park.guard_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.exited_at is not null then
    raise exception 'a entrada nasce dentro — a saída é registrada depois, nunca junto'
      using errcode = '22023';
  end if;

  -- ⭐ O carimbo é do servidor — a hora que a tela mandar é descartada.
  new.entered_at := now();
  new.entered_by := (select auth.uid());
  new.exited_at  := null;
  new.exited_by  := null;

  return new;
end;
$$;

create trigger park_entries_stamp
  before insert on park.entries
  for each row execute function park.guard_entry_insert();

-- -----------------------------------------------------------------------------
-- 2.2 O ÚNICO MOVIMENTO — registrar a saída; depois disso, a linha CONGELA
-- -----------------------------------------------------------------------------
-- ⭐ Sem tabela de transições (não há estado explícito): dentro/fora é
-- IMPLÍCITO por `exited_at`. O guard abaixo é a física inteira do módulo.

create or replace function park.guard_entry_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ⭐ Depois de registrada a saída, o registro CONGELA por completo — o que
  -- a cancela viu não se rasura: corrigir é registro novo, apontando o
  -- registro errado.
  if old.exited_at is not null then
    raise exception 'não se rasura: correção é registro novo, apontando o registro errado'
      using errcode = '22023';
  end if;

  -- A entrada carimbada pelo servidor não muda nunca, nem enquanto o
  -- veículo está dentro.
  if new.vehicle_plate is distinct from old.vehicle_plate
     or new.entered_at  is distinct from old.entered_at
     or new.entered_by  is distinct from old.entered_by then
    raise exception 'a entrada carimbada pelo servidor não se altera: não se rasura, correção é registro novo'
      using errcode = '22023';
  end if;

  -- Sem sinal de saída (`new.exited_at` continua nulo): a linha só se move
  -- UMA VEZ, do "dentro" para o "fora" — nenhuma outra edição existe.
  if new.exited_at is null then
    if new.fee is distinct from old.fee then
      raise exception 'não se rasura: correção é registro novo, apontando o registro errado'
        using errcode = '22023';
    end if;
    return new;
  end if;

  -- ⭐ Registrar a SAÍDA exige a permissão própria — a segunda mão da cancela.
  if not core.has_permission(new.tenant_id, 'park.entry.close') then
    raise exception 'registrar a saída exige a permissão park.entry.close'
      using errcode = '42501';
  end if;

  -- ⭐ O carimbo é do SERVIDOR — o que a tela sinalizou é descartado.
  new.exited_at := now();
  new.exited_by := (select auth.uid());

  return new;
end;
$$;

create trigger park_entries_guard_update
  before update on park.entries
  for each row execute function park.guard_entry_update();

-- =============================================================================
-- 3. OS FATOS — o envelope leva a placa (identificador neutro, sem documento)
-- =============================================================================

create or replace function park.entry_payload(p park.entries)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'entryId',      p.id,
    'vehiclePlate', p.vehicle_plate,
    'enteredAt',    p.entered_at,
    'exitedAt',     p.exited_at,
    'fee',          p.fee
  );
$$;

comment on function park.entry_payload(park.entries) is
  'O envelope de uma passagem — AUTOSSUFICIENTE, com a placa/identificador NEUTRO do veículo. Nenhum documento de pessoa entra aqui.';

create or replace function park.on_entry_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform park.emit_event(new.tenant_id, 'park.entry.registered', park.entry_payload(new));
  return new;
end;
$$;

create trigger park_entries_emit_registered
  after insert on park.entries
  for each row execute function park.on_entry_registered();

create or replace function park.on_entry_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.exited_at is distinct from old.exited_at and new.exited_at is not null then
    perform park.emit_event(new.tenant_id, 'park.entry.closed', park.entry_payload(new));
  end if;
  return new;
end;
$$;

create trigger park_entries_emit_changed
  after update on park.entries
  for each row execute function park.on_entry_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema park                  from public, anon, authenticated;
revoke all on all tables    in schema park from public, anon, authenticated;
revoke all on all functions in schema park from public, anon, authenticated;

grant usage on schema park to authenticated;

grant select, insert, update on park.entries to authenticated;

grant execute on function park.can_access(uuid) to authenticated;

-- `park.emit_event` NÃO é concedida. `park.entry_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum enum de status. Nenhum documento de pessoa. Nenhuma hora
-- digitada. Nenhum cálculo de tarifa. Nenhum objeto fora de `park`. Nenhuma
-- leitura de schema alheio. `consumes` VAZIO (Lei 7).
-- =============================================================================
