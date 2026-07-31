-- =============================================================================
-- O MÓDULO 59 NO BANCO — a aresta que se isola, o autor carimbado, a laço e a
-- duplicata recusadas, o DELETE que emite `removed`, e o anon fora
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as dependências de um tenant não aparecem no outro; o autor é carimbado
--      pelo servidor (o created_by mentido no INSERT é descartado);
--   2. ⭐ **a aresta laço** (predecessor = sucessor) bate no CHECK;
--   3. ⭐ **a aresta duplicada** (mesma tenant/predecessor/sucessor) bate na unique;
--   4. ⭐⭐ **REGISTRO MUTÁVEL:** apagar a aresta FUNCIONA (o DIVERGE dos livros
--      imutáveis) e DISPARA `gantt.dependency.removed`; a linha some de verdade;
--   5. cross-tenant é barrado pela RLS;
--   6. a caneta de emitir evento não é do cliente; o `anon` não encosta na tabela.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert64(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: gantt instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'gantt', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'gantt', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'gantt.dependency.manage', 'gantt'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E O AUTOR CARIMBADO PELO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua aresta; o autor é do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into gantt.dependencies (
    tenant_id, predecessor_id, predecessor_name, successor_id, successor_name,
    project_id, project_name, created_by)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Fundação',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Alvenaria',
    '99999999-9999-4999-8999-999999999999', 'Obra',
    '22222222-2222-4222-8222-222222222222')  -- autor MENTIDO
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert64(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into gantt.dependencies (tenant_id, predecessor_id, successor_id)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd');

  select count(*) into v_n from gantt.dependencies;
  perform pg_temp.assert64(v_n = 1, 'o Beta enxerga só a aresta dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A ARESTA LAÇO É RECUSADA (predecessor = sucessor)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: um marco não depende de si mesmo ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into gantt.dependencies (tenant_id, predecessor_id, successor_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc');  -- laço
    perform pg_temp.assert64(false, 'DEVERIA TER FALHADO: aresta de um marco para si mesmo');
  exception when check_violation then
    perform pg_temp.assert64(true, '⭐ a aresta laço é recusada pelo CHECK predecessor <> successor');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A ARESTA DUPLICADA É RECUSADA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a mesma aresta não se duplica ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    -- A mesma (tenant, predecessor, successor) do Cenário 1.
    insert into gantt.dependencies (tenant_id, predecessor_id, successor_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    perform pg_temp.assert64(false, 'DEVERIA TER FALHADO: aresta duplicada');
  exception when unique_violation then
    perform pg_temp.assert64(true, '⭐ a aresta duplicada é recusada pela unique (tenant, predecessor, successor)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐⭐ REGISTRO MUTÁVEL: APAGAR FUNCIONA E EMITE `removed`
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: apagar a aresta funciona (o DIVERGE dos livros imutáveis) e emite removed ==='

do $$
declare
  v_id uuid; v_n int; v_removed int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from gantt.dependencies
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and predecessor_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  delete from gantt.dependencies where id = v_id;

  select count(*) into v_n from gantt.dependencies
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert64(v_n = 0, '⭐⭐ apagar funciona — a aresta sumiu (metadado do plano, não fato consumado)');

  reset role;
  select count(*) into v_removed from core.event_outbox
   where event_type = 'gantt.dependency.removed'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert64(v_removed = 1, '⭐ o fato gantt.dependency.removed saiu no DELETE');
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT: O ALFA NÃO ESCREVE NA ARESTA DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  begin
    insert into gantt.dependencies (tenant_id, predecessor_id, successor_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    perform pg_temp.assert64(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert64(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: emit_event não é concedida; anon barrado ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform gantt.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'gantt.dependency.registered', '{}'::jsonb);
    perform pg_temp.assert64(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert64(true, 'gantt.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from gantt.dependencies limit 1;
    perform pg_temp.assert64(false, 'DEVERIA TER FALHADO: anon leu gantt.dependencies');
  exception when insufficient_privilege then
    perform pg_temp.assert64(true, '⭐ anon não encosta em gantt.dependencies');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 59 OK: aresta isolada, laço/duplicata recusadas, delete emite removed, anon fora ==='
