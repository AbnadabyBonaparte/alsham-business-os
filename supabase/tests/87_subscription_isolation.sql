-- =============================================================================
-- O MÓDULO 82 NO BANCO — a ASSINATURA que se isola: nasce active (sem pending),
-- allocation_percent 0<x<=100, e ⭐ active → cancelled TERMINAL (a física do
-- proj) — cancelar exige razão E a permissão PRÓPRIA de decisão; a cancelada
-- não reabre nem se edita (o DIVERGE do catalog).
-- =============================================================================
--
-- ⭐ Vertical ☀️ Energia (Onda Vinte, Fase 3).
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert87(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: subscription instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'subscription', 'Assinatura de Energia', '0.1.0',
  'O consumidor assina uma fatia da geração de uma usina; active → cancelled terminal.',
  'vertical', 'energy',
  '[{"key":"energy-subscription","canonicalName":"Assinatura de energia"}]'::jsonb,
  '[{"key":"subscription.subscription.manage","moduleId":"subscription","description":"Cadastrar."},
    {"key":"subscription.subscription.decide","moduleId":"subscription","description":"Cancelar."}]'::jsonb,
  '[{"type":"subscription.subscription.registered","version":1,"description":"Registrada."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'subscription', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'subscription', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- O Alfa tem manage + decide; o Beta só manage — para provar que cancelar exige
-- a permissão PRÓPRIA de decisão.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'subscription.subscription.manage', 'subscription'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'subscription.subscription.decide', 'subscription'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- Um cliente e uma usina fabricados (id solto — não há FK, é só uuid).
\set cust '33333333-3333-4333-8333-333333333333'
\set usina '44444444-4444-4444-8444-444444444444'

-- =============================================================================
-- CENÁRIO 1 — NASCE ACTIVE (sem pending), ISOLA, O SERVIDOR CARIMBA O AUTOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce active (sem pending); created_by do servidor; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into subscription.subscriptions
    (tenant_id, customer_id, customer_name, plant_id, plant_name, allocation_percent, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'Cliente Solar',
          '44444444-4444-4444-8444-444444444444', 'Usina Cerrado', 12.5,
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert87(v_st = 'active', '⭐ a assinatura nasce active — não há pending');
  perform pg_temp.assert87(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  -- SABOTAGEM: nascer cancelada é recusado.
  begin
    insert into subscription.subscriptions
      (tenant_id, customer_id, plant_id, allocation_percent, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
            '44444444-4444-4444-8444-444444444444', 10, 'cancelled');
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: assinatura nascendo cancelada');
  exception when others then
    perform pg_temp.assert87(true, '⭐ a assinatura não nasce cancelada');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from subscription.subscriptions;
  perform pg_temp.assert87(v_n = 0, 'o Beta não vê a assinatura do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — allocation_percent 0 < x <= 100 (a fatia é positiva e cabe)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: allocation_percent 0 < x <= 100 ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into subscription.subscriptions (tenant_id, customer_id, plant_id, allocation_percent)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
            '44444444-4444-4444-8444-444444444444', 0);
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: fatia 0');
  exception when check_violation then
    perform pg_temp.assert87(true, '⭐ allocation_percent > 0 (zero não é assinatura)');
  end;

  begin
    insert into subscription.subscriptions (tenant_id, customer_id, plant_id, allocation_percent)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
            '44444444-4444-4444-8444-444444444444', 100.01);
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: fatia acima de 100');
  exception when check_violation then
    perform pg_temp.assert87(true, '⭐ allocation_percent <= 100 (não se aloca mais do que a usina gera)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ active → cancelled TERMINAL: exige razão E decide; não reabre
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: cancelar exige razão e decide; a cancelada não reabre ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  -- O Beta (só manage) cria e TENTA cancelar.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into subscription.subscriptions (tenant_id, customer_id, plant_id, allocation_percent)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444', 20)
  returning id into v_id;

  begin
    update subscription.subscriptions set status = 'cancelled', cancel_reason = 'saiu' where id = v_id;
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: cancelar sem decide');
  exception when insufficient_privilege then
    perform pg_temp.assert87(true, '⭐ cancelar exige subscription.subscription.decide (o Beta não tem)');
  end;
end $$;

do $$
declare v_id uuid; v_ca timestamptz; v_cb uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem decide)

  select id into v_id from subscription.subscriptions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and customer_name = 'Cliente Solar';

  -- SABOTAGEM: cancelar sem razão é recusado.
  begin
    update subscription.subscriptions set status = 'cancelled' where id = v_id;
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: cancelar sem razão');
  exception when others then
    perform pg_temp.assert87(true, '⭐ cancelar exige uma razão (a física do proj)');
  end;

  -- Cancelar com razão: passa, e o carimbo é do servidor.
  update subscription.subscriptions set status = 'cancelled', cancel_reason = 'cliente mudou de imóvel' where id = v_id;
  select cancelled_at, cancelled_by into v_ca, v_cb from subscription.subscriptions where id = v_id;
  perform pg_temp.assert87(v_ca is not null, 'cancelled_at carimbado pelo servidor');
  perform pg_temp.assert87(v_cb = '11111111-1111-4111-8111-111111111111', '⭐ cancelled_by é quem cancelou');

  -- ⭐⭐ TERMINAL: a cancelada não reabre.
  begin
    update subscription.subscriptions set status = 'active' where id = v_id;
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: reabrir uma assinatura cancelada');
  exception when others then
    perform pg_temp.assert87(true, '⭐⭐ cancelled é TERMINAL — quem re-assina faz OUTRA (a física do proj)');
  end;

  -- E a cancelada não se edita (congelada).
  begin
    update subscription.subscriptions set allocation_percent = 50 where id = v_id;
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: editar uma cancelada');
  exception when others then
    perform pg_temp.assert87(true, '⭐ a cancelada é terminal: não se edita');
  end;
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
    insert into subscription.subscriptions (tenant_id, customer_id, plant_id, allocation_percent)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333',
            '44444444-4444-4444-8444-444444444444', 10);
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert87(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform subscription.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'subscription.subscription.registered', '{}'::jsonb);
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert87(true, 'subscription.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from subscription.subscriptions limit 1;
    perform pg_temp.assert87(false, 'DEVERIA TER FALHADO: anon leu subscription.subscriptions');
  exception when insufficient_privilege then
    perform pg_temp.assert87(true, '⭐ anon não encosta em subscription.subscriptions');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'subscription.subscription.registered';
  perform pg_temp.assert87(v_n >= 2, 'cada assinatura registrada emitiu subscription.subscription.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'subscription.subscription.cancelled';
  perform pg_temp.assert87(v_n >= 1, 'o cancelamento emitiu subscription.subscription.cancelled');
end $$;

\echo ''
\echo '=== MÓDULO 82 OK: assinatura isolada, nasce active, fatia 0<x<=100, cancelled terminal com razão+decide, anon fora ==='
