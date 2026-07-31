-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0087_catalog.sql
-- Módulo 72: Catálogo de Produtos. Schema `catalog`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §31, o
-- segundo módulo da Onda Dezoito (Fase 2 — o Vertical 🛒 Varejo &
-- Supermercados). Nasce sob `vertical_key='retail'` (confirmado na
-- store-taxonomy).
--
-- Taxonomia: Vertical 🛒 Varejo & Supermercados — capacidade *Catálogo* (§6).
-- Spec: docs/canon/MODULO-CATALOG-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ archived` — re-perguntado, a física do `vendor`/`mall`
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- pergunta foi refeita: o produto é GENTE (física do `hr`, `terminated`
-- terminal) ou ATIVO DE CADASTRO que volta (física do `vendor`/`mall`/`dc`)? É
-- cadastro: o produto DESCONTINUADO que a loja volta a vender é o MESMO produto
-- — obrigá-lo a renascer partiria o histórico de venda em dois (e o `pdv`
-- carimba o `product_name`, então a venda antiga continua legível de qualquer
-- jeito). Então `archived → active` EXISTE. O contraste catalog×hr fica no
-- teste do `pdv`/`catalog`.
--
-- -----------------------------------------------------------------------------
-- ⭐ SKU TEXTO LIVRE, OPCIONAL — a lição do `crm`/`vendor`
-- -----------------------------------------------------------------------------
-- Nem toda casa usa código de produto: a padaria da esquina vende "pão francês"
-- sem SKU; o supermercado grande tem EAN em tudo. Congelar o código num formato
-- (EAN-13, código interno) faria o produto envelhecer com o tenant que o
-- desenhou. SKU é TEXTO LIVRE e OPCIONAL — um produto sem SKU é honesto.
--
-- -----------------------------------------------------------------------------
-- ⭐ PREÇO = valor + moeda JUNTOS — a física de sempre (`pcost`/`cash`/`quote`)
-- -----------------------------------------------------------------------------
-- O preço nasce em centavos (`bigint`) com a moeda ao lado (nunca um `float`,
-- nunca um valor sem moeda). É o preço de TABELA (lista) — o preço EFETIVO da
-- venda vive no item do cupom (`pdv.sale_items.unit_price_cents`), congelado no
-- fechamento. O catálogo diz "quanto custa hoje"; a venda diz "quanto custou".
--
-- ⛔ FORA: *Estoque de varejo* (é o `inv` genérico — saldo por movimento, id
-- solto); variação/grade (tamanho·cor — capacidade futura); imagem do produto
-- (Storage do Core, não construído); *Marketplace próprio* (integração futura).
-- =============================================================================

create schema if not exists catalog;

comment on schema catalog is
  'Módulo Catálogo de Produtos. Vertical retail (Varejo & Supermercados) da Taxonomia. O cadastro do que a loja vende: SKU TEXTO LIVRE opcional, nome, preço de tabela (valor + moeda). active ↔ archived (o produto descontinuado que volta é o MESMO produto — a física do vendor/mall). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — septuagésima segunda vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function catalog.emit_event(
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
  if p_event_type not like 'catalog.%' then
    raise exception 'catalog.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'catalog',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function catalog.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function catalog.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'catalog.product.manage')
      or core.has_permission(p_tenant_id, 'catalog.product.decide');
$$;

create or replace function catalog.touch_updated_at()
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
-- 2. PRODUCTS — os produtos do catálogo
-- =============================================================================

create table catalog.products (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  name           text        not null check (length(btrim(name)) > 0),
  -- ⭐ SKU TEXTO LIVRE, OPCIONAL — nem toda casa usa código (a lição do crm).
  sku            text        not null default '',
  -- ⭐ Preço de TABELA: valor + moeda JUNTOS. >= 0 (um brinde a R$ 0 é honesto;
  -- preço negativo é infísico — o DIVERGE do pcost, que aceita <> 0 por ser
  -- livro de gasto). O preço EFETIVO da venda vive no item do cupom (pdv).
  price_cents    bigint      not null default 0 check (price_cents >= 0),
  currency       text        not null default 'BRL' check (length(currency) = 3),
  status         text        not null default 'active'
                 check (status in ('active', 'archived')),
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint catalog_products_id_tenant unique (id, tenant_id)
);

create index catalog_products_roster_idx
  on catalog.products (tenant_id, status, name);

create trigger catalog_products_touch
  before update on catalog.products
  for each row execute function catalog.touch_updated_at();

alter table catalog.products enable row level security;
alter table catalog.products force row level security;

create policy catalog_products_select on catalog.products
  for select to authenticated
  using (catalog.can_access(tenant_id));

create policy catalog_products_insert on catalog.products
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'catalog.product.manage'));

-- ⚠️ USING = can_access (não product.decide): assim quem só arquiva ALCANÇA a
-- linha e bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE
-- afetar 0 linhas em silêncio. A decisão vive no gatilho (o padrão do vendor).
create policy catalog_products_update on catalog.products
  for update to authenticated
  using (catalog.can_access(tenant_id))
  with check (catalog.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Produto descontinuado é história de venda —
-- arquivar é status, e `archived → active` existe (o produto volta ao catálogo).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function catalog.guard_product_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o produto nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger catalog_products_stamp
  before insert on catalog.products
  for each row execute function catalog.guard_product_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/catalog
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (o produto volta ao catálogo — a física do vendor/mall).

create or replace function catalog.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function catalog.allowed_transition(text, text) is
  'Ciclo de vida do produto. Espelho de ALLOWED_TRANSITIONS em @alsham/catalog. active ↔ archived: o produto descontinuado que volta é o MESMO produto (a física do vendor/mall, o DIVERGE do hr onde terminated é terminal).';

create or replace function catalog.guard_product_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not catalog.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do produto', old.status, new.status
      using errcode = '22023';
  end if;

  -- Arquivar e reativar são DECISÕES (tiram/põem o produto no catálogo vivo).
  if not core.has_permission(new.tenant_id, 'catalog.product.decide') then
    raise exception 'arquivar ou reativar um produto exige a permissão catalog.product.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger catalog_products_guard_status
  before update of status on catalog.products
  for each row execute function catalog.guard_product_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function catalog.product_payload(p catalog.products)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'productId',  p.id,
    'name',       p.name,
    'sku',        p.sku,
    'priceCents', p.price_cents,
    'currency',   p.currency,
    'status',     p.status
  );
$$;

comment on function catalog.product_payload(catalog.products) is
  'O envelope de um produto — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function catalog.on_product_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform catalog.emit_event(new.tenant_id, 'catalog.product.registered', catalog.product_payload(new));
  return new;
end;
$$;

create trigger catalog_products_emit_registered
  after insert on catalog.products
  for each row execute function catalog.on_product_registered();

create or replace function catalog.on_product_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform catalog.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'catalog.product.archived'
           else 'catalog.product.reopened' end,
      catalog.product_payload(new)
    );
    return new;
  end if;

  if new.name is distinct from old.name
     or new.sku is distinct from old.sku
     or new.price_cents is distinct from old.price_cents
     or new.currency is distinct from old.currency then
    perform catalog.emit_event(new.tenant_id, 'catalog.product.updated', catalog.product_payload(new));
  end if;

  return new;
end;
$$;

create trigger catalog_products_emit_changed
  after update on catalog.products
  for each row execute function catalog.on_product_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema catalog                  from public, anon, authenticated;
revoke all on all tables    in schema catalog from public, anon, authenticated;
revoke all on all functions in schema catalog from public, anon, authenticated;

grant usage on schema catalog to authenticated;

grant select, insert, update on catalog.products to authenticated;

grant execute on function catalog.can_access(uuid) to authenticated;

-- `catalog.emit_event` NÃO é concedida. `catalog.product_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de SKU. Nenhum estoque (é o inv, id solto).
-- Nenhum objeto fora de `catalog`. Nenhuma leitura de schema alheio. `consumes`
-- VAZIO.
-- =============================================================================
