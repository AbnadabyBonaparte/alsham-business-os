-- =============================================================================
-- O MÓDULO 29 NO BANCO — o teto que congela a trave e o realizado calculado
-- do livro do cash, projetado por evento
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o orçamento de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta cria e ativa, mas NÃO fecha o período;
--   2. ⭐ **ativar CONGELA a trave** (categoria, período, teto) — só o nome
--      segue editável; e o período fechado é TERMINAL;
--   3. ⭐⭐ **o realizado é CALCULADO do livro projetado** — a projeção
--      (`bud.record_external_movement`, service_role) alimenta, a VIEW soma;
--      o gasto fora do período/categoria/moeda NÃO conta; o crédito não vira
--      realizado (a view soma só o desembolso); a idempotência não conta duas
--      vezes;
--   4. ⭐ **o cliente NÃO escreve a projeção** (sem grant), a projeção é
--      imutável para o dono, e não existe coluna de realizado/saldo;
--   5. ⛔ **anon = NADA** (papel real); apagar não existe; a caneta de emitir
--      evento e a de projetar não são do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert34(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Orçamentos nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bud', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bud', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) gerencia E fecha;
-- `user-b` (Beta) só gerencia — cria e ativa, mas não fecha o período.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'bud.budget.manage', 'bud'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'bud.budget.close', 'bud'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois gerenciam; só o Alfa fecha o período.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A MÃO QUE NÃO FECHA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant no seu orçamento; o Beta cria mas não fecha ==='

