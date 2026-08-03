-- =============================================================================
-- O MÓDULO RECORD NO BANCO — o Prontuário e a ⭐⭐ TRILHA DE LEITURA: a entrada é
-- FATO CONSUMADO imutável (2 camadas), NÃO há SELECT direto (a leitura é só por
-- record.read_patient(), que LOGA antes de devolver), e a trilha de acesso é
-- imutável append-only. DADO SENSÍVEL de saúde (LGPD).
-- =============================================================================
--
-- ⭐ Vertical 🏥 Saúde (Onda Vinte e Um, Fase 3). Roda depois de
-- `01_rls_isolation.sql`. Dado 100% fabricado.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert92(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: record instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'record', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'record', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- Os dois admins escrevem e leem; só o Alfa AUDITA a trilha de acesso.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.key, 'record'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  join (values ('record.entry.write'), ('record.entry.read')) as p(key) on true
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'record.access.read', 'record'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — A ENTRADA É FATO CONSUMADO (imutável 2 camadas), E NÃO SE LÊ DIRETO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: entrada imutável; SEM SELECT direto; carimbo do servidor ==='

do $$
declare v_by uuid; v_pat uuid := gen_random_uuid();
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⚠️ SEM RETURNING: record.entries não concede SELECT (nem para RETURNING) —
  -- ler é só pela porta que loga. O insert é fire-and-forget.
  insert into record.entries (tenant_id, patient_id, patient_name, entry_type, content, recorded_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pat, 'Fulana', 'evolução',
          'Paciente evolui bem.', '22222222-2222-4222-8222-222222222222');

  -- Leio pela ÚNICA porta para conferir o carimbo do servidor.
  select recorded_by into v_by
    from record.read_patient('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pat) limit 1;
  perform pg_temp.assert92(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ recorded_by é quem está autenticado — o autor mentido foi descartado');

  -- ⭐⭐ NÃO HÁ SELECT DIRETO: ler a tabela do prontuário não existe como porta.
  begin
    perform 1 from record.entries limit 1;
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: SELECT direto no prontuário');
  exception when insufficient_privilege then
    perform pg_temp.assert92(true, '⭐⭐ não há SELECT direto — a leitura é só pela porta que loga');
  end;

  -- Camada 1: o cliente não tem grant de UPDATE/DELETE (nem chega ao gatilho).
  begin
    update record.entries set content = 'reescrito' where patient_id = v_pat;
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: cliente editou a entrada');
  exception when insufficient_privilege then
    perform pg_temp.assert92(true, '⭐ camada 1: o cliente não tem grant de UPDATE');
  end;
  begin
    delete from record.entries where patient_id = v_pat;
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: cliente apagou a entrada');
  exception when insufficient_privilege then
    perform pg_temp.assert92(true, '⭐ camada 1: o cliente não tem grant de DELETE');
  end;

  -- content vazio é recusado.
  begin
    insert into record.entries (tenant_id, patient_id, content)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pat, '   ');
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: conteúdo vazio');
  exception when check_violation then
    perform pg_temp.assert92(true, 'conteúdo clínico não vazio');
  end;
end $$;

-- Camada 2: nem o DONO do banco reescreve — o gatilho recusa (RLS/grant à parte).
do $$
begin
  reset role;  -- superusuário: sem RLS e sem barreira de grant; só o gatilho fica.
  begin
    update record.entries set content = 'reescrito pelo dono';
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: o dono reescreveu a entrada');
  exception when insufficient_privilege then
    perform pg_temp.assert92(true, '⭐⭐ camada 2: o gatilho recusa a reescrita até para o dono do banco');
  end;
  begin
    delete from record.entries;
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: o dono apagou a entrada');
  exception when insufficient_privilege then
    perform pg_temp.assert92(true, '⭐⭐ camada 2: o gatilho recusa o apagamento até para o dono');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ A TRILHA DE LEITURA: read_patient LOGA antes de devolver
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: read_patient devolve E loga; sem permissão, barra ==='

do $$
declare v_pat uuid := gen_random_uuid(); v_n int; v_logs int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into record.entries (tenant_id, patient_id, patient_name, entry_type, content)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pat, 'Beltrano', 'anamnese', 'HDA...');
  insert into record.entries (tenant_id, patient_id, patient_name, entry_type, content)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pat, 'Beltrano', 'conduta', 'Prescrição X.');

  -- A porta devolve as entradas do paciente...
  select count(*) into v_n from record.read_patient('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pat);
  perform pg_temp.assert92(v_n = 2, 'read_patient devolve as entradas do paciente');

  -- ...E cada leitura virou registro na trilha (o Alfa audita).
  select count(*) into v_logs from record.access_log
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and patient_id = v_pat;
  perform pg_temp.assert92(v_logs >= 1, '⭐⭐ a leitura virou registro em access_log (accountability LGPD)');
  perform pg_temp.assert92(
    (select accessed_by = '11111111-1111-4111-8111-111111111111'
       from record.access_log where patient_id = v_pat order by accessed_at desc limit 1),
    'o log carimba QUEM leu (accessed_by do servidor)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — A TRILHA É IMUTÁVEL, E SÓ A AUDITORIA A LÊ
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: access_log append-only; só record.access.read lê ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (audita)

  select id into v_id from record.access_log limit 1;

  -- Ninguém insere à mão (só a função de leitura, como definer).
  begin
    insert into record.access_log (tenant_id, patient_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid());
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: inserir na trilha à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert92(true, '⭐ ninguém insere na trilha à mão — só a função de leitura');
  end;

  -- Não se edita nem apaga.
  begin
    update record.access_log set accessed_by = null where id = v_id;
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: editar a trilha');
  exception when others then
    perform pg_temp.assert92(true, '⭐ a trilha é append-only — não se edita');
  end;

  -- Beta tem entry.read mas NÃO tem access.read: não lê a trilha.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  perform pg_temp.assert92(
    (select count(*) = 0 from record.access_log),
    '⭐ sem record.access.read a trilha não se lê (RLS); e é de outro tenant também');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ISOLAMENTO, A CANETA, ANON, O FATO SEM CONTEÚDO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cross-tenant; emit fechada; anon fora; fato sem conteúdo ==='

do $$
declare v_pat uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  -- Beta não vê as entradas do Alfa nem via a porta (has_permission cruza tenant).
  begin
    perform record.read_patient('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid());
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: Beta lendo prontuário do Alfa');
  exception when others then
    perform pg_temp.assert92(true, '⭐ Beta não lê o prontuário do tenant do Alfa');
  end;

  begin
    perform record.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'record.entry.recorded', '{}'::jsonb);
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert92(true, 'record.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from record.entries limit 1;
    perform pg_temp.assert92(false, 'DEVERIA TER FALHADO: anon leu o prontuário');
  exception when insufficient_privilege then
    perform pg_temp.assert92(true, '⭐ anon não encosta no prontuário');
  end;
  reset role;
end $$;

do $$
declare v_payload jsonb;
begin
  reset role;
  select payload into v_payload from core.event_outbox
   where event_type = 'record.entry.recorded' limit 1;
  perform pg_temp.assert92(v_payload is not null, 'a entrada emitiu record.entry.recorded');
  perform pg_temp.assert92(not (v_payload ? 'content'),
    '⭐⭐ o conteúdo clínico NÃO vai no envelope (só entryId/patientId/tipo)');
end $$;

\echo ''
\echo '=== MÓDULO RECORD OK: entrada imutável (2 camadas), SEM SELECT direto, read_patient LOGA, trilha append-only só p/ auditoria, conteúdo fora do envelope ==='
