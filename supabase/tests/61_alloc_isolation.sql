-- =============================================================================
-- O MÓDULO 56 NO BANCO — a alocação que se isola, o percentual que a régua
-- recusa fora de (0,100], a alocação que volta do arquivo (com permissão própria)
-- e o autor carimbado pelo servidor
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as alocações de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta CADASTRA mas não ARQUIVA; nasce ativa; o autor
--      mentido no INSERT é descartado; e o percentual fora de (0,100] é recusado
--      pela CONSTRAINT (pct=150);
--   2. ⭐ **active ↔ archived** — a alocação VOLTA do arquivo (o REUSO do vendor/dc);
--   3. ⭐ **arquivar/reativar exige alloc.allocation.decide** — o Beta é barrado;
--   4. cross-tenant é barrado pela RLS;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta na tabela.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert61(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: alloc instalado; Alfa decide, Beta só cadastra ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alloc', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'alloc', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'alloc.allocation.manage', 'alloc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ ASSIMETRIA: só o Alfa arquiva/reativa. O Beta cadastra e edita, não decide.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'alloc.allocation.decide', 'alloc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cadastram; só o Alfa arquiva/reativa.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, NASCIMENTO ATIVO, AUTOR CARIMBADO, RÉGUA DO PERCENTUAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu plano; nasce ativa; autor do servidor; pct em (0,100] ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT: diz que foi o Beta. O gatilho descarta. Projeto
  -- e colaborador entram por id solto (nunca FK).
  insert into alloc.allocations
    (tenant_id, project_id, project_name, resource_name, employee_id, allocation_pct, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Obra Central', 'Ana Freelancer',
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 40,
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert61(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  -- ⭐ A régua do percentual: pct=150 é recusado pela CONSTRAINT.
  begin
    insert into alloc.allocations
      (tenant_id, project_id, resource_name, allocation_pct)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Excesso', 150);
    perform pg_temp.assert61(false, 'DEVERIA TER FALHADO: percentual acima de 100');
  exception when check_violation then
    perform pg_temp.assert61(true, '⭐ pct=150 recusado — o percentual mora em (0, 100]');
  end;

  begin
    insert into alloc.allocations
      (tenant_id, project_id, resource_name, allocation_pct, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Nasce Errada', 50, 'archived');
    perform pg_temp.assert61(false, 'DEVERIA TER FALHADO: nasceu arquivada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert61(v_erro like '%nasce ativa%', 'a alocação nasce ativa');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into alloc.allocations
    (tenant_id, project_id, resource_name, allocation_pct)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Recurso Solo B', 25);

  select count(*) into v_n from alloc.allocations;
  perform pg_temp.assert61(v_n = 1, 'o Beta enxerga só o plano dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ active ↔ archived: A ALOCAÇÃO VOLTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: arquivar e reativar — o mesmo registro (o REUSO do vendor/dc) ==='

do $$
declare
  v_id uuid; v_status text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from alloc.allocations
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and resource_name = 'Ana Freelancer';

  update alloc.allocations set status = 'archived' where id = v_id;
  select status into v_status from alloc.allocations where id = v_id;
  perform pg_temp.assert61(v_status = 'archived', 'arquivou');

  update alloc.allocations set status = 'active' where id = v_id;
  select status into v_status from alloc.allocations where id = v_id;
  perform pg_temp.assert61(v_status = 'active', '⭐ a alocação VOLTA do arquivo — a mesma linha de planejamento');

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type in ('alloc.allocation.archived','alloc.allocation.reopened');
  perform pg_temp.assert61(v_n = 2, 'os fatos de arquivar e reativar saíram');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ ARQUIVAR/REATIVAR EXIGE alloc.allocation.decide: O BETA É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o Beta cadastra e edita, mas não arquiva ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from alloc.allocations
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and resource_name = 'Recurso Solo B';

  -- Editar dados o Beta consegue (manage). O percentual é dado, não decisão.
  update alloc.allocations set allocation_pct = 30 where id = v_id;
  perform pg_temp.assert61(true, 'o Beta edita — manage basta; o percentual é dado');

  begin
    update alloc.allocations set status = 'archived' where id = v_id;
    perform pg_temp.assert61(false, 'DEVERIA TER FALHADO: o Beta arquivou sem decide');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert61(v_erro like '%alloc.allocation.decide%', '⭐ arquivar exige alloc.allocation.decide');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO PLANO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
declare
  v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into alloc.allocations
      (tenant_id, project_id, resource_name, allocation_pct)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Invasor', 10);
    perform pg_temp.assert61(false, 'DEVERIA TER FALHADO: o Alfa escreveu no plano do Beta');
  exception when others then
    perform pg_temp.assert61(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
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

  select id into v_id from alloc.allocations limit 1;

  begin
    delete from alloc.allocations where id = v_id;
    perform pg_temp.assert61(false, 'DEVERIA TER FALHADO: apagou alocação');
  exception when insufficient_privilege then
    perform pg_temp.assert61(true, 'apagar não existe — arquivar é status');
  end;

  begin
    perform alloc.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alloc.allocation.registered', '{}'::jsonb);
    perform pg_temp.assert61(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert61(true, 'alloc.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from alloc.allocations limit 1;
    perform pg_temp.assert61(false, 'DEVERIA TER FALHADO: anon leu alloc.allocations');
  exception when insufficient_privilege then
    perform pg_temp.assert61(true, '⭐ anon não encosta em alloc.allocations');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 56 OK: plano isolado, régua do percentual, alocação que volta, autor do servidor, anon fora ==='