do $$
declare
  v_n int; v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into bud.budgets (tenant_id, name, category, starts_on, ends_on, limit_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Marketing Q3', 'Marketing',
          '2026-07-01', '2026-09-30', 500000, 'BRL');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- O Beta cria e ativa (tem manage)...
  insert into bud.budgets (tenant_id, name, category, starts_on, ends_on, limit_cents, currency)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Obras', 'Materiais',
          '2026-07-01', '2026-12-31', 800000, 'BRL')
  returning id into v_id;

  update bud.budgets set status = 'active' where id = v_id;
  perform pg_temp.assert34(true, 'o Beta cria e ativa (bud.budget.manage)');

  -- ...mas não fecha (não tem bud.budget.close).
  begin
    update bud.budgets set status = 'closed' where id = v_id;
    perform pg_temp.assert34(false, 'DEVERIA TER FALHADO: o Beta fechou o período');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert34(v_erro like '%bud.budget.close%', '⭐ fechar o período é mão própria (bud.budget.close)');
  end;

  select count(*) into v_n from bud.budgets;
  perform pg_temp.assert34(v_n = 1, 'o Beta enxerga só o orçamento dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ ATIVAR CONGELA A TRAVE; O NOME SEGUE; FECHADO É TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: a trave congela ao ativar; o nome muda; closed é terminal ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from bud.budgets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Marketing Q3';

  -- No rascunho, a trave se edita.
  update bud.budgets set limit_cents = 600000 where id = v_id;
  perform pg_temp.assert34(true, 'no rascunho a trave se edita');

  update bud.budgets set status = 'active' where id = v_id;

  -- ⭐ Ativo: mexer no teto é recusado.
  begin
    update bud.budgets set limit_cents = 700000 where id = v_id;
    perform pg_temp.assert34(false, 'DEVERIA TER FALHADO: mexeu no teto ativo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert34(v_erro like '%trave congelou%', '⭐ a trave congela na ativação (teto)');
  end;

  -- ⭐ Ativo: mexer na categoria é recusado.
  begin
    update bud.budgets set category = 'Vendas' where id = v_id;
    perform pg_temp.assert34(false, 'DEVERIA TER FALHADO: mexeu na categoria ativa');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert34(v_erro like '%trave congelou%', '⭐ a trave congela na ativação (categoria)');
  end;

  -- ⭐ Mas o NOME segue editável — gente renomeia.
  update bud.budgets set name = 'Marketing Q3 (revisado)' where id = v_id;
  perform pg_temp.assert34(true, '⭐ o nome segue editável mesmo ativo');

  -- Fecha o período (Alfa tem close).
  update bud.budgets set status = 'closed' where id = v_id;
  perform pg_temp.assert34(true, 'o Alfa fecha o período');

  -- ⭐ Fechado é TERMINAL — não reabre.
  begin
    update bud.budgets set status = 'active' where id = v_id;
    perform pg_temp.assert34(false, 'DEVERIA TER FALHADO: reabriu o período fechado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert34(v_erro like '%terminal%' or v_erro like '%não existe%',
      '⭐ o período fechado é terminal — o que vem é orçamento novo');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ O REALIZADO É CALCULADO DO LIVRO PROJETADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a projeção alimenta, a VIEW soma; fora do período/categoria não conta ==='

do $$
declare
  v_id uuid; v_real bigint; v_rem bigint; v_cnt int; v_efeito text;
begin
  -- A projeção é service_role: o cliente não a chama. Aqui, o dono do banco.
  reset role;

  -- Um orçamento ativo de Marketing, jul–set, BRL, teto 500.000.
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  insert into bud.budgets (tenant_id, name, category, starts_on, ends_on, limit_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Publicidade', 'Publicidade',
          '2026-07-01', '2026-09-30', 500000, 'BRL')
  returning id into v_id;
  update bud.budgets set status = 'active' where id = v_id;

  reset role;
  -- Desembolso de 120.000 na categoria e no período → conta.
  v_efeito := bud.record_external_movement(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'ENTRY-A',
    'Publicidade', 'BRL', '2026-07-15', -120000);
  perform pg_temp.assert34(v_efeito = 'projected', 'a projeção grava o lançamento');

  -- Desembolso de 80.000 na mesma categoria/período → soma.
  perform bud.record_external_movement(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'ENTRY-B',
    'Publicidade', 'BRL', '2026-08-10', -80000);

  -- Fora do período (outubro) → NÃO conta.
  perform bud.record_external_movement(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'ENTRY-C',
    'Publicidade', 'BRL', '2026-10-01', -50000);

  -- Outra categoria → NÃO conta.
  perform bud.record_external_movement(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'ENTRY-D',
    'Viagens', 'BRL', '2026-07-20', -30000);

  -- Outra moeda → NÃO conta.
  perform bud.record_external_movement(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'ENTRY-E',
    'Publicidade', 'USD', '2026-07-20', -40000);

  -- ⭐ Crédito (positivo) → a VIEW soma só o desembolso, então NÃO entra.
  perform bud.record_external_movement(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'ENTRY-F',
    'Publicidade', 'BRL', '2026-07-25', 25000);

  -- Lê a view como o dono do orçamento (security_invoker respeita a RLS).
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select realized_cents, remaining_cents, movement_count
    into v_real, v_rem, v_cnt
    from bud.budget_realized where budget_id = v_id;

  -- 120.000 + 80.000 = 200.000 (só os dois desembolsos que casam tudo).
  perform pg_temp.assert34(v_real = 200000, '⭐⭐ o realizado é a soma do que casa categoria+período+moeda — só desembolso');
  perform pg_temp.assert34(v_rem = 300000, '⭐ o saldo é teto − realizado, calculado na leitura');
  -- ENTRY-A, B, F casam categoria/moeda/período (F é crédito, mas conta como movimento);
  -- C (fora do período), D (outra categoria), E (outra moeda) não entram no join.
  perform pg_temp.assert34(v_cnt = 3, 'o movimento contado é o que casa o join (inclui o crédito do período)');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O CLIENTE NÃO ESCREVE A PROJEÇÃO; IDEMPOTÊNCIA; NADA DE COLUNA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: projeção só service_role; idempotente; realizado nunca é coluna ==='

do $$
declare v_efeito text; v_real bigint; v_id uuid;
begin
  -- ⭐ O cliente não escreve a projeção (sem grant de INSERT).
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    insert into bud.realized_movements
      (tenant_id, source_module_id, external_ref, category_name, currency, occurred_on, signed_amount_cents)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'HACK', 'Publicidade', 'BRL', '2026-07-01', -1);
    perform pg_temp.assert34(false, 'DEVERIA TER FALHADO: cliente escreveu a projeção');
  exception when insufficient_privilege then
    perform pg_temp.assert34(true, '⭐ o cliente não escreve a projeção (sem grant de INSERT)');
  end;

  -- ⭐ A projeção também não é chamável pelo cliente (revoke do 0044).
  begin
    perform bud.record_external_movement(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'HACK2', 'Publicidade', 'BRL', '2026-07-01', -1);
    perform pg_temp.assert34(false, 'DEVERIA TER FALHADO: cliente chamou a projeção');
  exception when insufficient_privilege then
    perform pg_temp.assert34(true, '⭐ bud.record_external_movement não é concedida ao cliente');
  end;

  -- ⭐ Idempotência: reprojetar a MESMA referência com o mesmo valor não soma.
  reset role;
  select id into v_id from bud.budgets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Publicidade';
  v_efeito := bud.record_external_movement(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'ENTRY-A',
    'Publicidade', 'BRL', '2026-07-15', -120000);
  perform pg_temp.assert34(v_efeito = 'unchanged', '⭐ reentrega idêntica não conta duas vezes (unchanged)');

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select realized_cents into v_real from bud.budget_realized where budget_id = v_id;
  perform pg_temp.assert34(v_real = 200000, 'o realizado seguiu 200.000 — a reentrega não dobrou');
end $$;

-- ⭐ Não existe coluna de realizado/saldo: só a VIEW as calcula.
do $$
declare v_cols int;
begin
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'bud'
     and table_name in ('budgets', 'realized_movements')
     and column_name in ('realized_cents', 'remaining_cents');
  perform pg_temp.assert34(v_cols = 0, '⭐ nenhuma coluna de realizado/saldo — só a view calcula');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ANON = NADA; APAGAR NÃO EXISTE; A CANETA DE EVENTO NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: anon barrado; sem DELETE; emit_event não concedida ==='

do $$
begin
  -- ⛔ ANON = NADA.
  set local role anon;
  begin
    perform count(*) from bud.budgets;
    perform pg_temp.assert34(false, 'DEVERIA TER FALHADO: anon leu os orçamentos');
  exception when insufficient_privilege then
    perform pg_temp.assert34(true, '⛔ anon = NADA no schema bud');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from bud.budgets where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;
  begin
    delete from bud.budgets where id = v_id;
    perform pg_temp.assert34(false, 'DEVERIA TER FALHADO: apagou orçamento');
  exception when insufficient_privilege then
    perform pg_temp.assert34(true, 'apagar orçamento não existe — fecha-se o período');
  end;

  begin
    perform bud.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bud.budget.opened', '{}'::jsonb);
    perform pg_temp.assert34(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert34(true, 'bud.emit_event não é concedida ao cliente');
  end;
end $$;

-- ⭐ E os fatos saíram: opened em cada criação, activated/closed conforme o ciclo.
do $$
declare v_opened int; v_activated int; v_closed int;
begin
  reset role;
  select count(*) into v_opened    from core.event_outbox where event_type = 'bud.budget.opened';
  select count(*) into v_activated from core.event_outbox where event_type = 'bud.budget.activated';
  select count(*) into v_closed    from core.event_outbox where event_type = 'bud.budget.closed';
  perform pg_temp.assert34(v_opened >= 3,    'bud.budget.opened saiu a cada criação');
  perform pg_temp.assert34(v_activated >= 3, 'bud.budget.activated saiu a cada ativação');
  perform pg_temp.assert34(v_closed >= 1,    'bud.budget.closed saiu ao fechar');
end $$;

\echo ''
\echo '=== MÓDULO 29 OK: a trave congela, o realizado é calculado do livro, tenants isolados ==='
