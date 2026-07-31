-- =============================================================================
-- O MÓDULO 58 NO BANCO — o sprint que se isola, o UM-ATIVO-POR-PROJETO na
-- constraint, os carimbos do servidor e o closed TERMINAL
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os sprints de um tenant não aparecem no outro;
--   2. ⭐ **nasce planejado** e o autor é carimbado pelo servidor;
--   3. ⭐⭐ **UM sprint ativo por projeto** — o segundo `active` do MESMO projeto
--      bate no índice único parcial; o de OUTRO projeto passa;
--   4. ⭐ **closed carimba pelo servidor e é TERMINAL** — não reabre; e o
--      conteúdo (nome/objetivo/janela) congela depois de encerrar;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert63(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: scrum instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'scrum', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'scrum', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'scrum.sprint.manage', 'scrum'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO PLANEJADO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu sprint; nasce planned; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into scrum.sprints (tenant_id, project_id, project_name, name, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'Obra', 'Sprint 1',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert63(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  begin
    insert into scrum.sprints (tenant_id, project_id, name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Nasce Errado', 'active');
    perform pg_temp.assert63(false, 'DEVERIA TER FALHADO: nasceu ativo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert63(v_erro like '%nasce planejado%', 'o sprint nasce planejado');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into scrum.sprints (tenant_id, project_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Sprint do Beta');

  select count(*) into v_n from scrum.sprints;
  perform pg_temp.assert63(v_n = 1, 'o Beta enxerga só o sprint dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ UM SPRINT ATIVO POR PROJETO (a constraint)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: um projeto tem no máximo um sprint active ==='

do $$
declare
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_act timestamptz; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_s1 from scrum.sprints
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Sprint 1';

  update scrum.sprints set status = 'active' where id = v_s1;
  select activated_at into v_act from scrum.sprints where id = v_s1;
  perform pg_temp.assert63(v_act is not null, '⭐ activated_at carimbado pelo servidor');

  -- Um SEGUNDO sprint do MESMO projeto tentando ativar: barrado pela constraint.
  insert into scrum.sprints (tenant_id, project_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Sprint 2')
  returning id into v_s2;
  begin
    update scrum.sprints set status = 'active' where id = v_s2;
    perform pg_temp.assert63(false, 'DEVERIA TER FALHADO: dois sprints ativos no mesmo projeto');
  exception when unique_violation then
    perform pg_temp.assert63(true, '⭐⭐ um projeto tem no máximo um sprint ativo (constraint)');
  end;

  -- Um sprint de OUTRO projeto pode estar ativo ao mesmo tempo.
  insert into scrum.sprints (tenant_id, project_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Sprint de outro projeto')
  returning id into v_s3;
  update scrum.sprints set status = 'active' where id = v_s3;
  perform pg_temp.assert63(
    (select status from scrum.sprints where id = v_s3) = 'active',
    '⭐ outro projeto pode ter o seu próprio sprint ativo');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'scrum.sprint.activated';
  perform pg_temp.assert63(v_n = 2, 'os dois fatos de ativação saíram');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ CLOSED CARIMBA, É TERMINAL, E CONGELA O CONTEÚDO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: encerrar carimba closed_at; o encerrado não reabre; conteúdo congela ==='

do $$
declare
  v_id uuid; v_clo timestamptz; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from scrum.sprints
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Sprint 1';

  update scrum.sprints set status = 'closed' where id = v_id;
  select closed_at into v_clo from scrum.sprints where id = v_id;
  perform pg_temp.assert63(v_clo is not null, '⭐ closed_at carimbado pelo servidor');

  begin
    update scrum.sprints set status = 'active' where id = v_id;
    perform pg_temp.assert63(false, 'DEVERIA TER FALHADO: reabriu o sprint encerrado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert63(v_erro like '%não reabre%', '⭐ closed é terminal — não reabre');
  end;

  begin
    update scrum.sprints set name = 'Renomeado' where id = v_id;
    perform pg_temp.assert63(false, 'DEVERIA TER FALHADO: renomeou sprint encerrado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert63(v_erro like '%não mudam mais%', '⭐ nome/objetivo/janela congelam depois de encerrar');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'scrum.sprint.closed';
  perform pg_temp.assert63(v_n = 1, 'o fato de encerramento saiu');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO SPRINT DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  begin
    insert into scrum.sprints (tenant_id, project_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Invasor');
    perform pg_temp.assert63(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert63(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from scrum.sprints limit 1;

  begin
    delete from scrum.sprints where id = v_id;
    perform pg_temp.assert63(false, 'DEVERIA TER FALHADO: apagou sprint');
  exception when insufficient_privilege then
    perform pg_temp.assert63(true, 'apagar não existe — sprint encerrado é história');
  end;

  begin
    perform scrum.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'scrum.sprint.registered', '{}'::jsonb);
    perform pg_temp.assert63(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert63(true, 'scrum.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from scrum.sprints limit 1;
    perform pg_temp.assert63(false, 'DEVERIA TER FALHADO: anon leu scrum.sprints');
  exception when insufficient_privilege then
    perform pg_temp.assert63(true, '⭐ anon não encosta em scrum.sprints');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 58 OK: sprint isolado, um ativo por projeto, closed terminal, anon fora ==='
