-- =============================================================================
-- O MÓDULO 44 NO BANCO — a cotação que se isola, que CONGELA ao ir ao mercado,
-- e o prêmio ao fornecedor vencedor: decisão do comprador, carimbada pelo servidor
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as cotações de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta GERE (cadastra/envia) mas não PREMIA;
--   2. ⭐ **ENVIAR CONGELA** — depois de `open`, mudar o título ou uma linha RAISES;
--   3. ⭐ **premiar exige rfq.request.award** — o Beta é barrado; e premiar sem
--      escolher o fornecedor vencedor falha; o vencedor válido é carimbado (o
--      awarded_by mentido é descartado pelo servidor);
--   4. **cancelar exige razão**; e o terminal é terminal — a premiada não anda mais;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert49(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: rfq instalado; Alfa premia, Beta só gere ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rfq', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rfq', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'rfq.request.manage', 'rfq'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ ASSIMETRIA: só o Alfa premia. O Beta cadastra, edita e envia, não decide.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'rfq.request.award', 'rfq'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois gerem; só o Alfa premia o vencedor.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO EM RASCUNHO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua cotação; nasce draft; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT: diz que foi o Beta. O gatilho descarta.
  insert into rfq.requests (tenant_id, title, description, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Cimento para a obra', 'três marcas',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert49(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  insert into rfq.request_lines (tenant_id, request_id, line_no, item, quantity, unit)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 1, 'CP-II', 50, 'saca'),
         ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 2, 'Areia', 10, 'm³');

  begin
    insert into rfq.requests (tenant_id, title, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'open');
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: nasceu no mercado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert49(v_erro like '%nasce em rascunho%', 'a cotação nasce em rascunho');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into rfq.requests (tenant_id, title)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Uniformes')
  returning id into v_id;
  insert into rfq.request_lines (tenant_id, request_id, line_no, item, quantity)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_id, 1, 'Camisa', 30);

  select count(*) into v_n from rfq.requests;
  perform pg_temp.assert49(v_n = 1, 'o Beta enxerga só a cotação dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ ENVIAR CONGELA: título e itens não mudam mais
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: enviar ao mercado congela o conteúdo ==='

do $$
declare
  v_id uuid; v_status text; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from rfq.requests
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Cimento para a obra';

  update rfq.requests set status = 'open' where id = v_id;
  select status into v_status from rfq.requests where id = v_id;
  perform pg_temp.assert49(v_status = 'open', 'a cotação foi ao mercado (open)');

  begin
    update rfq.requests set title = 'Outro título' where id = v_id;
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: mudou o título depois de enviar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert49(v_erro like '%não mudam mais%', '⭐ título congelado depois do envio');
  end;

  begin
    update rfq.request_lines set item = 'CP-III' where request_id = v_id and line_no = 1;
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: mudou uma linha depois de enviar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert49(v_erro like '%não mudam mais%', '⭐ a linha congelada depois do envio');
  end;

  begin
    insert into rfq.request_lines (tenant_id, request_id, line_no, item, quantity)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 3, 'Brita', 5);
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: acrescentou linha depois de enviar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert49(v_erro like '%não mudam mais%', '⭐ não se acrescenta item fora do rascunho');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'rfq.request.opened';
  perform pg_temp.assert49(v_n = 1, 'o fato de envio saiu');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ PREMIAR: exige award, exige vencedor, carimba pelo servidor
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: premiar é decisão do comprador (award) ==='

do $$
declare
  v_id_a uuid; v_id_b uuid; v_status text; v_by uuid; v_at timestamptz; v_erro text; v_n int;
