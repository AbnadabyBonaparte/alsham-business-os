-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0058_vendor.sql
-- Módulo 43: Fornecedores. Schema `vendor`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §23, o
-- primeiro módulo da Onda Dez (Fase 2 — completar o Domain Compras). É o
-- primeiro dos cinco que sobem `domain_key='procurement'` para além do `po`.
--
-- Taxonomia: Domain 📦 Compras — capacidade *Fornecedores* (§5). A Store o
-- exibe na galeria "Domínios Universais", na seção Compras, ao lado do `po`.
-- Spec: docs/canon/MODULO-VENDOR-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ `active ↔ archived` EXISTE — re-perguntado, e o DIVERGE do `hr` assinado
-- -----------------------------------------------------------------------------
-- Copiar o `mall` "por consistência" seria erro; copiar sem pensar e divergir
-- sem escrever são o mesmo erro (CLAUDE.md). Então a pergunta foi refeita: o
-- fornecedor é GENTE CONTRATADA (física do `hr`, onde `terminated` é TERMINAL)
-- ou RELAÇÃO COMERCIAL que volta (física do `mall`/`crm`/`spc`)? É relação
-- comercial: o fornecedor que a empresa deixou de usar e volta a comprar é o
-- MESMO fornecedor — obrigá-lo a renascer partiria o histórico de compra em
-- dois. Então `archived → active` EXISTE, como no `mall`. O contraste
-- vendor×hr é assinado em teste: dois cadastros, physics opostas de propósito.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA nome e segmento/categoria TEXTO LIVRE (o vocabulário de cada
--      compra — "matéria-prima", "serviços", "TI" é dado do tenant).
--   ❌ NÃO ENTRA certificação/homologação formal (capacidade futura), catálogo
--      de produtos do fornecedor, nem contrato de fornecimento (é o `ctr`
--      genérico, por id solto — como o `lease` fez com o shopping).
-- =============================================================================

create schema if not exists vendor;

comment on schema vendor is
  'Módulo Fornecedores. Domain procurement (Compras) da Taxonomia. O cadastro de fornecedores: nome e segmento TEXTO LIVRE (nunca enum). active ↔ archived existe (o fornecedor é relação comercial que volta — o DIVERGE do hr, onde terminated é terminal). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — quadragésima terceira vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function vendor.emit_event(
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
  if p_event_type not like 'vendor.%' then
    raise exception 'vendor.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'vendor',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function vendor.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function vendor.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'vendor.supplier.manage')
      or core.has_permission(p_tenant_id, 'vendor.supplier.decide');
$$;

create or replace function vendor.touch_updated_at()
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
-- 2. SUPPLIERS — os fornecedores
-- =============================================================================

create table vendor.suppliers (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  -- ⭐ Segmento/categoria TEXTO LIVRE — vocabulário de cada compra. OPCIONAL:
  -- um fornecedor sem categoria é honesto, não um erro a chutar um enum.
  segment     text        not null default '',
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint vendor_suppliers_id_tenant unique (id, tenant_id)
);

create index vendor_suppliers_roster_idx
  on vendor.suppliers (tenant_id, status, name);

create trigger vendor_suppliers_touch
  before update on vendor.suppliers
  for each row execute function vendor.touch_updated_at();

alter table vendor.suppliers enable row level security;
alter table vendor.suppliers force row level security;

create policy vendor_suppliers_select on vendor.suppliers
  for select to authenticated
  using (vendor.can_access(tenant_id));

create policy vendor_suppliers_insert on vendor.suppliers
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'vendor.supplier.manage'));

-- ⚠️ USING = can_access (não supplier.decide): assim quem só arquiva ALCANÇA a
-- linha e bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE
-- afetar 0 linhas em silêncio. A decisão vive no gatilho (o padrão do mall).
create policy vendor_suppliers_update on vendor.suppliers
  for update to authenticated
  using (vendor.can_access(tenant_id))
  with check (vendor.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Fornecedor que saiu é história de compra —
-- arquivar é status, e `archived → active` existe (a relação comercial volta).

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function vendor.guard_supplier_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o fornecedor nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger vendor_suppliers_stamp
  before insert on vendor.suppliers
  for each row execute function vendor.guard_supplier_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/vendor
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (o fornecedor volta — o DIVERGE do hr).

create or replace function vendor.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function vendor.allowed_transition(text, text) is
  'Ciclo de vida do fornecedor. Espelho de ALLOWED_TRANSITIONS em @alsham/vendor. active ↔ archived: o fornecedor é relação comercial que volta (o DIVERGE do hr, onde terminated é terminal).';

create or replace function vendor.guard_supplier_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not vendor.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do fornecedor', old.status, new.status
      using errcode = '22023';
  end if;

  -- Arquivar e reativar são DECISÕES (tiram/põem o fornecedor no cadastro vivo).
  if not core.has_permission(new.tenant_id, 'vendor.supplier.decide') then
    raise exception 'arquivar ou reativar um fornecedor exige a permissão vendor.supplier.decide'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger vendor_suppliers_guard_status
  before update of status on vendor.suppliers
  for each row execute function vendor.guard_supplier_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function vendor.supplier_payload(p vendor.suppliers)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'supplierId', p.id,
    'name',       p.name,
    'segment',    p.segment,
    'status',     p.status
  );
$$;

comment on function vendor.supplier_payload(vendor.suppliers) is
  'O envelope de um fornecedor — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function vendor.on_supplier_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform vendor.emit_event(new.tenant_id, 'vendor.supplier.registered', vendor.supplier_payload(new));
  return new;
end;
$$;

create trigger vendor_suppliers_emit_registered
  after insert on vendor.suppliers
  for each row execute function vendor.on_supplier_registered();

create or replace function vendor.on_supplier_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform vendor.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'vendor.supplier.archived'
           else 'vendor.supplier.reopened' end,
      vendor.supplier_payload(new)
    );
    return new;
  end if;

  if new.name is distinct from old.name
     or new.segment is distinct from old.segment then
    perform vendor.emit_event(new.tenant_id, 'vendor.supplier.updated', vendor.supplier_payload(new));
  end if;

  return new;
end;
$$;

create trigger vendor_suppliers_emit_changed
  after update on vendor.suppliers
  for each row execute function vendor.on_supplier_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema vendor                  from public, anon, authenticated;
revoke all on all tables    in schema vendor from public, anon, authenticated;
revoke all on all functions in schema vendor from public, anon, authenticated;

grant usage on schema vendor to authenticated;

grant select, insert, update on vendor.suppliers to authenticated;

grant execute on function vendor.can_access(uuid) to authenticated;

-- `vendor.emit_event` NÃO é concedida. `vendor.supplier_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de segmento. Nenhum nome de cliente. Nenhum
-- objeto fora de `vendor`. Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
