-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0096_plant.sql
-- Módulo 81: Usinas (e Geração distribuída). Schema `plant`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §33, o
-- PRIMEIRO módulo da Onda Vinte (Fase 3 — o Vertical ☀️ ENERGIA). Nasce sob
-- `vertical_key='energy'` (confirmado na store-taxonomy — `key: 'energy'`).
-- A lacuna 0015–0016 é proposital; a Onda Dezenove fechou em 0095. Próxima
-- livre depois desta onda: 0100.
--
-- Taxonomia: Vertical ☀️ Energia (§6) — capacidades *Usinas* e *Geração
-- distribuída*. Spec: docs/canon/MODULO-PLANT-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CANON — UM MÓDULO, NÃO DOIS (a disciplina do esg/idea/ip)
-- -----------------------------------------------------------------------------
-- O Vertical Energia lista *Usinas* e *Geração distribuída* como capacidades
-- separadas. Investigadas com a régua anti-viés ("outra operadora usaria isso
-- exatamente assim?"), NA FÍSICA são o MESMO objeto: uma unidade geradora de
-- energia com nome, localização, capacidade instalada (kWp) e um TIPO. A
-- "geração distribuída" é apenas uma usina de porte menor, atrás do medidor do
-- próprio consumidor — mesmo cadastro, mesma vida (opera, desativa, volta a
-- operar). Construir dois schemas quase idênticos SÓ para inflar o número seria
-- a DUPLICAÇÃO que a Lei do Reaproveitamento proíbe (ROTEIRO §2). A resposta
-- correta é UM módulo só, com o PORTE/TIPO num campo TEXTO LIVRE
-- (`plant_type`) — nunca um enum fechado, porque cada operadora nomeia
-- diferente ("usina centralizada", "geração distribuída", "telhado",
-- "minigeração", "GD remota"). É dado do tenant, não vocabulário do produto: o
-- produto não procura a palavra "telhado" — um cadastro em espanhol funciona
-- igual. É a mesma decisão do `esg` (quatro capacidades, um módulo) e do
-- `idea`/`ip` (duas capacidades, um módulo).
--
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ archived` — re-perguntado, a física do `catalog`/`vendor`/`mall`
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- pergunta foi refeita: a usina é GENTE (física do `hr`, `terminated` terminal)
-- ou ATIVO DE OPERAÇÃO que volta (física do `catalog`/`vendor`/`mall`/`dc`)? É
-- ativo de operação: a usina desativada por manutenção longa, por troca de
-- titularidade ou por sazonalidade e que VOLTA a operar é a MESMA usina —
-- obrigá-la a renascer partiria o histórico de geração (o `genreading`) e de
-- assinaturas (o `subscription`) em dois. Então `archived → active` EXISTE. O
-- contraste plant×hr fica no teste.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o nome; a localização em TEXTO LIVRE (endereço, coordenada,
--      "Fazenda tal — lote 3" — cada operadora registra diferente, congelar um
--      formato envelheceria o produto, a lição do canal do `crm`); a CAPACIDADE
--      INSTALADA em kWp (numérico > 0 — placa de uma usina real é positiva); o
--      TIPO/PORTE em TEXTO LIVRE (a consolidação de Geração distribuída); o
--      ciclo active ↔ archived.
--   ❌ NÃO ENTRA telemetria/leitura de geração (é o `genreading`, Módulo 83, por
--      id solto); manutenção da usina (é o `mnt` genérico, Módulo 17, com
--      `asset_id` SOLTO já pronto para isso desde a Onda Quadra — DECLARADO
--      FORA); contrato de energia (é o `ctr` genérico, Módulo 13, com categoria
--      "energia" — DECLARADO FORA, a mesma decisão que o `lease` tomou pro
--      contrato de locação); inversores/strings/equipamentos (cadastro de
--      componente é capacidade futura). `consumes` VAZIO.
--
-- 🔴 O `plant` NÃO LÊ nenhum outro schema: não referencia schema alheio em
-- lugar nenhum deste arquivo — a Lei do Lego.
-- =============================================================================

create schema if not exists plant;

comment on schema plant is
  'Módulo Usinas (e Geração distribuída). Vertical energy (Energia) da Taxonomia. O cadastro da unidade geradora: nome, localização TEXTO LIVRE, capacidade instalada em kWp (> 0), tipo/porte TEXTO LIVRE (a consolidação de Geração distribuída — nunca enum). active ↔ archived (a usina desativada que volta a operar é a MESMA — a física do catalog/vendor). Manutenção é o mnt (asset_id solto); contrato é o ctr; geração é o genreading — todos por id solto, DECLARADOS FORA. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function plant.emit_event(
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
  if p_event_type not like 'plant.%' then
    raise exception 'plant.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'plant',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function plant.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function plant.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'plant.plant.manage')
      or core.has_permission(p_tenant_id, 'plant.plant.decide');
$$;

create or replace function plant.touch_updated_at()
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
-- 2. PLANTS — as usinas do tenant
-- =============================================================================

create table plant.plants (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  name           text        not null check (length(btrim(name)) > 0),
  -- ⭐ Localização TEXTO LIVRE, OPCIONAL — cada operadora registra diferente
  -- (endereço, coordenada, "lote 3"). Congelar um formato envelheceria o produto.
  location       text        not null default '',
  -- ⭐ Capacidade instalada em kWp: > 0. A placa de uma usina real é positiva
  -- (o DIVERGE do esg, cujo quantity >= 0 é leitura, não spec de placa). Um
  -- gerador de 0 kWp não é usina.
  capacity_kwp   numeric(20,4) not null check (capacity_kwp > 0),
  -- ⭐ O TIPO/PORTE em TEXTO LIVRE — a consolidação de Geração distribuída.
  -- NUNCA enum: cada operadora nomeia diferente ("usina centralizada",
  -- "geração distribuída", "telhado", "minigeração"). Dado do tenant.
  plant_type     text        not null default '',
  status         text        not null default 'active'
                 check (status in ('active', 'archived')),
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint plant_plants_id_tenant unique (id, tenant_id)
);

create index plant_plants_roster_idx
  on plant.plants (tenant_id, status, name);

create trigger plant_plants_touch
  before update on plant.plants
  for each row execute function plant.touch_updated_at();

alter table plant.plants enable row level security;
alter table plant.plants force row level security;

create policy plant_plants_select on plant.plants
  for select to authenticated
  using (plant.can_access(tenant_id));

create policy plant_plants_insert on plant.plants
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'plant.plant.manage'));

-- ⚠️ USING = can_access (não plant.decide): assim quem só arquiva ALCANÇA a
-- linha e bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE
-- afetar 0 linhas em silêncio. A decisão vive no gatilho (o padrão do catalog).
create policy plant_plants_update on plant.plants
  for update to authenticated
  using (plant.can_access(tenant_id))
  with check (plant.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Usina desativada é história de geração —
-- arquivar é status, e `archived → active` existe (a usina volta a operar).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVA, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function plant.guard_plant_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'a usina nasce ativa — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger plant_plants_stamp
  before insert on plant.plants
  for each row execute function plant.guard_plant_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/plant
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (a usina volta a operar — a física do catalog/vendor).

create or replace function plant.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function plant.allowed_transition(text, text) is
  'Ciclo de vida da usina. Espelho de ALLOWED_TRANSITIONS em @alsham/plant. active ↔ archived: a usina desativada que volta a operar é a MESMA (a física do catalog/vendor/mall, o DIVERGE do hr onde terminated é terminal).';

create or replace function plant.guard_plant_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not plant.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da usina', old.status, new.status
      using errcode = '22023';
  end if;

  -- Arquivar e reativar são DECISÕES (tiram/põem a usina em operação).
  if not core.has_permission(new.tenant_id, 'plant.plant.decide') then
    raise exception 'arquivar ou reativar uma usina exige a permissão plant.plant.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger plant_plants_guard_status
  before update of status on plant.plants
  for each row execute function plant.guard_plant_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function plant.plant_payload(p plant.plants)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'plantId',      p.id,
    'name',         p.name,
    'location',     p.location,
    'capacityKwp',  p.capacity_kwp,
    'plantType',    p.plant_type,
    'status',       p.status
  );
$$;

comment on function plant.plant_payload(plant.plants) is
  'O envelope de uma usina — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function plant.on_plant_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform plant.emit_event(new.tenant_id, 'plant.plant.registered', plant.plant_payload(new));
  return new;
end;
$$;

create trigger plant_plants_emit_registered
  after insert on plant.plants
  for each row execute function plant.on_plant_registered();

create or replace function plant.on_plant_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform plant.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'plant.plant.archived'
           else 'plant.plant.reopened' end,
      plant.plant_payload(new)
    );
    return new;
  end if;

  if new.name is distinct from old.name
     or new.location is distinct from old.location
     or new.capacity_kwp is distinct from old.capacity_kwp
     or new.plant_type is distinct from old.plant_type then
    perform plant.emit_event(new.tenant_id, 'plant.plant.updated', plant.plant_payload(new));
  end if;

  return new;
end;
$$;

create trigger plant_plants_emit_changed
  after update on plant.plants
  for each row execute function plant.on_plant_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema plant                  from public, anon, authenticated;
revoke all on all tables    in schema plant from public, anon, authenticated;
revoke all on all functions in schema plant from public, anon, authenticated;

grant usage on schema plant to authenticated;

grant select, insert, update on plant.plants to authenticated;

grant execute on function plant.can_access(uuid) to authenticated;

-- `plant.emit_event` NÃO é concedida. `plant.plant_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum DELETE. Nenhum enum de tipo (é texto livre — a consolidação de
-- GD). Nenhuma telemetria (é o genreading, id solto). Nenhuma manutenção (é o
-- mnt, asset_id solto). Nenhum contrato (é o ctr). Nenhum objeto fora de
-- `plant`. Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