begin
  set local role authenticated;

  -- Beta envia a sua cotação e TENTA premiar — barrado (não tem award).
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_id_b from rfq.requests
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and title = 'Uniformes';
  update rfq.requests set status = 'open' where id = v_id_b;

  begin
    update rfq.requests
       set status = 'awarded',
           awarded_supplier_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
           awarded_supplier_name = 'Malharia B'
     where id = v_id_b;
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: o Beta premiou sem award');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert49(v_erro like '%rfq.request.award%', '⭐ premiar exige rfq.request.award');
  end;

  -- Alfa premia — mas sem escolher o vencedor: recusado.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id_a from rfq.requests
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Cimento para a obra';

  begin
    update rfq.requests set status = 'awarded' where id = v_id_a;
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: premiou sem escolher o fornecedor');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert49(v_erro like '%fornecedor vencedor%', '⭐ premiar exige escolher o vencedor');
  end;

  -- Alfa premia com o vencedor — e MENTE o awarded_by. O servidor carimba.
  update rfq.requests
     set status = 'awarded',
         awarded_supplier_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
         awarded_supplier_name = 'Concreto Alfa',
         awarded_by = '22222222-2222-4222-8222-222222222222'
   where id = v_id_a;

  select status, awarded_by, awarded_at into v_status, v_by, v_at
    from rfq.requests where id = v_id_a;
  perform pg_temp.assert49(v_status = 'awarded', 'a cotação foi premiada');
  perform pg_temp.assert49(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ awarded_by é quem premiou — o autor mentido foi descartado');
  perform pg_temp.assert49(v_at is not null, 'awarded_at foi carimbado pelo servidor');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'rfq.request.awarded';
  perform pg_temp.assert49(v_n = 1, 'o fato do prêmio saiu');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CANCELAR EXIGE RAZÃO; O TERMINAL É TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cancelar exige razão; a premiada não anda mais ==='

do $$
declare
  v_id2 uuid; v_id_a uuid; v_status text; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into rfq.requests (tenant_id, title)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Frota — pneus')
  returning id into v_id2;
  insert into rfq.request_lines (tenant_id, request_id, line_no, item, quantity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id2, 1, 'Pneu 275/80', 12);
  update rfq.requests set status = 'open' where id = v_id2;

  begin
    update rfq.requests set status = 'cancelled' where id = v_id2;
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: cancelou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert49(v_erro like '%razão%', 'cancelar exige uma razão');
  end;

  update rfq.requests set status = 'cancelled', cancel_reason = 'sem propostas válidas'
   where id = v_id2;
  select status into v_status from rfq.requests where id = v_id2;
  perform pg_temp.assert49(v_status = 'cancelled', 'cancelou com razão');

  -- A premiada do cenário 3 é terminal: não anda mais.
  select id into v_id_a from rfq.requests
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Cimento para a obra';
  begin
    update rfq.requests set status = 'cancelled', cancel_reason = 'tentando reabrir'
     where id = v_id_a;
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: moveu a cotação premiada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert49(v_erro like '%não existe%', '⭐ a premiada é terminal — refazer é cotação nova');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'rfq.request.cancelled';
  perform pg_temp.assert49(v_n = 1, 'o fato do cancelamento saiu');
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON E CROSS-TENANT FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida; anon e cross-tenant barrados ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from rfq.requests
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from rfq.requests where id = v_id;
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: apagou cotação');
  exception when insufficient_privilege then
    perform pg_temp.assert49(true, 'apagar não existe — cotação decidida é história');
  end;

  begin
    perform rfq.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rfq.request.registered', '{}'::jsonb);
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert49(true, 'rfq.emit_event não é concedida ao cliente');
  end;

  -- Cross-tenant: o Alfa não escreve no tenant do Beta (barrado pela RLS).
  begin
    insert into rfq.requests (tenant_id, title)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasora');
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert49(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from rfq.requests limit 1;
    perform pg_temp.assert49(false, 'DEVERIA TER FALHADO: anon leu rfq.requests');
  exception when insufficient_privilege then
    perform pg_temp.assert49(true, '⭐ anon não encosta em rfq.requests');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 44 OK: cotação isolada, conteúdo congela ao enviar, prêmio do comprador carimbado, anon fora ==='
