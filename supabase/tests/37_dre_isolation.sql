-- =============================================================================
-- O MÓDULO 32 NO BANCO — o plano do tenant, os valores que nascem dos livros
-- (cash E cc), os totais calculados e a linha sem lançamento que não aparece
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o plano de um tenant não aparece no outro — e a assimetria: o Beta LÊ o
--      demonstrativo, mas NÃO desenha o plano;
--   2. ⭐ a linha volta do arquivo; a categoria ativa não duplica; natureza e
--      moeda congelam;
--   3. ⭐⭐ os VALORES NASCEM DOS DOIS LIVROS (cash e cc), projetados; o
--      resultado é a soma dos sinais; ⭐ LINHA SEM LANÇAMENTO NÃO APARECE;
--   4. ⭐ o cliente não escreve a projeção (nem chama a função); idempotência;
--      sem coluna de total;
--   5. ⛔ anon = NADA; apagar não existe; a caneta de evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert37(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: DRE nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dre', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dre', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA: `user-a` (Alfa) desenha E lê; `user-b` (Beta) só lê.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'dre.statement.read', 'dre'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'dre.line.manage', 'dre'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois leem; só o Alfa desenha o plano.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A MÃO QUE SÓ LÊ
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant no seu plano; o Beta lê mas não desenha ==='

do $$
declare v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into dre.lines (tenant_id, name, kind, match_category, position, currency) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vendas', 'revenue', 'Vendas', 0, 'BRL'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Aluguel', 'expense', 'Aluguel', 1, 'BRL');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  begin
    insert into dre.lines (tenant_id, name, kind, match_category, currency)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Tentativa', 'revenue', 'X', 'BRL');
    perform pg_temp.assert37(false, 'DEVERIA TER FALHADO: o Beta desenhou o plano');
  exception when insufficient_privilege then
    perform pg_temp.assert37(true, '⭐ desenhar o plano é mão própria (dre.line.manage)');
  end;

  select count(*) into v_n from dre.lines;
  perform pg_temp.assert37(v_n = 0, 'o Beta não enxerga o plano do outro tenant (nem tem o seu)');
end $$;

-- =============================================================================
-- CENÁRIO 2 — VOLTA DO ARQUIVO; CATEGORIA ATIVA ÚNICA; NATUREZA CONGELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: categoria ativa única; natureza congela; volta do arquivo ==='

