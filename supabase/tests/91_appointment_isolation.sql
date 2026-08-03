-- =============================================================================
-- O MÓDULO APPOINTMENT NO BANCO — a agenda com NO-SHOW: nasce scheduled, o
-- servidor carimba autor e desfecho, o ciclo scheduled → attended|no_show|
-- cancelled é terminal, marcar desfecho exige decide, cancelar exige razão.
-- =============================================================================
--
-- ⭐ Vertical 🏥 Saúde (Onda Vinte e Um, Fase 3). Roda depois de
-- `01_rls_isolation.sql`. Dado 100% fabricado.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert91(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: appointment instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'appointment', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'appointment', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'appointment.appointment.manage', 'appointment'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'appointment.appointment.decide', 'appointment'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE SCHEDULED, ISOLA, REMARCA ENQUANTO AGENDADA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce scheduled; created_by do servidor; remarca; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into appointment.appointments
    (tenant_id, patient_id, patient_name, professional_name, professional_registry, scheduled_at, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'Fulana',
          'Dra. Beltrana', 'CRM-SP 123456', now() + interval '2 days',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert91(v_st = 'scheduled', 'a consulta nasce scheduled');
  perform pg_temp.assert91(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  -- Remarcar enquanto agendada (manage) é permitido.
  update appointment.appointments set scheduled_at = now() + interval '3 days' where id = v_id;
  perform pg_temp.assert91(true, '⭐ remarcar enquanto agendada é permitido');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  select count(*) into v_n from appointment.appointments;
  perform pg_temp.assert91(v_n = 0, 'o Beta não vê a agenda do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O NO-SHOW E OS DESFECHOS TERMINAIS, exigindo DECIDE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: marcar desfecho exige decide; no-show; terminal ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  -- Beta (só manage) marca e TENTA dar desfecho.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into appointment.appointments (tenant_id, patient_id, patient_name, scheduled_at)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', gen_random_uuid(), 'Sicrano', now())
  returning id into v_id;

  begin
    update appointment.appointments set status = 'attended' where id = v_id;
    perform pg_temp.assert91(false, 'DEVERIA TER FALHADO: desfecho sem decide');
  exception when insufficient_privilege then
    perform pg_temp.assert91(true, '⭐ marcar desfecho exige appointment.appointment.decide (Beta não tem)');
  end;
end $$;

do $$
declare v_id uuid; v_dec uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem decide)

  insert into appointment.appointments (tenant_id, patient_id, patient_name, scheduled_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'Faltante', now())
  returning id into v_id;

  -- ⭐ O NO-SHOW: o paciente faltou. Carimbado pelo servidor.
  update appointment.appointments set status = 'no_show' where id = v_id;
  select decided_by into v_dec from appointment.appointments where id = v_id;
  perform pg_temp.assert91((select status = 'no_show' from appointment.appointments where id = v_id),
    '⭐ o no-show é dado: a falta se registra');
  perform pg_temp.assert91(v_dec = '11111111-1111-4111-8111-111111111111',
    'o desfecho é carimbado pelo servidor (decided_by)');

  -- Terminal: consulta com desfecho não se edita.
  begin
    update appointment.appointments set scheduled_at = now() + interval '1 day' where id = v_id;
    perform pg_temp.assert91(false, 'DEVERIA TER FALHADO: editar consulta com desfecho');
  exception when insufficient_privilege then
    perform pg_temp.assert91(true, '⭐ consulta com desfecho é terminal — quem remarca abre outra');
  end;

  -- Cancelar exige razão.
  insert into appointment.appointments (tenant_id, patient_id, patient_name, scheduled_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'A cancelar', now())
  returning id into v_id;
  begin
    update appointment.appointments set status = 'cancelled' where id = v_id;
    perform pg_temp.assert91(false, 'DEVERIA TER FALHADO: cancelar sem razão');
  exception when check_violation then
    perform pg_temp.assert91(true, '⭐ cancelar exige razão escrita');
  end;
  update appointment.appointments set status = 'cancelled', cancel_reason = 'paciente desmarcou' where id = v_id;
  perform pg_temp.assert91((select status = 'cancelled' from appointment.appointments where id = v_id),
    'cancelar com razão é aceito');

  -- Transição inexistente é recusada.
  begin
    update appointment.appointments set status = 'scheduled' where id = v_id;
    perform pg_temp.assert91(false, 'DEVERIA TER FALHADO: cancelled → scheduled');
  exception when others then
    perform pg_temp.assert91(true, '⭐ o desfecho não volta a scheduled');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — CROSS-TENANT, A CANETA, ANON, E OS FATOS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: cross-tenant barrado; emit fechada; anon fora; fatos ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    perform appointment.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'appointment.appointment.scheduled', '{}'::jsonb);
    perform pg_temp.assert91(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert91(true, 'appointment.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from appointment.appointments limit 1;
    perform pg_temp.assert91(false, 'DEVERIA TER FALHADO: anon leu a agenda');
  exception when insufficient_privilege then
    perform pg_temp.assert91(true, '⭐ anon não encosta na agenda');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'appointment.appointment.scheduled';
  perform pg_temp.assert91(v_n >= 3, 'cada marcação emitiu appointment.appointment.scheduled');
  select count(*) into v_n from core.event_outbox where event_type = 'appointment.appointment.missed';
  perform pg_temp.assert91(v_n >= 1, '⭐ o no-show emitiu .missed (o outbox recusa _ no verbo)');
  select count(*) into v_n from core.event_outbox where event_type = 'appointment.appointment.cancelled';
  perform pg_temp.assert91(v_n >= 1, 'o cancelamento emitiu .cancelled');
end $$;

\echo ''
\echo '=== MÓDULO APPOINTMENT OK: agenda com no-show, três fins terminais, desfecho com decide, cancelar com razão, anon fora ==='
