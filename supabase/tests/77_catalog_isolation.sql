-- =============================================================================
-- O MÓDULO 72 NO BANCO — o CATÁLOGO que se isola: nasce active, o servidor
-- carimba o autor, preço >= 0, e o active ↔ archived exige a permissão PRÓPRIA
-- de decisão (o produto descontinuado volta — a física do vendor).
-- =============================================================================
--
-- ⭐ Vertical 🛒 Varejo & Supermercados (Onda Dezoito, Fase 2).
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert77(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: catalog instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'catalog', 'Catálogo de Produtos', '0.1.0',
  'O cadastro do que a loja vende: SKU texto livre opcional, nome, preço; active ↔ archived.',
  'vertical', 'retail',
  '[{"key":"product-catalog","canonicalName":"Catálogo"}]'::jsonb,
  '[{"key":"catalog.product.manage","moduleId":"catalog","description":"Cadastrar produtos."},
    {"key":"catalog.product.decide","moduleId":"catalog","description":"Arquivar/reativar."}]'::jsonb,
  '[{"type":"catalog.product.registered","version":1,"description":"Registrado."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'catalog', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'catalog', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- O Alfa tem manage + decide; o Beta só manage — para provar que arquivar exige
-- a permissão PRÓPRIA de decisão.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'catalog.product.manage', 'catalog'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'catalog.product.decide', 'catalog'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE ACTIVE, ISOLA, O SERVIDOR CARIMBA O AUTOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce active; created_by do servidor; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into catalog.products (tenant_id, name, sku, price_cents, currency, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Café 500g', 'CAFE500', 2990, 'BRL',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert77(v_st = 'active', 'o produto nasce active');
  perform pg_temp.assert77(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from catalog.products;
  perform pg_temp.assert77(v_n = 0, 'o Beta não vê o produto do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — PREÇO >= 0 (0 é honesto — um brinde; negativo é infísico)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: preço >= 0; sem SKU é honesto ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- preço 0, sem SKU: aceito.
  insert into catalog.products (tenant_id, name, price_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Sacola brinde', 0)
  returning id into v_id;
  perform pg_temp.assert77(v_id is not null, 'produto a preço 0 sem SKU é honesto');

  begin
    insert into catalog.products (tenant_id, name, price_cents)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Preço errado', -100);
    perform pg_temp.assert77(false, 'DEVERIA TER FALHADO: preço negativo');
  exception when check_violation then
    perform pg_temp.assert77(true, '⭐ preço negativo é recusado (>= 0)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ active ↔ archived, E ARQUIVAR EXIGE A PERMISSÃO DE DECISÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: arquivar/reativar exige decide; o produto volta ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  -- O Beta (só manage) cria e TENTA arquivar.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into catalog.products (tenant_id, name, price_cents)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Item Beta', 100)
  returning id into v_id;

  begin
    update catalog.products set status = 'archived' where id = v_id;
    perform pg_temp.assert77(false, 'DEVERIA TER FALHADO: arquivar sem decide');
  exception when insufficient_privilege then
    perform pg_temp.assert77(true, '⭐ arquivar exige catalog.product.decide (o Beta não tem)');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem decide)

  select id into v_id from catalog.products
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and sku = 'CAFE500';

  update catalog.products set status = 'archived' where id = v_id;
  perform pg_temp.assert77((select status = 'archived' from catalog.products where id = v_id),
    'o Alfa (com decide) arquivou o produto');

  update catalog.products set status = 'active' where id = v_id;
  perform pg_temp.assert77((select status = 'active' from catalog.products where id = v_id),
    '⭐ archived → active: o produto volta ao catálogo (a física do vendor)');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT, A CANETA, ANON, E OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into catalog.products (tenant_id, name, price_cents)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 100);
    perform pg_temp.assert77(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert77(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform catalog.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'catalog.product.registered', '{}'::jsonb);
    perform pg_temp.assert77(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert77(true, 'catalog.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from catalog.products limit 1;
    perform pg_temp.assert77(false, 'DEVERIA TER FALHADO: anon leu catalog.products');
  exception when insufficient_privilege then
    perform pg_temp.assert77(true, '⭐ anon não encosta em catalog.products');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'catalog.product.registered';
  perform pg_temp.assert77(v_n >= 3, 'cada produto registrado emitiu catalog.product.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'catalog.product.archived';
  perform pg_temp.assert77(v_n >= 1, 'o arquivamento emitiu catalog.product.archived');
  select count(*) into v_n from core.event_outbox where event_type = 'catalog.product.reopened';
  perform pg_temp.assert77(v_n >= 1, 'a reativação emitiu catalog.product.reopened');
end $$;

\echo ''
\echo '=== MÓDULO 72 OK: catálogo isolado, carimbo do servidor, preço >= 0, active↔archived com decide, anon fora ==='
