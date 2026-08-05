-- =============================================================================
-- O LIVRO DE HISTÓRICO DO INSIGHT NO BANCO — `core.tenant_insight_history` (0118),
-- o "arreio" que faz o observador ANALISAR (comparar hoje × média recente).
-- Prova: ⭐ APPEND-ONLY (o mesmo recorte grava linha nova a cada rodada, não
-- reescreve), ⭐⭐ IMUTÁVEL em DUAS camadas (nem o dono do banco edita/apaga),
-- ⭐ a média é CONTADA do livro, ⭐ o livro é FECHADO ao authenticated e ao anon
-- (o tenant vê a tendência na frase do tenant_insights, não no livro cru).
-- =============================================================================
--
-- ⭐ Core, não módulo. Roda depois do `01_rls_isolation.sql`. Ids LITERAIS dentro
-- dos blocos `do $$` (psql não interpola em corpo dollar-quoted). Alfa = tenant
-- aaaa / user 1111. Dado 100% fabricado. Banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert107(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== CENÁRIO 1: APPEND-ONLY — o mesmo recorte grava linha NOVA a cada rodada ==='

do $$
declare v_n int;
begin
  reset role;  -- privilégio de serviço (no teste, o dono do banco)

  perform core.record_insight_history('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue', 'BRL', 2, 40000, 'BRL');
  perform core.record_insight_history('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue', 'BRL', 4, 80000, 'BRL');

  select count(*) into v_n from core.tenant_insight_history
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind = 'ar-overdue' and subject_key = 'BRL';
  perform pg_temp.assert107(v_n = 2, '⭐ duas leituras do mesmo recorte = DUAS linhas (append-only, não upsert)');
end $$;

\echo ''
\echo '=== CENÁRIO 2: a média é CONTADA do livro (base da tendência) ==='

do $$
declare v_sample bigint; v_avg numeric;
begin
  reset role;  -- privilégio de serviço
  select sample_count, avg_metric into v_sample, v_avg
    from core.insight_history_baseline('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue', 'BRL', 10);
  perform pg_temp.assert107(v_sample = 2, 'a base viu 2 leituras');
  perform pg_temp.assert107(v_avg = 3, '⭐ média contada: (2 + 4) / 2 = 3 — nunca estimada (Lei 7)');
end $$;

\echo ''
\echo '=== CENÁRIO 3: ⭐⭐ IMUTÁVEL — nem o dono do banco edita ou apaga uma leitura ==='

do $$
declare v_id uuid; v_erro text;
begin
  reset role;  -- o DONO do banco
  select id into v_id from core.tenant_insight_history
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    update core.tenant_insight_history set metric_value = 999 where id = v_id;
    perform pg_temp.assert107(false, 'DEVERIA TER FALHADO: o dono editou uma leitura');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert107(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2 (update): nem o dono reescreve o histórico');
  end;

  begin
    delete from core.tenant_insight_history where id = v_id;
    perform pg_temp.assert107(false, 'DEVERIA TER FALHADO: o dono apagou uma leitura');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert107(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2 (delete): nem o dono apaga o histórico');
  end;
end $$;

\echo ''
\echo '=== CENÁRIO 4: FECHADO ao tenant — nem lê a tabela, nem chama as funções ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform 1 from core.tenant_insight_history limit 1;
    perform pg_temp.assert107(false, 'DEVERIA TER FALHADO: authenticated leu a tabela nua');
  exception when insufficient_privilege then
    perform pg_temp.assert107(true, '⭐ a tabela nua é fechada ao tenant (a tendência vem na frase do tenant_insights)');
  end;

  begin
    perform core.record_insight_history('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue', 'BRL', 9, 9, 'BRL');
    perform pg_temp.assert107(false, 'DEVERIA TER FALHADO: o tenant gravou no livro');
  exception when insufficient_privilege then
    perform pg_temp.assert107(true, '⭐ record_insight_history não é concedida ao authenticated');
  end;

  begin
    perform 1 from core.insight_history_baseline('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'ar-overdue', 'BRL', 10);
    perform pg_temp.assert107(false, 'DEVERIA TER FALHADO: o tenant leu a média direto');
  exception when insufficient_privilege then
    perform pg_temp.assert107(true, '⭐ insight_history_baseline não é concedida ao authenticated');
  end;
end $$;

\echo ''
\echo '=== CENÁRIO 5: Lei 7 — o escritor recusa tipo vazio; anon fora ==='

do $$
begin
  reset role;  -- privilégio de serviço
  begin
    perform core.record_insight_history('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, '', 'BRL', 1, 1, 'BRL');
    perform pg_temp.assert107(false, 'DEVERIA TER FALHADO: leitura sem tipo');
  exception when check_violation then
    perform pg_temp.assert107(true, '⭐ tipo vazio é recusado (Lei 7)');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from core.tenant_insight_history limit 1;
    perform pg_temp.assert107(false, 'DEVERIA TER FALHADO: anon leu o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert107(true, '⭐ anon não encosta no livro');
  end;
  reset role;
end $$;

\echo ''
\echo '=== LIVRO DE HISTÓRICO OK: append-only, média contada, imutável (2 camadas), fechado ao tenant, anon fora ==='
