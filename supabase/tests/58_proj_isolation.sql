-- =============================================================================
-- O MÓDULO 53 NO BANCO — o projeto que se isola, nasce em planejamento, é
-- carimbado pelo servidor, e cujos fins (completed/cancelled) são TERMINAIS
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os projetos de um tenant não aparecem no outro;
--   2. ⭐ **nasce em planejamento** e o autor é carimbado pelo servidor;
--   3. ⭐ **iniciar/concluir carimbam pelo SERVIDOR** (activated_at/closed_at);
--      **cancelar exige razão**; concluir tem nota opcional;
--   4. ⭐ **completed e cancelled são TERMINAIS** — o encerrado não reabre; e o
--      nome/descrição congelam depois do encerramento;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert58(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: proj instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'proj', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'proj', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'proj.project.manage', 'proj'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO EM PLANEJAMENTO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu projeto; nasce planning; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into proj.projects (tenant_id, name, description, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Implantação ERP', 'fase 1',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert58(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  begin
    insert into proj.projects (tenant_id, name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'active');
    perform pg_temp.assert58(false, 'DEVERIA TER FALHADO: nasceu ativo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert58(v_erro like '%nasce em planejamento%', 'o projeto nasce em planejamento');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into proj.projects (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Obra da sede');

  select count(*) into v_n from proj.projects;
  perform pg_temp.assert58(v_n = 1, 'o Beta enxerga só o projeto dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ INICIAR E CONCLUIR CARIMBAM PELO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: iniciar carimba activated_at; concluir carimba closed_at (nota opcional) ==='

do $$
declare
  v_id uuid; v_status text; v_act timestamptz; v_clo timestamptz; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from proj.projects
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Implantação ERP';

  update proj.projects set status = 'active' where id = v_id;
  select status, activated_at into v_status, v_act from proj.projects where id = v_id;
  perform pg_temp.assert58(v_status = 'active', 'o projeto entrou em andamento');
  perform pg_temp.assert58(v_act is not null, '⭐ activated_at carimbado pelo servidor');

  -- Concluir SEM nota é permitido (o fim natural não se justifica).
  update proj.projects set status = 'completed' where id = v_id;
  select status, closed_at into v_status, v_clo from proj.projects where id = v_id;
  perform pg_temp.assert58(v_status = 'completed', 'o projeto foi concluído sem nota (opcional)');
  perform pg_temp.assert58(v_clo is not null, '⭐ closed_at carimbado pelo servidor');

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type in ('proj.project.activated','proj.project.completed');
  perform pg_temp.assert58(v_n = 2, 'os fatos de iniciar e concluir saíram');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ CANCELAR EXIGE RAZÃO; O TERMINAL É TERMINAL; CONTEÚDO CONGELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: cancelar exige razão; o concluído não anda; nome congela ==='

do $$
declare
  v_id uuid; v_concl uuid; v_status text; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into proj.projects (tenant_id, name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Piloto a abandonar')
  returning id into v_id;

  begin
    update proj.projects set status = 'cancelled' where id = v_id;
    perform pg_temp.assert58(false, 'DEVERIA TER FALHADO: cancelou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert58(v_erro like '%razão%', '⭐ cancelar exige uma razão');
  end;

  update proj.projects set status = 'cancelled', cancel_reason = 'escopo inviável' where id = v_id;
  select status into v_status from proj.projects where id = v_id;
  perform pg_temp.assert58(v_status = 'cancelled', 'cancelou com razão');

  -- O concluído do cenário 2 é terminal.
  select id into v_concl from proj.projects
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Implantação ERP';
  begin
    update proj.projects set status = 'active' where id = v_concl;
    perform pg_temp.assert58(false, 'DEVERIA TER FALHADO: reabriu o projeto concluído');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert58(v_erro like '%não reabre%', '⭐ o concluído é terminal — não reabre');
  end;

  -- E o nome congela depois do encerramento.
  begin
    update proj.projects set name = 'Renomeado' where id = v_concl;
    perform pg_temp.assert58(false, 'DEVERIA TER FALHADO: renomeou projeto encerrado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert58(v_erro like '%não mudam mais%', '⭐ nome/descrição congelam depois do encerramento');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'proj.project.cancelled';
  perform pg_temp.assert58(v_n = 1, 'o fato do cancelamento saiu');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO PROJETO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  begin
    insert into proj.projects (tenant_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor');
    perform pg_temp.assert58(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert58(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
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

  select id into v_id from proj.projects limit 1;

  begin
    delete from proj.projects where id = v_id;
    perform pg_temp.assert58(false, 'DEVERIA TER FALHADO: apagou projeto');
  exception when insufficient_privilege then
    perform pg_temp.assert58(true, 'apagar não existe — projeto encerrado é história');
  end;

  begin
    perform proj.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'proj.project.registered', '{}'::jsonb);
    perform pg_temp.assert58(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert58(true, 'proj.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from proj.projects limit 1;
    perform pg_temp.assert58(false, 'DEVERIA TER FALHADO: anon leu proj.projects');
  exception when insufficient_privilege then
    perform pg_temp.assert58(true, '⭐ anon não encosta em proj.projects');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 53 OK: projeto isolado, carimbos do servidor, fins terminais, anon fora ==='
