-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0065_dc.sql
-- Módulo 50: Centros de Distribuição. Schema `dc`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §24, um
-- módulo da Onda Onze (Fase 2 — o Domain Supply Chain). Nasce sob
-- `domain_key='supply-chain'` — território SEPARADO de Compras (Taxonomia §5:
-- "Supply Chain — separado de Compras").
--
-- Taxonomia: Domain 🔗 Supply Chain — capacidade *Centros de distribuição* (§5).
-- A Store o exibe na galeria "Domínios Universais", na seção Supply Chain.
-- Spec: docs/canon/MODULO-DC-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ archived` EXISTE — re-perguntado, e o DIVERGE do `hr` assinado
-- -----------------------------------------------------------------------------
-- Copiar o `vendor`/`mall` "por consistência" seria erro; copiar sem pensar e
-- divergir sem escrever são o mesmo erro (CLAUDE.md). Então a pergunta foi
-- refeita: um centro de distribuição é GENTE CONTRATADA (física do `hr`, onde
-- `terminated` é TERMINAL) ou ATIVO/RELAÇÃO que volta (física do `vendor`/`mall`/
-- `crm`/`spc`)? É ativo que volta: o CD que a empresa desativou e volta a operar
-- é o MESMO centro — obrigá-lo a renascer partiria o histórico de operação em
-- dois. Então `archived → active` EXISTE, como no `vendor`. O contraste
-- dc×hr é assinado em teste: dois cadastros, physics opostas de propósito.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA nome e endereço TEXTO LIVRE (o CD de cada empresa tem um lugar
--      próprio — endereço é dado do tenant; um CD sem endereço é honesto).
--   ❌ NÃO ENTRA capacidade volumétrica estruturada nem zoneamento interno do
--      CD (capacidade futura), nem vínculo FK — o cadastro não conhece o schema
--      de ninguém.
-- =============================================================================

create schema if not exists dc;

comment on schema dc is
  'Módulo Centros de Distribuição. Domain supply-chain (Supply Chain) da Taxonomia — separado de Compras. O cadastro de CDs: nome e endereço TEXTO LIVRE (nunca enum). active ↔ archived existe (o CD é ativo que volta — o DIVERGE do hr, onde terminated é terminal). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única forma de o módulo falar com o mundo. É lei.
-- =============================================================================

create or replace function dc.emit_event(
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
  if p_event_type not like 'dc.%' then
    raise exception 'dc.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'dc',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function dc.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function dc.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'dc.center.manage')
      or core.has_permission(p_tenant_id, 'dc.center.decide');
$$;

create or replace function dc.touch_updated_at()
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
-- 2. CENTERS — os centros de distribuição
-- =============================================================================

create table dc.centers (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  -- ⭐ Endereço TEXTO LIVRE — o lugar de cada CD. OPCIONAL: um CD sem endereço
  -- cadastrado é honesto, não um erro a chutar num campo obrigatório.
  address     text        not null default '',
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint dc_centers_id_tenant unique (id, tenant_id)
);

create index dc_centers_roster_idx
  on dc.centers (tenant_id, status, name);

create trigger dc_centers_touch
  before update on dc.centers
  for each row execute function dc.touch_updated_at();

alter table dc.centers enable row level security;
alter table dc.centers force row level security;

create policy dc_centers_select on dc.centers
  for select to authenticated
  using (dc.can_access(tenant_id));

create policy dc_centers_insert on dc.centers
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'dc.center.manage'));

-- ⚠️ USING = can_access (não center.decide): assim quem só arquiva ALCANÇA a
-- linha e bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE
-- afetar 0 linhas em silêncio. A decisão vive no gatilho (o padrão do vendor).
create policy dc_centers_update on dc.centers
  for update to authenticated
  using (dc.can_access(tenant_id))
  with check (dc.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. CD desativado é história de operação —
-- arquivar é status, e `archived → active` existe (o ativo volta a operar).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function dc.guard_center_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o centro de distribuição nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger dc_centers_stamp
  before insert on dc.centers
  for each row execute function dc.guard_center_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/dc
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (o CD volta — o DIVERGE do hr).

create or replace function dc.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function dc.allowed_transition(text, text) is
  'Ciclo de vida do centro de distribuição. Espelho de ALLOWED_TRANSITIONS em @alsham/dc. active ↔ archived: o CD é ativo que volta a operar (o DIVERGE do hr, onde terminated é terminal).';

create or replace function dc.guard_center_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not dc.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do centro de distribuição', old.status, new.status
      using errcode = '22023';
  end if;

  -- Arquivar e reativar são DECISÕES (tiram/põem o CD no cadastro vivo).
  if not core.has_permission(new.tenant_id, 'dc.center.decide') then
    raise exception 'arquivar ou reativar um centro de distribuição exige a permissão dc.center.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger dc_centers_guard_status
  before update of status on dc.centers
  for each row execute function dc.guard_center_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function dc.center_payload(p dc.centers)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'centerId', p.id,
    'name',     p.name,
    'address',  p.address,
    'status',   p.status
  );
$$;

comment on function dc.center_payload(dc.centers) is
  'O envelope de um centro de distribuição — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function dc.on_center_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform dc.emit_event(new.tenant_id, 'dc.center.registered', dc.center_payload(new));
  return new;
end;
$$;

create trigger dc_centers_emit_registered
  after insert on dc.centers
  for each row execute function dc.on_center_registered();

create or replace function dc.on_center_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform dc.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'dc.center.archived'
           else 'dc.center.reopened' end,
      dc.center_payload(new)
    );
    return new;
  end if;

  if new.name is distinct from old.name
     or new.address is distinct from old.address then
    perform dc.emit_event(new.tenant_id, 'dc.center.updated', dc.center_payload(new));
  end if;

  return new;
end;
$$;

create trigger dc_centers_emit_changed
  after update on dc.centers
  for each row execute function dc.on_center_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema dc                  from public, anon, authenticated;
revoke all on all tables    in schema dc from public, anon, authenticated;
revoke all on all functions in schema dc from public, anon, authenticated;

grant usage on schema dc to authenticated;

grant select, insert, update on dc.centers to authenticated;

grant execute on function dc.can_access(uuid) to authenticated;

-- `dc.emit_event` NÃO é concedida. `dc.center_payload` é encanamento dos
-- gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de endereço. Nenhum nome de cliente. Nenhum
-- objeto fora de `dc`. Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
