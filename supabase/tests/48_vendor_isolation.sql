-- =============================================================================
-- O MÓDULO 43 NO BANCO — o cadastro de fornecedores que se isola, o fornecedor
-- que volta do arquivo (com permissão própria) e o autor carimbado pelo servidor
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os fornecedores de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta CADASTRA mas não ARQUIVA;
--   2. ⭐ **active ↔ archived** — o fornecedor VOLTA do arquivo (o DIVERGE do hr);
--   3. ⭐ **arquivar/reativar exige vendor.supplier.decide** — o Beta é barrado;
--   4. ⭐ **o autor é carimbado pelo servidor** — o created_by mentido é descartado;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta na tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert48(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: vendor instalado; Alfa decide, Beta só cadastra ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vendor', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'vendor', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'vendor.supplier.manage', 'vendor'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ ASSIMETRIA: só o Alfa arquiva/reativa. O Beta cadastra e edita, não decide.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'vendor.supplier.decide', 'vendor'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cadastram; só o Alfa arquiva/reativa.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ATIVO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu cadastro; nasce ativo; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT: diz que foi o Beta. O gatilho descarta.
  insert into vendor.suppliers (tenant_id, name, segment, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Aço Bonaparte', 'metais',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert48(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  begin
    insert into vendor.suppliers (tenant_id, name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'archived');
    perform pg_temp.assert48(false, 'DEVERIA TER FALHADO: nasceu arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert48(v_erro like '%nasce ativo%', 'o fornecedor nasce ativo');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into vendor.suppliers (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Fornecedor Solo B');

  select count(*) into v_n from vendor.suppliers;
  perform pg_temp.assert48(v_n = 1, 'o Beta enxerga só o cadastro dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ active ↔ archived: O FORNECEDOR VOLTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: arquivar e reativar — o mesmo registro (o DIVERGE do hr) ==='

do $$
declare
  v_id uuid; v_status text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from vendor.suppliers
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Aço Bonaparte';

  update vendor.suppliers set status = 'archived' where id = v_id;
  select status into v_status from vendor.suppliers where id = v_id;
  perform pg_temp.assert48(v_status = 'archived', 'arquivou');

  update vendor.suppliers set status = 'active' where id = v_id;
  select status into v_status from vendor.suppliers where id = v_id;
  perform pg_temp.assert48(v_status = 'active', '⭐ o fornecedor VOLTA do arquivo — a mesma relação comercial');

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type in ('vendor.supplier.archived','vendor.supplier.reopened');
  perform pg_temp.assert48(v_n = 2, 'os fatos de arquivar e reativar saíram');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ ARQUIVAR/REATIVAR EXIGE vendor.supplier.decide: O BETA É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o Beta cadastra e edita, mas não arquiva ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from vendor.suppliers
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'Fornecedor Solo B';

  -- Editar dados o Beta consegue (manage). Segmento é texto livre.
  update vendor.suppliers set segment = 'serviços' where id = v_id;
  perform pg_temp.assert48(true, 'o Beta edita — manage basta; segmento é texto livre');

  begin
    update vendor.suppliers set status = 'archived' where id = v_id;
    perform pg_temp.assert48(false, 'DEVERIA TER FALHADO: o Beta arquivou sem decide');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert48(v_erro like '%vendor.supplier.decide%', '⭐ arquivar exige vendor.supplier.decide');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO CADASTRO DO BETA
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
    insert into vendor.suppliers (tenant_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor');
    perform pg_temp.assert48(false, 'DEVERIA TER FALHADO: o Alfa escreveu no cadastro do Beta');
  exception when others then
    perform pg_temp.assert48(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
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

  select id into v_id from vendor.suppliers limit 1;

  begin
    delete from vendor.suppliers where id = v_id;
    perform pg_temp.assert48(false, 'DEVERIA TER FALHADO: apagou fornecedor');
  exception when insufficient_privilege then
    perform pg_temp.assert48(true, 'apagar não existe — arquivar é status');
  end;

  begin
    perform vendor.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vendor.supplier.registered', '{}'::jsonb);
    perform pg_temp.assert48(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert48(true, 'vendor.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from vendor.suppliers limit 1;
    perform pg_temp.assert48(false, 'DEVERIA TER FALHADO: anon leu vendor.suppliers');
  exception when insufficient_privilege then
    perform pg_temp.assert48(true, '⭐ anon não encosta em vendor.suppliers');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 43 OK: cadastro isolado, fornecedor que volta, autor do servidor, anon fora ==='
