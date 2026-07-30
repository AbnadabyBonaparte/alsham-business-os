-- =============================================================================
-- O MÓDULO 38 NO BANCO — o mapa de lojistas que se isola, o lojista que volta
-- do arquivo (com permissão própria) e a unidade física por id solto
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os lojistas de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta CADASTRA mas não ARQUIVA;
--   2. ⭐ **active ↔ archived** — o lojista VOLTA do arquivo (o DIVERGE do hr);
--   3. ⭐ **arquivar/reabrir exige mall.store.decide** — o Beta é barrado;
--   4. segmento é texto livre; a unidade física é id solto (nenhuma FK);
--   5. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta na tabela.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert43(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: mall (o primeiro vertical) instalado; Alfa decide, Beta só cadastra ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'mall', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'mall', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'mall.store.manage', 'mall'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'mall.store.decide', 'mall'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cadastram; só o Alfa arquiva/reabre.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E O NASCIMENTO ATIVO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu mapa; o lojista nasce ativo ==='

do $$
declare
  v_id uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into mall.stores (tenant_id, store_name, segment, space_id, space_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ateliê da Praça', 'moda',
          'ee000000-0000-4000-8000-000000000001', 'Loja 42 — Piso L1')
  returning id into v_id;

  begin
    insert into mall.stores (tenant_id, store_name, segment, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'x', 'archived');
    perform pg_temp.assert43(false, 'DEVERIA TER FALHADO: nasceu arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert43(v_erro like '%nasce ativo%', 'o lojista nasce ativo');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into mall.stores (tenant_id, store_name, segment)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Praça de Alimentação B', 'alimentação');

  select count(*) into v_n from mall.stores;
  perform pg_temp.assert43(v_n = 1, 'o Beta enxerga só o mapa dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ active ↔ archived: O LOJISTA VOLTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: arquivar e reabrir — o mesmo registro (o DIVERGE do hr) ==='

do $$
declare
  v_id uuid; v_status text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from mall.stores
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and store_name = 'Ateliê da Praça';

  update mall.stores set status = 'archived' where id = v_id;
  select status into v_status from mall.stores where id = v_id;
  perform pg_temp.assert43(v_status = 'archived', 'arquivou');

  update mall.stores set status = 'active' where id = v_id;
  select status into v_status from mall.stores where id = v_id;
  perform pg_temp.assert43(v_status = 'active', '⭐ o lojista VOLTA do arquivo — a mesma relação comercial');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type in ('mall.store.archived','mall.store.reopened');
  perform pg_temp.assert43(v_n = 2, 'os fatos de arquivar e reabrir saíram');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ ARQUIVAR/REABRIR EXIGE mall.store.decide: O BETA É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o Beta cadastra e edita, mas não arquiva ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from mall.stores
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and store_name = 'Praça de Alimentação B';

  -- Editar dados o Beta consegue (manage).
  update mall.stores set segment = 'praça de alimentação' where id = v_id;
  perform pg_temp.assert43(true, 'o Beta edita — manage basta; segmento é texto livre');

  begin
    update mall.stores set status = 'archived' where id = v_id;
    perform pg_temp.assert43(false, 'DEVERIA TER FALHADO: o Beta arquivou sem decide');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert43(v_erro like '%mall.store.decide%', '⭐ arquivar exige mall.store.decide');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — A UNIDADE FÍSICA É ID SOLTO (nenhuma FK ao spc)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: a unidade é id solto — o mall não recria cadastro de espaço ==='

do $$
declare
  v_space uuid; v_name text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select space_id, space_name into v_space, v_name from mall.stores
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and store_name = 'Ateliê da Praça';

  -- O id solto aponta para uma unidade que NÃO precisa existir em mall (é do spc).
  perform pg_temp.assert43(
    v_space = 'ee000000-0000-4000-8000-000000000001' and v_name = 'Loja 42 — Piso L1',
    '⭐ a unidade física é id solto + nome carimbado — sem FK ao spc');
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

  select id into v_id from mall.stores limit 1;

  begin
    delete from mall.stores where id = v_id;
    perform pg_temp.assert43(false, 'DEVERIA TER FALHADO: apagou lojista');
  exception when insufficient_privilege then
    perform pg_temp.assert43(true, 'apagar não existe — arquivar é status');
  end;

  begin
    perform mall.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'mall.store.registered', '{}'::jsonb);
    perform pg_temp.assert43(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert43(true, 'mall.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from mall.stores limit 1;
    perform pg_temp.assert43(false, 'DEVERIA TER FALHADO: anon leu mall.stores');
  exception when insufficient_privilege then
    perform pg_temp.assert43(true, '⭐ anon não encosta em mall.stores');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 38 OK: o primeiro vertical — mapa isolado, lojista que volta, unidade por id solto, anon fora ==='
