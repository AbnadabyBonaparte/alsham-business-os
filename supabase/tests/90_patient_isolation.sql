-- =============================================================================
-- O MÓDULO PATIENT NO BANCO — o cadastro demográfico que se isola: nasce active,
-- o servidor carimba o autor, nº de prontuário/plano é TEXTO LIVRE, e o
-- active ↔ archived exige a permissão PRÓPRIA de decisão (o paciente volta — a
-- física do crm/catalog). Vala PRÓPRIA: não é o crm.
-- =============================================================================
--
-- ⭐ Vertical 🏥 Saúde (Onda Vinte e Um, Fase 3). Roda depois de
-- `01_rls_isolation.sql`. Dado 100% fabricado. Zero nome de cliente real.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert90(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: patient instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'patient', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'patient', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- Os dois admins têm manage; só o Alfa tem decide — para provar que arquivar
-- exige a permissão PRÓPRIA.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'patient.patient.manage', 'patient'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'patient.patient.decide', 'patient'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE ACTIVE, O SERVIDOR CARIMBA O AUTOR, ISOLA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce active; created_by do servidor; nº/plano texto livre; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into patient.patients (tenant_id, name, record_number, birth_date, health_plan, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fulana de Tal', 'PRT-0001', date '1980-05-10',
          'particular', '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert90(v_st = 'active', 'o paciente nasce active');
  perform pg_temp.assert90(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  -- nº de prontuário e plano são TEXTO LIVRE (e opcionais): um paciente sem eles é honesto.
  insert into patient.patients (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Sem prontuário nem plano');
  perform pg_temp.assert90(true, '⭐ nº de prontuário e plano são texto livre e opcionais');

  -- SABOTAGEM: nascer arquivado é recusado (o nascimento é do gatilho).
  begin
    insert into patient.patients (tenant_id, name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce errado', 'archived');
    perform pg_temp.assert90(false, 'DEVERIA TER FALHADO: paciente nascendo arquivado');
  exception when others then
    perform pg_temp.assert90(true, '⭐ o paciente não nasce arquivado — o nascimento é do gatilho');
  end;

  -- SABOTAGEM: nome vazio é recusado.
  begin
    insert into patient.patients (tenant_id, name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '   ');
    perform pg_temp.assert90(false, 'DEVERIA TER FALHADO: nome vazio');
  exception when check_violation then
    perform pg_temp.assert90(true, 'nome não vazio');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  select count(*) into v_n from patient.patients;
  perform pg_temp.assert90(v_n = 0, 'o Beta não vê os pacientes do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ active ↔ archived, E ARQUIVAR EXIGE A PERMISSÃO DE DECISÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: arquivar/reativar exige decide; o paciente volta ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  -- O Beta (só manage) cria e TENTA arquivar.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into patient.patients (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Paciente Beta')
  returning id into v_id;

  begin
    update patient.patients set status = 'archived' where id = v_id;
    perform pg_temp.assert90(false, 'DEVERIA TER FALHADO: arquivar sem decide');
  exception when insufficient_privilege then
    perform pg_temp.assert90(true, '⭐ arquivar exige patient.patient.decide (o Beta não tem)');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem decide)

  select id into v_id from patient.patients
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Fulana de Tal';

  update patient.patients set status = 'archived' where id = v_id;
  perform pg_temp.assert90((select status = 'archived' from patient.patients where id = v_id),
    'o Alfa (com decide) arquivou o paciente');

  update patient.patients set status = 'active' where id = v_id;
  perform pg_temp.assert90((select status = 'active' from patient.patients where id = v_id),
    '⭐ archived → active: o paciente que volta é o MESMO (a física do crm/catalog)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — CROSS-TENANT, A CANETA (emit_event), ANON, E OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: cross-tenant barrado; emit_event fechada; anon fora; fatos ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into patient.patients (tenant_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor');
    perform pg_temp.assert90(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert90(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform patient.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'patient.patient.registered', '{}'::jsonb);
    perform pg_temp.assert90(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert90(true, 'patient.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from patient.patients limit 1;
    perform pg_temp.assert90(false, 'DEVERIA TER FALHADO: anon leu patient.patients');
  exception when insufficient_privilege then
    perform pg_temp.assert90(true, '⭐ anon não encosta em patient.patients');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'patient.patient.registered';
  perform pg_temp.assert90(v_n >= 2, 'cada paciente cadastrado emitiu patient.patient.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'patient.patient.archived';
  perform pg_temp.assert90(v_n >= 1, 'o arquivamento emitiu patient.patient.archived');
  select count(*) into v_n from core.event_outbox where event_type = 'patient.patient.reactivated';
  perform pg_temp.assert90(v_n >= 1, 'a reativação emitiu patient.patient.reactivated');
end $$;

\echo ''
\echo '=== MÓDULO PATIENT OK: cadastro isolado (não o crm), carimbo do servidor, nº/plano texto livre, active↔archived com decide, anon fora ==='
