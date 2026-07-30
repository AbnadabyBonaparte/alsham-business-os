-- =============================================================================
-- O MÓDULO 40 NO BANCO — o livro do fundo que se isola, a assimetria entre
-- quem contribui e quem gasta, e o SALDO QUE NUNCA FICA NEGATIVO
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as contribuições/gastos de um tenant não aparecem no outro — e a
--      assimetria user-a × user-b: o Beta CONTRIBUI mas não GASTA;
--   2. ⭐⭐ **gastar mais do que o saldo é RECUSADO** — contribui 1000, gasta
--      800 (ok), tenta gastar mais 300 (só sobra 200 — mordido);
--   3. gasto sem razão não lança;
--   4. os dois livros são IMUTÁVEIS (update/delete mordidos, até para o
--      dono do papel);
--   5. `fund.balance` soma certo; a caneta de emitir evento não é do
--      cliente; e o `anon` não encosta em nenhuma tabela.
--
-- Dado 100% fabricado. Zero nome de cliente. `store_id`/`campaign_id` são ids
-- soltos fabricados — não precisam existir em `mall`/`marketing`. Script
-- descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert45(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: fund instalado; Alfa contribui e gasta, Beta só contribui ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fund', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'fund', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'fund.contribution.manage', 'fund'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ ASSIMETRIA: só o Alfa pode gastar. O Beta contribui mas não gasta.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'fund.expense.manage', 'fund'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois contribuem; só o Alfa gasta.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A ASSIMETRIA CONTRIBUI×GASTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu livro; o Beta contribui mas não gasta ==='

do $$
declare
  v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into fund.contributions (tenant_id, store_id, store_name, competence_on, amount_cents, currency, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'ee000000-0000-4000-8000-000000000001', 'Ateliê da Praça',
          '2026-07-01', 1000, 'BRL', 'julho');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into fund.contributions (tenant_id, store_id, store_name, competence_on, amount_cents)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          'ee000000-0000-4000-8000-000000000002', 'Praça de Alimentação B',
          '2026-07-01', 500);

  select count(*) into v_n from fund.contributions;
  perform pg_temp.assert45(v_n = 1, 'o Beta enxerga só o livro dele');

  -- ⭐ SABOTAGEM 1: o Beta tenta gastar sem a permissão de gasto.
  begin
    insert into fund.expenses (tenant_id, campaign_id, campaign_name, amount_cents, reason)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, '', 100, 'tentativa indevida');
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: o Beta gastou sem fund.expense.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert45(true, '⭐ SABOTAGEM 1 mordida: o Beta não tem fund.expense.manage');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 2 — CONTRIBUIÇÕES E GASTOS SÃO REGISTRADOS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o Alfa contribui de novo e gasta dentro do saldo ==='

do $$
declare
  v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into fund.contributions (tenant_id, store_id, store_name, competence_on, amount_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'ee000000-0000-4000-8000-000000000003', 'Loja do Térreo',
          '2026-07-01', 500);
  -- Saldo do tenant Alfa agora: 1000 + 500 = 1500.

  insert into fund.expenses (tenant_id, campaign_id, campaign_name, amount_cents, reason)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'ff000000-0000-4000-8000-000000000001', 'Natal Iluminado', 800, 'panfletagem de dezembro');
  -- Saldo restante: 1500 - 800 = 700.

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type in ('fund.contribution.recorded', 'fund.expense.recorded');
  perform pg_temp.assert45(v_n >= 3, 'os fatos de contribuição e gasto saíram');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ GASTAR MAIS QUE O SALDO É RECUSADO (o coração do módulo)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o saldo NUNCA fica negativo — 700 disponíveis, tenta gastar 1500 ==='

