-- =============================================================================
-- O INSIGHT PROATIVO NO BANCO — a superfície `core.tenant_insights` (0116) que
-- se isola: ⭐ só o service_role ESCREVE (record/clear concedidos só a ele), ⭐ o
-- tenant lê só o PRÓPRIO quadro (a função checa o vínculo, molde do 0021), ⭐ a
-- tabela nua é FECHADA ao authenticated (a única porta é o leitor), ⭐⭐ o
-- escritor RECUSA frase/tipo vazios (Lei 7), e ⭐ o upsert reescreve no lugar.
-- =============================================================================
--
-- ⭐ É CORE, não módulo: sem manifesto, fora da Store. Roda depois do
-- `01_rls_isolation.sql` (usa os tenants Alfa/Beta e os usuários dele).
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
--
-- ⚠️ Os ids são LITERAIS dentro dos blocos `do $$` de propósito: psql não
-- interpola `:variavel` dentro de corpo dollar-quoted (a mesma razão pela qual
-- os testes de módulo escrevem os UUIDs à mão). Alfa = tenant aaaa / user 1111;
-- Beta = tenant bbbb / user 2222 (criados pelo 01_rls_isolation).
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert106(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== CENÁRIO 1: o service_role grava; o Alfa lê o próprio; o número é preservado ==='

do $$
declare v_n int; v_metric bigint; v_head text;
begin
  -- O observador agendado roda com service_role.
  reset role;  -- privilégio de serviço (no teste, o dono do banco)
  perform core.record_tenant_insight(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue', 'BRL',
    '2 títulos vencidos — BRL 1500.00 a receber.',
    'O mais antigo venceu há 30 dias. Vale priorizar a cobrança.',
    2, 150000, 'BRL');
  perform pg_temp.assert106(true, 'o service_role grava um aviso (record_tenant_insight)');

  -- O Alfa, autenticado, lê o PRÓPRIO quadro pela função.
  reset role;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select count(*) into v_n from core.tenant_insights_recent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
  perform pg_temp.assert106(v_n = 1, 'o Alfa vê o próprio aviso pela função leitora');

  select metric_value, headline into v_metric, v_head
    from core.tenant_insights_recent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) limit 1;
  perform pg_temp.assert106(v_metric = 2, '⭐ o número verdadeiro é preservado (2 vencidos)');
  perform pg_temp.assert106(v_head like '2 títulos vencidos%', 'a frase determinística chega inteira');
end $$;

\echo ''
\echo '=== CENÁRIO 2: ISOLAMENTO — o Beta não lê o quadro do Alfa (o vínculo é checado) ==='

