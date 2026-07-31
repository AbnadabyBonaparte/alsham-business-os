-- =============================================================================
-- O MÓDULO 69 NO BANCO — o acervo de PI que se isola, o tipo num CHECK (4
-- categorias), o ciclo TERMINAL sem reabertura (a física do proj/nc) e a
-- identidade que congela fora do depósito
-- =============================================================================
--
-- ⭐ Domain 🔬 Pesquisa & Desenvolvimento (Onda Dezesseis, Fase 2) — o segundo
-- e último da onda, FECHA o território.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert74(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: ip instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'ip', 'Propriedade Intelectual', '0.1.0',
  'Ativos de PI com o tipo num CHECK; ciclo terminal sem reabertura.',
  'domain', 'rnd',
  '[{"key":"intellectual-property","canonicalName":"Propriedade intelectual"}]'::jsonb,
  '[{"key":"ip.asset.manage","moduleId":"ip","description":"Gerir ativos de PI."}]'::jsonb,
  '[{"type":"ip.asset.registered","version":1,"description":"Um ativo de PI foi registrado."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ip', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ip', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ip.asset.manage', 'ip'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, NASCIMENTO FILED, CARIMBO DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: o ativo nasce filed; o autor é do servidor; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into ip.assets (tenant_id, title, asset_type, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Motor solar modular', 'patent',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert74(v_st = 'filed', 'o ativo nasce filed');
  perform pg_temp.assert74(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from ip.assets;
  perform pg_temp.assert74(v_n = 0, 'o Beta não vê o ativo do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ O TIPO: AS QUATRO CATEGORIAS, E SÓ ELAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: asset_type só aceita patent/trademark/copyright/trade_secret ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into ip.assets (tenant_id, title, asset_type) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Marca X', 'trademark'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Obra Y', 'copyright'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fórmula Z', 'trade_secret');
  perform pg_temp.assert74(true, '⭐ as quatro categorias entram');

  begin
    insert into ip.assets (tenant_id, title, asset_type)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Coisa', 'design');
    perform pg_temp.assert74(false, 'DEVERIA TER FALHADO: tipo fora das quatro categorias');
  exception when check_violation then
    perform pg_temp.assert74(true, '⭐⭐ tipo fora das quatro categorias é recusado (física do direito)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O CICLO TERMINAL: filed → granted → expired; filed → rejected
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o ciclo, os carimbos, e os terminais que não reabrem ==='

do $$
declare v_p uuid; v_r uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into ip.assets (tenant_id, title, asset_type)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Patente A', 'patent') returning id into v_p;

  -- Pular granted (filed → expired) é recusado.
  begin
    update ip.assets set status='expired' where id = v_p;
    perform pg_temp.assert74(false, 'DEVERIA TER FALHADO: expirar o que não foi concedido');
  exception when others then
    perform pg_temp.assert74(true, '⛔ não se expira o que não foi concedido (filed → expired)');
  end;

  -- Conceder: carimba granted_at.
  update ip.assets set status='granted' where id = v_p;
  perform pg_temp.assert74((select granted_at is not null from ip.assets where id = v_p),
    '⭐ concedida: granted_at é do servidor');

  -- Expirar (a partir de granted): carimba closed_at, mantém granted_at.
  update ip.assets set status='expired' where id = v_p;
  perform pg_temp.assert74(
    (select granted_at is not null and closed_at is not null from ip.assets where id = v_p),
    '⭐ expirada: granted_at persiste e closed_at é carimbado');

  -- ⭐⭐ expired é TERMINAL: não reabre.
  begin
    update ip.assets set status='granted' where id = v_p;
    perform pg_temp.assert74(false, 'DEVERIA TER FALHADO: reabrir um expirado');
  exception when others then
    perform pg_temp.assert74(true, '⭐⭐ expired é terminal — o que volta é depósito novo');
  end;

  -- Indeferir um outro: filed → rejected (terminal).
  insert into ip.assets (tenant_id, title, asset_type)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Pedido B', 'patent') returning id into v_r;
  update ip.assets set status='rejected' where id = v_r;
  perform pg_temp.assert74((select closed_at is not null from ip.assets where id = v_r),
    'indeferida: closed_at é do servidor');
  begin
    update ip.assets set status='granted' where id = v_r;
    perform pg_temp.assert74(false, 'DEVERIA TER FALHADO: reabrir um indeferido');
  exception when others then
    perform pg_temp.assert74(true, '⭐⭐ rejected é terminal — não reabre');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ A IDENTIDADE CONGELA FORA DO DEPÓSITO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: título e tipo não mudam depois de granted ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into ip.assets (tenant_id, title, asset_type)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Título original', 'patent') returning id into v_id;

  -- Em filed, editar é livre.
  update ip.assets set title='Título ajustado' where id = v_id;
  perform pg_temp.assert74(true, 'em filed, título muda livre');

  update ip.assets set status='granted' where id = v_id;

  -- ⭐ Depois de granted, título/tipo congelam.
  begin
    update ip.assets set title='Não pode' where id = v_id;
    perform pg_temp.assert74(false, 'DEVERIA TER FALHADO: mudar título de ativo concedido');
  exception when others then
    perform pg_temp.assert74(true, '⭐ a identidade congela fora do depósito (título)');
  end;
  begin
    update ip.assets set asset_type='trademark' where id = v_id;
    perform pg_temp.assert74(false, 'DEVERIA TER FALHADO: mudar tipo de ativo concedido');
  exception when others then
    perform pg_temp.assert74(true, '⭐ a identidade congela fora do depósito (tipo)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT, A CANETA, ANON, E OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into ip.assets (tenant_id, title, asset_type)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 'patent');
    perform pg_temp.assert74(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert74(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform ip.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ip.asset.registered', '{}'::jsonb);
    perform pg_temp.assert74(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert74(true, 'ip.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from ip.assets limit 1;
    perform pg_temp.assert74(false, 'DEVERIA TER FALHADO: anon leu ip.assets');
  exception when insufficient_privilege then
    perform pg_temp.assert74(true, '⭐ anon não encosta em ip.assets');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'ip.asset.registered';
  perform pg_temp.assert74(v_n >= 5, 'cada ativo registrado emitiu ip.asset.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'ip.asset.granted';
  perform pg_temp.assert74(v_n >= 1, 'a concessão emitiu ip.asset.granted');
  select count(*) into v_n from core.event_outbox where event_type = 'ip.asset.expired';
  perform pg_temp.assert74(v_n >= 1, 'a expiração emitiu ip.asset.expired');
end $$;

\echo ''
\echo '=== MÓDULO 69 OK: tipo CHECK (4 categorias), ciclo terminal sem reabertura, identidade congela, anon fora ==='