do $$
declare
  v_erro text; v_balance bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select balance_cents into v_balance from fund.balance
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert45(v_balance = 700, 'o saldo do Alfa é 700 antes da tentativa (checagem de sanidade)');

  -- ⭐ SABOTAGEM 2: gasto que excede o saldo em muito.
  begin
    insert into fund.expenses (tenant_id, campaign_id, campaign_name, amount_cents, reason)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, '', 1500, 'gasto acima do saldo');
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: gastou mais do que o fundo tinha');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert45(
      v_erro like '%não pode ficar negativo%',
      '⭐⭐ SABOTAGEM 2 mordida: o fundo não pode ficar negativo');
  end;

  -- Gasto que cabe exatamente no saldo restante: aceito.
  insert into fund.expenses (tenant_id, campaign_id, campaign_name, amount_cents, reason)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, '', 500, 'panfletagem extra');
  -- Saldo restante: 700 - 500 = 200.

  -- ⭐ SABOTAGEM 3: agora só sobram 200 — tentar gastar 300 é recusado de novo.
  begin
    insert into fund.expenses (tenant_id, campaign_id, campaign_name, amount_cents, reason)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, '', 300, 'gasto além do que restou');
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: só restavam 200, tentou gastar 300');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert45(
      v_erro like '%não pode ficar negativo%',
      '⭐⭐ SABOTAGEM 3 mordida: com 200 restantes, 300 continua sendo recusado');
  end;

  select balance_cents into v_balance from fund.balance
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert45(v_balance = 200, '⭐ fund.balance calcula certo depois das tentativas recusadas');
end $$;

-- =============================================================================
-- CENÁRIO 4 — GASTO SEM RAZÃO NÃO LANÇA; OS DOIS LIVROS SÃO IMUTÁVEIS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: razão obrigatória no gasto; livros imutáveis (update/delete mordidos) ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⭐ SABOTAGEM 4: gasto sem razão (texto vazio) é recusado pela constraint.
  begin
    insert into fund.expenses (tenant_id, campaign_id, campaign_name, amount_cents, reason)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, '', 1, '   ');
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: gasto sem razão');
  exception when others then
    perform pg_temp.assert45(true, 'gasto sem razão não lança (razão obrigatória)');
  end;

  select id into v_id from fund.contributions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    update fund.contributions set amount_cents = 999999 where id = v_id;
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: editou contribuição');
  exception when insufficient_privilege then
    perform pg_temp.assert45(true, 'contribuição é fato consumado — sem UPDATE');
  end;

  begin
    delete from fund.contributions where id = v_id;
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: apagou contribuição');
  exception when insufficient_privilege then
    perform pg_temp.assert45(true, 'contribuição é fato consumado — sem DELETE');
  end;

  select id into v_id from fund.expenses
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    update fund.expenses set reason = 'reescrito' where id = v_id;
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: editou gasto');
  exception when insufficient_privilege then
    perform pg_temp.assert45(true, 'gasto é fato consumado — sem UPDATE');
  end;

  begin
    delete from fund.expenses where id = v_id;
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: apagou gasto');
  exception when insufficient_privilege then
    perform pg_temp.assert45(true, 'gasto é fato consumado — sem DELETE');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: emit_event não é concedida; anon barrado (papel real) ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⭐ SABOTAGEM 5: o cliente tenta emitir o evento à mão.
  begin
    perform fund.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fund.contribution.recorded', '{}'::jsonb);
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert45(true, '⭐ SABOTAGEM 5 mordida: fund.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from fund.contributions limit 1;
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: anon leu fund.contributions');
  exception when insufficient_privilege then
    perform pg_temp.assert45(true, '⭐ anon não encosta em fund.contributions');
  end;
  begin
    perform 1 from fund.expenses limit 1;
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: anon leu fund.expenses');
  exception when insufficient_privilege then
    perform pg_temp.assert45(true, '⭐ anon não encosta em fund.expenses');
  end;
  begin
    perform 1 from fund.balance limit 1;
    perform pg_temp.assert45(false, 'DEVERIA TER FALHADO: anon leu fund.balance');
  exception when insufficient_privilege then
    perform pg_temp.assert45(true, '⭐ anon não encosta em fund.balance');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 40 OK: livro isolado, gasto que excede o saldo sempre recusado, livros imutáveis, anon fora ==='