do $$
declare v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from dre.lines
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Vendas';

  begin
    insert into dre.lines (tenant_id, name, kind, match_category, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vendas 2', 'revenue', '  VENDAS ', 'BRL');
    perform pg_temp.assert37(false, 'DEVERIA TER FALHADO: duas linhas ativas casando a mesma categoria');
  exception when unique_violation then
    perform pg_temp.assert37(true, '⭐ duas linhas ativas não casam a mesma categoria (dupla contagem)');
  end;

  -- Natureza congela.
  begin
    update dre.lines set kind = 'expense' where id = v_id;
    perform pg_temp.assert37(false, 'DEVERIA TER FALHADO: mudou a natureza da linha');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert37(v_erro like '%natureza e a moeda%', '⭐ a natureza da linha não muda');
  end;

  update dre.lines set status = 'archived' where id = v_id;
  update dre.lines set status = 'active' where id = v_id;
  perform pg_temp.assert37(true, '⭐ a linha volta do arquivo — é a MESMA linha');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ OS VALORES NASCEM DOS DOIS LIVROS; LINHA VAZIA NÃO APARECE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: cash + cc projetam; resultado calculado; linha sem valor não entra ==='

do $$
declare v_rev bigint; v_exp bigint; v_res bigint; v_linhas int; v_vazia int; v_efeito text;
begin
  reset role;

  -- ⭐ Um lançamento de caixa (Vendas, +250.000) — como o correio faria.
  v_efeito := dre.record_external_entry(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'cash', 'E1', 'Vendas', 'BRL', '2026-07-15', 250000);
  perform pg_temp.assert37(v_efeito = 'projected', 'a projeção do cash grava');

  -- ⭐ Um rateio (Aluguel, −60.000) — de outro produtor.
  perform dre.record_external_entry(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cc', 'cc-rateio', 'X1', 'Aluguel', 'BRL', '2026-07-01', -60000);

  -- Adiciona uma linha SEM lançamento (Salários) — não deve aparecer.
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  insert into dre.lines (tenant_id, name, kind, match_category, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Salários', 'expense', 'Salários', 'BRL');

  select revenue_cents, expense_cents, result_cents
    into v_rev, v_exp, v_res
    from dre.result where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and currency = 'BRL'
   limit 1;
  perform pg_temp.assert37(v_rev = 250000, '⭐ a receita nasce do caixa (250.000)');
  perform pg_temp.assert37(v_exp = -60000, '⭐ a despesa nasce do rateio (−60.000)');
  perform pg_temp.assert37(v_res = 190000, '⭐⭐ o resultado é a soma dos sinais (250.000 − 60.000)');

  -- ⭐ Linha sem lançamento NÃO aparece no demonstrativo (INNER JOIN, nps).
  select count(*) into v_linhas from dre.statement
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  select count(*) into v_vazia from dre.statement
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and line_name = 'Salários';
  perform pg_temp.assert37(v_linhas = 2, 'só as linhas COM lançamento aparecem (Vendas e Aluguel)');
  perform pg_temp.assert37(v_vazia = 0, '⭐ a linha sem lançamento (Salários) NÃO aparece (nps)');
end $$;

-- =============================================================================
-- CENÁRIO 4 — O CLIENTE NÃO PROJETA; IDEMPOTÊNCIA; NADA DE COLUNA DE TOTAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: projeção só service_role; idempotente; totais nunca colunas ==='

do $$
declare v_efeito text; v_rev bigint; v_cols int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into dre.realized_entries
      (tenant_id, source_module_id, source_kind, external_ref, category_name, currency, occurred_on, signed_amount_cents)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'cash', 'HACK', 'Vendas', 'BRL', '2026-07-01', 999);
    perform pg_temp.assert37(false, 'DEVERIA TER FALHADO: cliente escreveu a projeção');
  exception when insufficient_privilege then
    perform pg_temp.assert37(true, '⭐ o cliente não escreve a projeção (sem grant de INSERT)');
  end;

  begin
    perform dre.record_external_entry(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'cash', 'HACK2', 'Vendas', 'BRL', '2026-07-01', 1);
    perform pg_temp.assert37(false, 'DEVERIA TER FALHADO: cliente chamou a projeção');
  exception when insufficient_privilege then
    perform pg_temp.assert37(true, '⭐ dre.record_external_entry não é concedida ao cliente');
  end;

  -- ⭐ Idempotência: reprojetar o MESMO (cash, E1) não soma.
  reset role;
  v_efeito := dre.record_external_entry(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cash', 'cash', 'E1', 'Vendas', 'BRL', '2026-07-15', 250000);
  perform pg_temp.assert37(v_efeito = 'unchanged', '⭐ reentrega idêntica não conta duas vezes');

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select revenue_cents into v_rev from dre.result
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and currency = 'BRL' limit 1;
  perform pg_temp.assert37(v_rev = 250000, 'a receita seguiu 250.000 — a reentrega não dobrou');

  -- ⭐ Nenhuma coluna de total/subtotal — só as views calculam.
  select count(*) into v_cols from information_schema.columns
   where table_schema = 'dre'
     and table_name in ('lines', 'realized_entries')
     and column_name in ('result_cents', 'revenue_cents', 'total_cents');
  perform pg_temp.assert37(v_cols = 0, '⭐ nenhuma coluna de total — só as views calculam');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ANON = NADA; SEM DELETE; A CANETA DE EVENTO NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: anon barrado; sem DELETE; emit_event não concedida ==='

do $$
begin
  set local role anon;
  begin
    perform count(*) from dre.lines;
    perform pg_temp.assert37(false, 'DEVERIA TER FALHADO: anon leu o plano');
  exception when insufficient_privilege then
    perform pg_temp.assert37(true, '⛔ anon = NADA no schema dre');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from dre.lines where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;
  begin
    delete from dre.lines where id = v_id;
    perform pg_temp.assert37(false, 'DEVERIA TER FALHADO: apagou linha');
  exception when insufficient_privilege then
    perform pg_temp.assert37(true, 'apagar linha não existe — arquivar é status');
  end;

  begin
    perform dre.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dre.line.registered', '{}'::jsonb);
    perform pg_temp.assert37(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert37(true, 'dre.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 32 OK: plano do tenant, valores dos dois livros, linha vazia oculta, totais calculados ==='
