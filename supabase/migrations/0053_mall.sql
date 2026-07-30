-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0053_mall.sql
-- Módulo 38: Gestão de Lojistas. Schema `mall`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §22,
-- depois do `0052_pol.sql`. Primeiro módulo da Missão Nove (Onda 6 — a
-- ÚLTIMA da campanha), e o PRIMEIRO módulo VERTICAL do catálogo inteiro.
--
-- Taxonomia: Vertical 🛍 Shopping Centers — capacidade *Lojistas* (§6). É o
-- primeiro cartão com `vertical_key` (não `domain_key`): a Store o exibe na
-- galeria "Verticais por Setor", graduando a pill "Em breve" de Shopping
-- Centers (chave `shopping-centers`, VerticalKey do `@alsham/core`).
-- Spec: docs/canon/MODULO-MALL-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⚠️ A LEI DO REAPROVEITAMENTO (Taxonomia §9) — a primeira onda vertical
-- -----------------------------------------------------------------------------
-- Verticais REUTILIZAM os Domains universais e acrescentam só o ofício. Antes
-- de qualquer tabela nova este módulo perguntou: "isso já é o genérico?" A
-- UNIDADE FÍSICA que a loja ocupa já é modelável como um `spc.space` (Reserva
-- de Espaços) — então o `mall` NÃO recria cadastro de espaço: referencia a
-- unidade por ID SOLTO (`space_id`, sem FK) + nome carimbado pela tela. O que
-- é do ofício do shopping — o lojista, o segmento — é o que nasce aqui.
--
-- ⚠️ ANTI-VIÉS REFORÇADO: "shopping" é o vertical, mas ZERO vocabulário de
-- cliente. Segmento de loja é DADO DO TENANT (texto livre — "moda",
-- "alimentação", "serviços" é vocabulário de cada praça), nunca enum. Nenhum
-- nome, organograma ou praça de cliente entra no schema.
--
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ archived` EXISTE — re-perguntado, e o DIVERGE do `hr` assinado
-- -----------------------------------------------------------------------------
-- No `hr` o `terminated` é TERMINAL (o ex-colaborador que volta assina
-- contrato NOVO de trabalho). Aqui a física é OUTRA, e mais perto do `crm`/
-- `spc`: um lojista é uma RELAÇÃO COMERCIAL, não um vínculo empregatício. A
-- loja que fecha e reabre (o mesmo grupo numa unidade nova, ou a mesma marca
-- que retorna) é a MESMA relação — obrigá-la a renascer partiria o histórico
-- comercial em dois. Então `archived → active` EXISTE. O contraste mall×hr é
-- assinado em teste: dois cadastros de "gente/negócio", physics opostas de
-- propósito.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA segmento TEXTO LIVRE e a unidade física por id solto.
--   ❌ NÃO ENTRA catálogo de produtos do lojista, comissão sobre vendas
--      (o termo comercial é do `lease`, Módulo 39), cadastro de espaço
--      (é do `spc` — reaproveitado por id solto).
-- =============================================================================

create schema if not exists mall;

comment on schema mall is
  'Módulo Gestão de Lojistas. Vertical shopping-centers da Taxonomia. Os lojistas do shopping: segmento TEXTO LIVRE (nunca enum), a unidade física por id solto ao spc (não recria cadastro de espaço). active ↔ archived existe (o lojista é relação comercial que volta — o DIVERGE do hr). Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima oitava vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function mall.emit_event(
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
  if p_event_type not like 'mall.%' then
    raise exception 'mall.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'mall',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function mall.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function mall.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'mall.store.manage')
      or core.has_permission(p_tenant_id, 'mall.store.decide');
$$;

create or replace function mall.touch_updated_at()
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
-- 2. STORES — os lojistas (o nome evita colidir com core.tenants na leitura)
-- =============================================================================

create table mall.stores (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  store_name  text        not null check (length(btrim(store_name)) > 0),
  -- ⭐ Segmento TEXTO LIVRE — vocabulário de cada praça, nunca enum.
  segment     text        not null check (length(btrim(segment)) > 0),
  -- ⭐ A unidade física por ID SOLTO ao spc (sem FK) + nome carimbado.
  space_id    uuid,
  space_name  text        not null default '',
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint mall_stores_id_tenant unique (id, tenant_id)
);

create index mall_stores_roster_idx
  on mall.stores (tenant_id, status, store_name);

create trigger mall_stores_touch
  before update on mall.stores
  for each row execute function mall.touch_updated_at();

alter table mall.stores enable row level security;
alter table mall.stores force row level security;

create policy mall_stores_select on mall.stores
  for select to authenticated
  using (mall.can_access(tenant_id));

create policy mall_stores_insert on mall.stores
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'mall.store.manage'));

create policy mall_stores_update on mall.stores
  for update to authenticated
  using (mall.can_access(tenant_id))
  with check (mall.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Lojista que saiu é história do mall —
-- arquivar é status, e `archived → active` existe (a relação comercial volta).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO
-- -----------------------------------------------------------------------------

create or replace function mall.guard_store_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o lojista nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger mall_stores_stamp
  before insert on mall.stores
  for each row execute function mall.guard_store_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/mall
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (o lojista volta — o DIVERGE do hr).

create or replace function mall.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function mall.allowed_transition(text, text) is
  'Ciclo de vida do lojista. Espelho de ALLOWED_TRANSITIONS em @alsham/mall. active ↔ archived: o lojista é relação comercial que volta (o DIVERGE do hr, onde terminated é terminal).';

create or replace function mall.guard_store_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not mall.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do lojista', old.status, new.status
      using errcode = '22023';
  end if;

  -- Arquivar e reabrir são DECISÕES (tiram/põem o lojista no mapa do mall).
  if not core.has_permission(new.tenant_id, 'mall.store.decide') then
    raise exception 'arquivar ou reabrir um lojista exige a permissão mall.store.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger mall_stores_guard_status
  before update of status on mall.stores
  for each row execute function mall.guard_store_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente (a unidade pelo NOME carimbado)
-- =============================================================================

create or replace function mall.store_payload(p mall.stores)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'storeId',   p.id,
    'storeName', p.store_name,
    'segment',   p.segment,
    'spaceId',   p.space_id,
    'spaceName', p.space_name,
    'status',    p.status
  );
$$;

comment on function mall.store_payload(mall.stores) is
  'O envelope de um lojista — AUTOSSUFICIENTE, com a unidade pelo NOME carimbado. Quem escuta não faz join.';

create or replace function mall.on_store_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform mall.emit_event(new.tenant_id, 'mall.store.registered', mall.store_payload(new));
  return new;
end;
$$;

create trigger mall_stores_emit_registered
  after insert on mall.stores
  for each row execute function mall.on_store_registered();

create or replace function mall.on_store_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform mall.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'mall.store.archived'
           else 'mall.store.reopened' end,
      mall.store_payload(new)
    );
    return new;
  end if;

  if new.store_name is distinct from old.store_name
     or new.segment is distinct from old.segment
     or new.space_id is distinct from old.space_id
     or new.space_name is distinct from old.space_name then
    perform mall.emit_event(new.tenant_id, 'mall.store.updated', mall.store_payload(new));
  end if;

  return new;
end;
$$;

create trigger mall_stores_emit_changed
  after update on mall.stores
  for each row execute function mall.on_store_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema mall                  from public, anon, authenticated;
revoke all on all tables    in schema mall from public, anon, authenticated;
revoke all on all functions in schema mall from public, anon, authenticated;

grant usage on schema mall to authenticated;

grant select, insert, update on mall.stores to authenticated;

grant execute on function mall.can_access(uuid) to authenticated;

-- `mall.emit_event` NÃO é concedida. `mall.store_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de segmento. Nenhum cadastro de espaço (é do
-- spc, por id solto). Nenhum nome de cliente. Nenhum objeto fora de `mall`.
-- Nenhuma leitura de schema alheio. `consumes` VAZIO (Lei 7).
-- =============================================================================
