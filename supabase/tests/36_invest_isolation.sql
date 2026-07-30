-- =============================================================================
-- O MÓDULO 31 NO BANCO — o investimento do tenant, o livro de atos, a posição
-- calculada e a TERCEIRA resposta (resgate não passa da posição)
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o investimento de um tenant não aparece no outro — e a assimetria: o
--      Beta cadastra, mas NÃO registra ato;
--   2. ⭐ o investimento volta do arquivo; nome ativo único; arquivado NÃO
--      recebe ato;
--   3. ⭐ o livro é imutável (cliente sem UPDATE/DELETE; nem o dono reescreve);
--   4. ⭐⭐ a posição é a SOMA dos atos (view), e RESGATAR MAIS QUE A POSIÇÃO
--      é RECUSADO — a terceira resposta, no banco;
--   5. ⛔ anon = NADA; apagar não existe; a caneta de evento não é do cliente;
--      SEM coluna de posição, SEM cotação.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert36(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Investimentos nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'invest', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'invest', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA: `user-a` (Alfa) cadastra E registra atos; `user-b` (Beta)
-- só cadastra — não registra ato.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'invest.holding.manage', 'invest'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'invest.movement.register', 'invest'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cadastram; só o Alfa registra atos.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A MÃO QUE NÃO REGISTRA ATO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant no seu; o Beta cadastra mas não registra ato ==='

do $$
declare v_n int; v_h uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into invest.holdings (tenant_id, name, kind, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CDB Banco X', 'CDB', 'BRL');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into invest.holdings (tenant_id, name, kind, currency)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Fundo B', 'Fundo', 'BRL')
  returning id into v_h;
  perform pg_temp.assert36(true, 'o Beta cadastra investimento (invest.holding.manage)');

  begin
    insert into invest.movements (tenant_id, holding_id, kind, amount_cents, currency)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_h, 'application', 10000, 'BRL');
    perform pg_temp.assert36(false, 'DEVERIA TER FALHADO: o Beta registrou ato');
  exception when insufficient_privilege then
    perform pg_temp.assert36(true, '⭐ registrar ato é mão própria (invest.movement.register)');
  end;

  select count(*) into v_n from invest.holdings;
  perform pg_temp.assert36(v_n = 1, 'o Beta enxerga só o investimento dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — VOLTA DO ARQUIVO; NOME ATIVO ÚNICO; ARQUIVADO NÃO RECEBE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: nome ativo único; arquiva e volta; arquivado não recebe ato ==='

do $$
declare v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from invest.holdings
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'CDB Banco X';

  begin
    insert into invest.holdings (tenant_id, name, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  CDB BANCO X ', 'BRL');
    perform pg_temp.assert36(false, 'DEVERIA TER FALHADO: investimento ativo em dobro');
  exception when unique_violation then
    perform pg_temp.assert36(true, 'investimento ATIVO não duplica nome');
  end;

  update invest.holdings set status = 'archived' where id = v_id;

  begin
    insert into invest.movements (tenant_id, holding_id, kind, amount_cents, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'application', 1000, 'BRL');
    perform pg_temp.assert36(false, 'DEVERIA TER FALHADO: ato em investimento inativo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert36(v_erro like '%arquivado não recebe%', 'investimento arquivado não recebe ato');
  end;

  update invest.holdings set status = 'active' where id = v_id;
  perform pg_temp.assert36(true, '⭐ o investimento reativado volta — é o MESMO');
end $$;

-- =============================================================================
-- CENÁRIO 3 — O LIVRO É IMUTÁVEL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o livro não se rasura, nem para o dono ==='

do $$
declare v_h uuid; v_m uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_h from invest.holdings
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'CDB Banco X';

  insert into invest.movements (tenant_id, holding_id, kind, amount_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_h, 'application', 100000, 'BRL')
  returning id into v_m;

  begin
    update invest.movements set amount_cents = 1 where id = v_m;
    perform pg_temp.assert36(false, 'DEVERIA TER FALHADO: cliente editou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert36(true, 'o cliente não edita o livro (sem grant de UPDATE)');
  end;

  reset role;
  begin
    update invest.movements set amount_cents = 777 where id = v_m;
    perform pg_temp.assert36(false, 'DEVERIA TER FALHADO: o dono reescreveu o livro');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert36(v_erro like '%fato consumado%', '⭐ o livro não se rasura nem como dono do banco');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐⭐ A POSIÇÃO E A TERCEIRA RESPOSTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: a posição soma os atos; resgate além da posição é RECUSADO ==='

do $$
declare v_h uuid; v_pos bigint; v_cols int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_h from invest.holdings
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'CDB Banco X';
  -- já tem uma aplicação de 100.000 do cenário 3.

  -- Rendimento entrado por gente: +5.000 → posição 105.000.
  insert into invest.movements (tenant_id, holding_id, kind, amount_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_h, 'yield', 5000, 'BRL');

  select position_cents into v_pos from invest.positions where holding_id = v_h;
  perform pg_temp.assert36(v_pos = 105000, '⭐ a posição é a soma dos atos (aplicação + rendimento)');

  -- ⭐⭐ Resgatar MAIS que a posição é RECUSADO.
  begin
    insert into invest.movements (tenant_id, holding_id, kind, amount_cents, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_h, 'redemption', 105001, 'BRL');
    perform pg_temp.assert36(false, 'DEVERIA TER FALHADO: resgatou além da posição');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert36(v_erro like '%excede a posição%', '⭐⭐ resgatar mais que a posição é RECUSADO — a terceira resposta');
  end;

  -- Resgatar a posição inteira é permitido; a posição zera.
  insert into invest.movements (tenant_id, holding_id, kind, amount_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_h, 'redemption', 105000, 'BRL');
  select position_cents into v_pos from invest.positions where holding_id = v_h;
  perform pg_temp.assert36(v_pos = 0, 'resgatar a posição inteira é permitido — a posição zera');

  -- ⭐ E é VIEW, sem coluna de posição.
  select count(*) into v_cols from information_schema.columns
   where table_schema = 'invest' and table_name = 'movements' and column_name = 'position_cents';
  perform pg_temp.assert36(v_cols = 0, '⭐ nenhuma coluna de posição — só a view calcula');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ANON = NADA; SEM DELETE; SEM COTAÇÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: anon barrado; sem DELETE; emit_event não concedida ==='

do $$
begin
  set local role anon;
  begin
    perform count(*) from invest.holdings;
    perform pg_temp.assert36(false, 'DEVERIA TER FALHADO: anon leu os investimentos');
  exception when insufficient_privilege then
    perform pg_temp.assert36(true, '⛔ anon = NADA no schema invest');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from invest.holdings where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;
  begin
    delete from invest.holdings where id = v_id;
    perform pg_temp.assert36(false, 'DEVERIA TER FALHADO: apagou investimento');
  exception when insufficient_privilege then
    perform pg_temp.assert36(true, 'apagar investimento não existe — arquivar é status');
  end;

  begin
    perform invest.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'invest.holding.registered', '{}'::jsonb);
    perform pg_temp.assert36(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert36(true, 'invest.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
declare v_rate int;
begin
  -- ⭐ SEM COTAÇÃO: nenhuma coluna de taxa/preço de mercado no livro.
  reset role;
  select count(*) into v_rate from information_schema.columns
   where table_schema = 'invest'
     and column_name in ('rate', 'market_price', 'quote_cents', 'benchmark');
  perform pg_temp.assert36(v_rate = 0, '⭐ sem cotação: nenhuma coluna de taxa/preço de mercado');
end $$;

\echo ''
\echo '=== MÓDULO 31 OK: investimento do tenant, livro imutável, posição sem cotação, resgate barrado ==='
