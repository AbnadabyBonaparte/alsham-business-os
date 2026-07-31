-- =============================================================================
-- O MÓDULO 76 NO BANCO — o controle interno que se isola, o tipo CHECK do COSO,
-- o active ↔ archived (a decisão exige a permissão PRÓPRIA) e ⭐⭐ o LIVRO DE
-- TESTES IMUTÁVEL: cada teste do controle é fato consumado — as DUAS camadas
-- (cliente sem porta → insufficient_privilege; dono barrado pelo gatilho → 'fato
-- consumado').
-- =============================================================================
--
-- ⭐ Domain 🏛 GRC (Onda Dezenove, Fase 3) — capacidade *Controles internos*.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o controle de um tenant não aparece no outro; nasce active; created_by é
--      carimbado pelo servidor; e o control_type fora de preventive/detective/
--      corrective é dado inválido (check_violation);
--   2. ⭐ **active ↔ archived exige `control.control.decide`**: o Beta (só manage)
--      não arquiva (insufficient_privilege); o Alfa (com decide) arquiva e o
--      controle VOLTA (archived → active — a física do vendor);
--   3. ⭐⭐ **o LIVRO DE TESTES é IMUTÁVEL — as DUAS camadas**: como CLIENTE o
--      UPDATE/DELETE falha por insufficient_privilege (não há grant); como DONO
--      (`reset role`) bate no gatilho `fato consumado` (errcode 42501); e o
--      result fora de pass/fail é check_violation;
--   4. cross-tenant é barrado; a caneta de emitir evento não é do cliente; o
--      `anon` não encosta na tabela; e
--   5. os fatos — control.registered, control.archived, control.reopened e
--      test.recorded — chegam no correio.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert81(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: control instalado nos dois tenants ==='

-- ⚠️ O cartão do control ainda NÃO está no seed compartilhado (entra numa frente
-- à parte). Para o FK de tenant_modules fechar no banco efêmero, o teste registra
-- o módulo aqui — espelho fiel do manifesto de @alsham/control.
insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'control', 'Controles Internos', '0.1.0',
  'O cadastro de controles internos (tipo preventive/detective/corrective) + o livro imutável de testes do controle. active ↔ archived.',
  'domain', 'grc',
  '[{"key":"internal-controls","canonicalName":"Controles internos"}]'::jsonb,
  '[{"key":"control.control.manage","moduleId":"control","description":"Gerir controles e registrar testes."},
    {"key":"control.control.decide","moduleId":"control","description":"Arquivar/reativar um controle."}]'::jsonb,
  '[{"type":"control.control.registered","version":1,"description":"Registrado."},
    {"type":"control.control.archived","version":1,"description":"Arquivado."},
    {"type":"control.control.reopened","version":1,"description":"Reativado."},
    {"type":"control.test.recorded","version":1,"description":"Teste registrado."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'control', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'control', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- Os DOIS (Alfa user 1, Beta user 2) têm manage — os dois cadastram e testam.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'control.control.manage', 'control'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ Mas só o Alfa (user 1) tem decide — para provar que arquivar/reativar exige
-- a permissão PRÓPRIA de decisão (a física do fiscalcert).
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'control.control.decide', 'control'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE ATIVO, O SERVIDOR CARIMBA O AUTOR, ISOLA E O TIPO É CHECK
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce active; created_by carimbado; isola; tipo CHECK ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Mente o autor no INSERT. O gatilho descarta e carimba quem está logado.
  insert into control.controls (tenant_id, name, control_type, owner, frequency, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Dupla aprovação de NF acima de X',
          'preventive', 'Financeiro', 'mensal',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert81(v_st = 'active', 'o controle nasce active');
  perform pg_temp.assert81(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  select count(*) into v_n from control.controls;
  perform pg_temp.assert81(v_n = 0, 'o Beta não vê o controle do Alfa');
end $$;

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into control.controls (tenant_id, name, control_type)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Controle torto', 'foo');
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: control_type fora do CHECK do COSO');
  exception when check_violation then
    perform pg_temp.assert81(true, '⭐ control_type é preventive/detective/corrective — "foo" é dado inválido');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ active ↔ archived, E A DECISÃO EXIGE `control.control.decide`
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: arquivar/reativar exige decide; o controle volta ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  -- O Beta (só manage, sem decide) cria e TENTA arquivar.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into control.controls (tenant_id, name, control_type)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Contagem de estoque mensal', 'detective')
  returning id into v_id;

  begin
    update control.controls set status = 'archived' where id = v_id;
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: arquivar sem a permissão decide');
  exception when insufficient_privilege then
    perform pg_temp.assert81(true, '⭐ arquivar exige control.control.decide (o Beta só tem manage)');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem decide)

  select id into v_id from control.controls
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and name = 'Dupla aprovação de NF acima de X';

  update control.controls set status = 'archived' where id = v_id;
  perform pg_temp.assert81((select status = 'archived' from control.controls where id = v_id),
    'o Alfa (com decide) arquivou o controle');

  -- ⭐ E volta: archived → active (o controle descontinuado volta — a física do vendor).
  update control.controls set status = 'active' where id = v_id;
  perform pg_temp.assert81((select status = 'active' from control.controls where id = v_id),
    '⭐ archived → active: o controle volta (a física do vendor)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ O LIVRO DE TESTES É IMUTÁVEL: AS DUAS CAMADAS; result CHECK
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o teste do controle é fato consumado — nem cliente, nem dono ==='

do $$
declare v_cid uuid; v_tid uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_cid from control.controls
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and name = 'Dupla aprovação de NF acima de X';

  -- Um teste do controle: passou.
  insert into control.tests (tenant_id, control_id, tested_on, result, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_cid, '2026-07-31', 'pass', 'amostra de 20 notas conferida')
  returning id into v_tid;

  -- result CHECK: 'maybe' não existe — o teste de controle é binário.
  begin
    insert into control.tests (tenant_id, control_id, tested_on, result)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_cid, '2026-07-31', 'maybe');
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: result fora de pass/fail');
  exception when check_violation then
    perform pg_temp.assert81(true, '⭐ result é pass/fail — "maybe" é dado inválido');
  end;

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE (sem grant): barrado antes mesmo
  -- de o gatilho de imutabilidade rodar.
  begin
    update control.tests set result = 'fail' where id = v_tid;
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: cliente editou um teste');
  exception when insufficient_privilege then
    perform pg_temp.assert81(true, '⭐ CAMADA 1 (UPDATE): o cliente não edita — não há porta de UPDATE');
  end;

  begin
    delete from control.tests where id = v_tid;
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: cliente apagou um teste');
  exception when insufficient_privilege then
    perform pg_temp.assert81(true, '⭐ CAMADA 1 (DELETE): o cliente não apaga — não há porta de DELETE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: com privilégio para escrever, ele
  -- alcança o gatilho, e o gatilho recusa. "Sem porta" × "fato consumado".
  reset role;
  begin
    update control.tests set result = 'fail' where id = v_tid;
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: o dono reescreveu o teste');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert81(v_erro like '%fato consumado%',
      '⭐⭐ CAMADA 2 (UPDATE): nem o dono reescreve — o teste é fato consumado');
  end;

  begin
    delete from control.tests where id = v_tid;
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: o dono apagou o teste');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert81(v_erro like '%fato consumado%',
      '⭐⭐ CAMADA 2 (DELETE): nem o dono apaga — registre outro teste');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT, A CANETA, ANON
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into control.controls (tenant_id, name, control_type)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 'preventive');
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert81(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;

  begin
    perform control.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'control.control.registered', '{}'::jsonb);
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert81(true, 'control.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from control.controls limit 1;
    perform pg_temp.assert81(false, 'DEVERIA TER FALHADO: anon leu control.controls');
  exception when insufficient_privilege then
    perform pg_temp.assert81(true, '⭐ anon não encosta em control.controls');
  end;
  reset role;
end $$;

-- =============================================================================
-- CENÁRIO 5 — OS FATOS SAÍRAM PARA A CAIXA DE SAÍDA DO CORE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: os controles e os testes viraram fato no correio ==='

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'control.control.registered';
  perform pg_temp.assert81(v_n >= 1, 'cada controle cadastrado emitiu control.control.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'control.control.archived';
  perform pg_temp.assert81(v_n >= 1, 'o arquivamento emitiu control.control.archived');
  select count(*) into v_n from core.event_outbox where event_type = 'control.control.reopened';
  perform pg_temp.assert81(v_n >= 1, 'a reativação emitiu control.control.reopened');
  select count(*) into v_n from core.event_outbox where event_type = 'control.test.recorded';
  perform pg_temp.assert81(v_n >= 1, 'cada teste registrado emitiu control.test.recorded');
end $$;

\echo ''
\echo '=== MÓDULO 76 OK: isolado, tipo CHECK do COSO, active↔archived com decide, livro de testes imutável (2 camadas), anon fora ==='
