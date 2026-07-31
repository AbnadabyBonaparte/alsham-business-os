-- =============================================================================
-- O MÓDULO 48 NO BANCO — o plano de demanda que se isola, que CONGELA ao
-- publicar, e cujo published é TERMINAL (o próximo período é plano novo)
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os planos de um tenant não aparecem no outro;
--   2. ⭐ **o plano nasce draft** e o autor é carimbado pelo servidor (o mentido
--      no INSERT é descartado);
--   3. ⭐ **PUBLICAR CONGELA** — depois de published, período/título/linhas RAISES;
--      e publicar EXIGE ao menos uma linha (plano vazio não vai à cadeia);
--   4. ⭐ **published é TERMINAL** — não volta a rascunho nem anda para lugar
--      nenhum; cancelar (abandonar rascunho) exige razão;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert53(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: dem instalado nos dois tenants; os dois gerem o plano ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dem', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dem', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'dem.plan.manage', 'dem'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO EM RASCUNHO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu plano; nasce draft; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT: diz que foi o Beta. O gatilho descarta.
  insert into dem.plans (tenant_id, period, title, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Q1 2027', 'Plano trimestral',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert53(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  insert into dem.plan_lines (tenant_id, plan_id, line_no, product, quantity, unit)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 1, 'Cimento CP-II', 500, 'sc'),
         ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 2, 'Aço CA-50', 200, 't');

  begin
    insert into dem.plans (tenant_id, period, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'published');
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: nasceu publicado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert53(v_erro like '%nasce em rascunho%', 'o plano nasce em rascunho');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into dem.plans (tenant_id, period)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Safra 26/27')
  returning id into v_id;
  insert into dem.plan_lines (tenant_id, plan_id, line_no, product, quantity)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_id, 1, 'Semente', 1000);

  select count(*) into v_n from dem.plans;
  perform pg_temp.assert53(v_n = 1, 'o Beta enxerga só o plano dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ PUBLICAR EXIGE LINHA E CONGELA o conteúdo
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: publicar exige ao menos uma linha e congela período/título/linhas ==='

do $$
declare
  v_id uuid; v_vazio uuid; v_status text; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Um plano SEM linha não publica.
  insert into dem.plans (tenant_id, period) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vazio')
  returning id into v_vazio;
  begin
    update dem.plans set status = 'published' where id = v_vazio;
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: publicou plano sem linha');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert53(v_erro like '%ao menos uma linha%', '⭐ publicar exige ao menos uma linha');
  end;

  select id into v_id from dem.plans
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and period = 'Q1 2027';

  update dem.plans set status = 'published' where id = v_id;
  select status into v_status from dem.plans where id = v_id;
  perform pg_temp.assert53(v_status = 'published', 'o plano foi publicado');

  begin
    update dem.plans set period = 'Outro período' where id = v_id;
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: mudou o período depois de publicar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert53(v_erro like '%não mudam mais%', '⭐ período congelado depois de publicar');
  end;

  begin
    update dem.plan_lines set quantity = 999 where plan_id = v_id and line_no = 1;
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: mudou uma linha depois de publicar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert53(v_erro like '%não mudam mais%', '⭐ a linha congelada depois de publicar');
  end;

  begin
    insert into dem.plan_lines (tenant_id, plan_id, line_no, product, quantity)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 3, 'Brita', 5);
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: acrescentou linha depois de publicar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert53(v_erro like '%não mudam mais%', '⭐ não se acrescenta linha fora do rascunho');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'dem.plan.published';
  perform pg_temp.assert53(v_n = 1, 'o fato de publicação saiu');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ PUBLISHED É TERMINAL; CANCELAR EXIGE RAZÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: published não anda mais; cancelar (abandonar rascunho) exige razão ==='

do $$
declare
  v_id uuid; v_rascunho uuid; v_status text; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- O publicado do cenário 2 é terminal: não volta a rascunho nem anda.
  select id into v_id from dem.plans
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and period = 'Q1 2027';
  begin
    update dem.plans set status = 'cancelled', cancel_reason = 'tentando reabrir' where id = v_id;
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: moveu o plano publicado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert53(v_erro like '%não existe%', '⭐ published é terminal — o próximo período é plano novo');
  end;

  -- Cancelar um rascunho exige razão.
  insert into dem.plans (tenant_id, period) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Rascunho a abandonar')
  returning id into v_rascunho;
  begin
    update dem.plans set status = 'cancelled' where id = v_rascunho;
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: cancelou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert53(v_erro like '%razão%', 'cancelar exige uma razão');
  end;

  update dem.plans set status = 'cancelled', cancel_reason = 'período reformulado' where id = v_rascunho;
  select status into v_status from dem.plans where id = v_rascunho;
  perform pg_temp.assert53(v_status = 'cancelled', 'cancelou com razão');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'dem.plan.cancelled';
  perform pg_temp.assert53(v_n = 1, 'o fato do cancelamento saiu');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO PLANO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  begin
    insert into dem.plans (tenant_id, period)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor');
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert53(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
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

  select id into v_id from dem.plans limit 1;

  begin
    delete from dem.plans where id = v_id;
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: apagou plano');
  exception when insufficient_privilege then
    perform pg_temp.assert53(true, 'apagar não existe — plano publicado é história');
  end;

  begin
    perform dem.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dem.plan.registered', '{}'::jsonb);
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert53(true, 'dem.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from dem.plans limit 1;
    perform pg_temp.assert53(false, 'DEVERIA TER FALHADO: anon leu dem.plans');
  exception when insufficient_privilege then
    perform pg_temp.assert53(true, '⭐ anon não encosta em dem.plans');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 48 OK: plano isolado, congela ao publicar, published terminal, anon fora ==='
