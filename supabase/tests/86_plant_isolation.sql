-- =============================================================================
-- O MÓDULO 81 NO BANCO — a USINA que se isola: nasce active, o servidor carimba
-- o autor, capacity_kwp > 0, o tipo/porte é TEXTO LIVRE (a consolidação de GD),
-- e o active ↔ archived exige a permissão PRÓPRIA de decisão (a usina volta a
-- operar — a física do catalog/vendor).
-- =============================================================================
--
-- ⭐ Vertical ☀️ Energia (Onda Vinte, Fase 3) — o PRIMEIRO módulo do energy.
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert86(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: plant instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'plant', 'Usinas', '0.1.0',
  'O cadastro da unidade geradora: nome, localização, capacidade kWp, tipo; active ↔ archived.',
  'vertical', 'energy',
  '[{"key":"power-plants","canonicalName":"Usinas"},{"key":"distributed-generation","canonicalName":"Geração distribuída"}]'::jsonb,
  '[{"key":"plant.plant.manage","moduleId":"plant","description":"Cadastrar usinas."},
    {"key":"plant.plant.decide","moduleId":"plant","description":"Arquivar/reativar."}]'::jsonb,
  '[{"type":"plant.plant.registered","version":1,"description":"Registrada."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'plant', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'plant', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- O Alfa tem manage + decide; o Beta só manage — para provar que arquivar exige
-- a permissão PRÓPRIA de decisão.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'plant.plant.manage', 'plant'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'plant.plant.decide', 'plant'
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

  insert into plant.plants (tenant_id, name, location, capacity_kwp, plant_type, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Usina Solar Cerrado', 'Lote 3', 750.50,
          'usina centralizada', '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert86(v_st = 'active', 'a usina nasce active');
  perform pg_temp.assert86(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  -- SABOTAGEM: nascer arquivada é recusado (o nascimento é do gatilho).
  begin
    insert into plant.plants (tenant_id, name, capacity_kwp, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce errada', 10, 'archived');
    perform pg_temp.assert86(false, 'DEVERIA TER FALHADO: usina nascendo arquivada');
  exception when others then
    perform pg_temp.assert86(true, '⭐ a usina não nasce arquivada — o nascimento é do gatilho');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from plant.plants;
  perform pg_temp.assert86(v_n = 0, 'o Beta não vê a usina do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — capacity_kwp > 0 (a placa de uma usina real é positiva)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: capacity_kwp > 0; tipo/porte é texto livre (a GD) ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⭐ o tipo é TEXTO LIVRE — a Geração distribuída é o MESMO objeto, outro porte.
  insert into plant.plants (tenant_id, name, capacity_kwp, plant_type)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Telhado do galpão', 8.4, 'geração distribuída — telhado')
  returning id into v_id;
  perform pg_temp.assert86(v_id is not null, '⭐ GD é o mesmo cadastro, plant_type texto livre (nunca enum)');

  begin
    insert into plant.plants (tenant_id, name, capacity_kwp)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Capacidade zero', 0);
    perform pg_temp.assert86(false, 'DEVERIA TER FALHADO: capacidade 0');
  exception when check_violation then
    perform pg_temp.assert86(true, '⭐ capacity_kwp > 0 (uma usina de 0 kWp não é usina)');
  end;

  begin
    insert into plant.plants (tenant_id, name, capacity_kwp)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Capacidade negativa', -5);
    perform pg_temp.assert86(false, 'DEVERIA TER FALHADO: capacidade negativa');
  exception when check_violation then
    perform pg_temp.assert86(true, '⭐ capacidade negativa é infísica');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ active ↔ archived, E ARQUIVAR EXIGE A PERMISSÃO DE DECISÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: arquivar/reativar exige decide; a usina volta a operar ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  -- O Beta (só manage) cria e TENTA arquivar.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into plant.plants (tenant_id, name, capacity_kwp)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Usina Beta', 100)
  returning id into v_id;

  begin
    update plant.plants set status = 'archived' where id = v_id;
    perform pg_temp.assert86(false, 'DEVERIA TER FALHADO: arquivar sem decide');
  exception when insufficient_privilege then
    perform pg_temp.assert86(true, '⭐ arquivar exige plant.plant.decide (o Beta não tem)');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem decide)

  select id into v_id from plant.plants
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Usina Solar Cerrado';

  update plant.plants set status = 'archived' where id = v_id;
  perform pg_temp.assert86((select status = 'archived' from plant.plants where id = v_id),
    'o Alfa (com decide) arquivou a usina');

  update plant.plants set status = 'active' where id = v_id;
  perform pg_temp.assert86((select status = 'active' from plant.plants where id = v_id),
    '⭐ archived → active: a usina volta a operar (a física do catalog/vendor)');
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
    insert into plant.plants (tenant_id, name, capacity_kwp)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasora', 100);
    perform pg_temp.assert86(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert86(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform plant.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'plant.plant.registered', '{}'::jsonb);
    perform pg_temp.assert86(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert86(true, 'plant.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from plant.plants limit 1;
    perform pg_temp.assert86(false, 'DEVERIA TER FALHADO: anon leu plant.plants');
  exception when insufficient_privilege then
    perform pg_temp.assert86(true, '⭐ anon não encosta em plant.plants');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'plant.plant.registered';
  perform pg_temp.assert86(v_n >= 3, 'cada usina registrada emitiu plant.plant.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'plant.plant.archived';
  perform pg_temp.assert86(v_n >= 1, 'o arquivamento emitiu plant.plant.archived');
  select count(*) into v_n from core.event_outbox where event_type = 'plant.plant.reopened';
  perform pg_temp.assert86(v_n >= 1, 'a reativação emitiu plant.plant.reopened');
end $$;

\echo ''
\echo '=== MÓDULO 81 OK: usina isolada, carimbo do servidor, capacity>0, tipo texto livre (GD), active↔archived com decide, anon fora ==='