do $$
declare v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  -- Pedir o quadro de um tenant do qual não se é membro é recusado na 1ª linha.
  begin
    perform 1 from core.tenant_insights_recent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
    perform pg_temp.assert106(false, 'DEVERIA TER FALHADO: o Beta leu o quadro do Alfa');
  exception when insufficient_privilege then
    perform pg_temp.assert106(true, '⭐ o Beta é barrado no quadro do Alfa (sem vínculo)');
  end;

  -- E o próprio quadro do Beta está vazio — nada vazou para ele.
  select count(*) into v_n from core.tenant_insights_recent('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
  perform pg_temp.assert106(v_n = 0, 'o quadro do Beta está vazio — nada do vizinho');
end $$;

\echo ''
\echo '=== CENÁRIO 3: a tabela nua e as portas de escrita são FECHADAS ao tenant ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- A tabela nua não se lê: a única porta é a função leitora.
  begin
    perform 1 from core.tenant_insights limit 1;
    perform pg_temp.assert106(false, 'DEVERIA TER FALHADO: authenticated leu a tabela nua');
  exception when insufficient_privilege then
    perform pg_temp.assert106(true, '⭐ a tabela nua é fechada — só a função leitora expõe');
  end;

  -- O tenant NÃO fabrica o próprio aviso: record é do service_role.
  begin
    perform core.record_tenant_insight('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue', 'BRL', 'forjado', '', 9, 9, 'BRL');
    perform pg_temp.assert106(false, 'DEVERIA TER FALHADO: o tenant gravou um aviso');
  exception when insufficient_privilege then
    perform pg_temp.assert106(true, '⭐ record_tenant_insight não é concedida ao authenticated');
  end;

  -- Nem apaga.
  begin
    perform core.clear_tenant_insight('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue');
    perform pg_temp.assert106(false, 'DEVERIA TER FALHADO: o tenant limpou o quadro');
  exception when insufficient_privilege then
    perform pg_temp.assert106(true, '⭐ clear_tenant_insight não é concedida ao authenticated');
  end;
end $$;

\echo ''
\echo '=== CENÁRIO 4: ⭐⭐ Lei 7 — o escritor recusa tipo/frase vazios ==='

do $$
begin
  reset role;  -- privilégio de serviço (no teste, o dono do banco)

  begin
    perform core.record_tenant_insight('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, '', 'BRL', 'tem frase', '', 1, 1, 'BRL');
    perform pg_temp.assert106(false, 'DEVERIA TER FALHADO: aviso sem tipo');
  exception when check_violation then
    perform pg_temp.assert106(true, '⭐ tipo vazio é recusado');
  end;

  begin
    perform core.record_tenant_insight('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue', 'BRL', '   ', '', 1, 1, 'BRL');
    perform pg_temp.assert106(false, 'DEVERIA TER FALHADO: aviso sem frase');
  exception when check_violation then
    perform pg_temp.assert106(true, '⭐⭐ frase vazia é recusada (Lei 7: aviso sem número/frase não vai ao ar)');
  end;
end $$;

\echo ''
\echo '=== CENÁRIO 5: ⭐ o upsert reescreve no lugar; clear apaga; o quadro nunca duplica ==='

do $$
declare v_n int; v_metric bigint;
begin
  reset role;  -- privilégio de serviço (no teste, o dono do banco)

  -- Reescreve o MESMO (tenant, tipo, moeda): a leitura mais recente vence.
  perform core.record_tenant_insight(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue', 'BRL', '3 títulos vencidos — BRL 2000.00 a receber.', '', 3, 200000, 'BRL');

  reset role;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select count(*), max(metric_value) into v_n, v_metric
    from core.tenant_insights_recent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) where kind = 'ar-overdue' and subject_key = 'BRL';
  perform pg_temp.assert106(v_n = 1, '⭐ um aviso, não dois — o upsert reescreveu no lugar');
  perform pg_temp.assert106(v_metric = 3, 'e o número é o da última leitura (3, não 2)');

  -- O problema some → o serviço limpa → o aviso some.
  reset role;  -- privilégio de serviço (no teste, o dono do banco)
  perform core.clear_tenant_insight('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue');

  reset role;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select count(*) into v_n from core.tenant_insights_recent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
  perform pg_temp.assert106(v_n = 0, '⭐⭐ limpo o problema, o aviso some — o quadro não mente sobre o hoje');
end $$;

\echo ''
\echo '=== CENÁRIO 6: anon não encosta em nada ==='

do $$
begin
  set local role anon;

  begin
    perform 1 from core.tenant_insights limit 1;
    perform pg_temp.assert106(false, 'DEVERIA TER FALHADO: anon leu a tabela');
  exception when insufficient_privilege then
    perform pg_temp.assert106(true, '⭐ anon não encosta na tabela');
  end;

  begin
    perform 1 from core.tenant_insights_recent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
    perform pg_temp.assert106(false, 'DEVERIA TER FALHADO: anon chamou a leitora');
  exception when insufficient_privilege then
    perform pg_temp.assert106(true, '⭐ a função leitora não é concedida a anon');
  end;

  reset role;
end $$;

\echo ''
\echo '=== INSIGHT PROATIVO OK: escreve o serviço, lê o dono do tenant, isola, recusa vazio, upsert reescreve, anon fora ==='
