-- =============================================================================
-- O MÓDULO EXAM NO BANCO — o pedido → resultado (duas fases): o resultado é ATO
-- IMUTÁVEL apenso (a física do chk), anexá-lo leva o pedido a resulted, e a
-- ⭐⭐ TRILHA DE LEITURA do resultado — results NÃO tem SELECT, a leitura é só
-- por exam.read_result(), que LOGA. DADO SENSÍVEL (LGPD).
-- =============================================================================
--
-- ⭐ Vertical 🏥 Saúde (Onda Vinte e Um, Fase 3). Roda depois de
-- `01_rls_isolation.sql`. Dado 100% fabricado.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert94(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: exam instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'exam', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'exam', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.key, 'exam'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  join (values ('exam.exam.write'), ('exam.exam.read')) as p(key) on true
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'exam.access.read', 'exam'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — PEDIDO → RESULTADO: anexar leva a resulted; result sem SELECT
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: pedido nasce requested; anexar resulta; result sem SELECT direto ==='

do $$
declare v_req uuid; v_pat uuid := gen_random_uuid(); v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into exam.requests (tenant_id, patient_id, patient_name, exam_type)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pat, 'Fulana', 'Hemograma completo')
  returning id, status, requested_by into v_req, v_st, v_by;
  perform pg_temp.assert94(v_st = 'requested', 'o exame nasce como pedido (requested)');
  perform pg_temp.assert94(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ requested_by é quem está autenticado');

  -- Anexar o resultado (⚠️ sem returning: results não tem SELECT).
  insert into exam.results (tenant_id, request_id, result_content)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_req, 'Série vermelha normal. Leucograma sem alterações.');

  -- Anexar levou o pedido a resulted (o gatilho AFTER).
  select status into v_st from exam.requests where id = v_req;
  perform pg_temp.assert94(v_st = 'resulted', '⭐ anexar o resultado leva o pedido a resulted');

  -- ⭐⭐ NÃO HÁ SELECT DIRETO no resultado.
  begin
    perform 1 from exam.results limit 1;
    perform pg_temp.assert94(false, 'DEVERIA TER FALHADO: SELECT direto no resultado');
  exception when insufficient_privilege then
    perform pg_temp.assert94(true, '⭐⭐ resultado sem SELECT direto — a leitura é só pela porta que loga');
  end;

  -- A porta devolve o resultado E loga.
  select count(*) into v_n from exam.read_result('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_req);
  perform pg_temp.assert94(v_n = 1, 'read_result devolve o resultado');
  perform pg_temp.assert94(
    (select count(*) >= 1 from exam.access_log where request_id = v_req),
    '⭐⭐ ler o resultado virou registro em access_log (accountability LGPD)');

  -- Um pedido, um resultado: anexar de novo é recusado.
  begin
    insert into exam.results (tenant_id, request_id, result_content)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_req, 'Segundo resultado');
    perform pg_temp.assert94(false, 'DEVERIA TER FALHADO: segundo resultado no mesmo pedido');
  exception when others then
    perform pg_temp.assert94(true, '⭐ um pedido, um resultado (1:1; e o pedido já não está pendente)');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  select count(*) into v_n from exam.requests;
  perform pg_temp.assert94(v_n = 0, 'o Beta não vê os pedidos do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — CANCELAR (com razão), RESULTADO IMUTÁVEL EM DUAS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: cancelar exige razão; resultado imutável (2 camadas) ==='

do $$
declare v_req uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into exam.requests (tenant_id, patient_id, exam_type)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'Raio-x tórax')
  returning id into v_req;

  begin
    update exam.requests set status = 'cancelled' where id = v_req;
    perform pg_temp.assert94(false, 'DEVERIA TER FALHADO: cancelar sem razão');
  exception when check_violation then
    perform pg_temp.assert94(true, '⭐ cancelar exige razão escrita');
  end;
  update exam.requests set status = 'cancelled', cancel_reason = 'paciente não compareceu' where id = v_req;
  perform pg_temp.assert94((select status = 'cancelled' from exam.requests where id = v_req),
    'cancelar com razão é aceito');

  -- Camada 1: o cliente não tem grant de UPDATE/DELETE em results.
  begin
    update exam.results set result_content = 'reescrito';
    perform pg_temp.assert94(false, 'DEVERIA TER FALHADO: cliente editou o resultado');
  exception when insufficient_privilege then
    perform pg_temp.assert94(true, '⭐ camada 1: o cliente não tem grant de UPDATE no resultado');
  end;
end $$;

do $$
begin
  reset role;  -- dono do banco: sem RLS/grant; só o gatilho fica.
  begin
    update exam.results set result_content = 'reescrito pelo dono';
    perform pg_temp.assert94(false, 'DEVERIA TER FALHADO: o dono reescreveu o resultado');
  exception when insufficient_privilege then
    perform pg_temp.assert94(true, '⭐⭐ camada 2: o gatilho recusa a reescrita até para o dono');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — A TRILHA, A CANETA, ANON, O FATO SEM RESULTADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: trilha só p/ auditoria; emit fechada; anon fora; fato sem laudo ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta (sem access.read)
  perform pg_temp.assert94((select count(*) = 0 from exam.access_log),
    '⭐ sem exam.access.read a trilha não se lê');

  begin
    perform exam.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'exam.request.requested', '{}'::jsonb);
    perform pg_temp.assert94(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert94(true, 'exam.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from exam.requests limit 1;
    perform pg_temp.assert94(false, 'DEVERIA TER FALHADO: anon leu os pedidos');
  exception when insufficient_privilege then
    perform pg_temp.assert94(true, '⭐ anon não encosta nos exames');
  end;
  reset role;
end $$;

do $$
declare v_payload jsonb;
begin
  reset role;
  select payload into v_payload from core.event_outbox
   where event_type = 'exam.request.resulted' limit 1;
  perform pg_temp.assert94(v_payload is not null, 'anexar o resultado emitiu exam.request.resulted');
  perform pg_temp.assert94(not (v_payload ? 'result_content') and not (v_payload ? 'resultContent'),
    '⭐⭐ o resultado NÃO vai no envelope');
end $$;

\echo ''
\echo '=== MÓDULO EXAM OK: pedido→resultado, resultado imutável (2 camadas) 1:1, sem SELECT direto (read_result LOGA), cancelar com razão, laudo fora do envelope ==='
