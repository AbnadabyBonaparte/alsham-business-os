-- =============================================================================
-- DATA NO FUSO DO TENANT — `core.tenants.timezone` + `core.tenant_today` (0119).
-- Prova: ⭐⭐ a MESMA `due_date` classifica "vencido" de forma DIFERENTE conforme
-- o fuso de cada tenant — não é mais assunção do servidor (UTC). ⭐ o fuso é
-- VALIDADO (string qualquer é recusada). ⭐ a função é FECHADA ao anon.
-- =============================================================================
--
-- ⭐ Core, não módulo. Ids LITERAIS dentro dos blocos `do $$`. Dado 100%
-- fabricado, banco efêmero. Dois fusos 25h apart (Kiritimati +14 × Midway -11,
-- ambos SEM horário de verão): a data local difere SEMPRE, em qualquer instante
-- em que o CI rode — o teste é determinístico, não depende da virada do dia.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert108(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

-- Dois tenants: LESTE (Pacific/Kiritimati, UTC+14) e OESTE (Pacific/Midway, UTC-11).
do $$
begin
  reset role;  -- privilégio de serviço (no teste, o dono do banco)
  insert into core.tenants (id, slug, name, plan_code, timezone) values
    ('11111111-0000-4000-8000-00000000fee1', 'tz-leste', 'Fuso Leste', 'pro', 'Pacific/Kiritimati'),
    ('11111111-0000-4000-8000-00000000fee2', 'tz-oeste', 'Fuso Oeste', 'pro', 'Pacific/Midway')
  on conflict (id) do update set timezone = excluded.timezone;
end $$;

\echo ''
\echo '=== CENÁRIO 1: o fuso faz "hoje" DIFERIR — a raiz do bug ==='

do $$
declare v_leste date; v_oeste date;
begin
  reset role;
  v_leste := core.tenant_today('11111111-0000-4000-8000-00000000fee1');
  v_oeste := core.tenant_today('11111111-0000-4000-8000-00000000fee2');
  -- 25h de diferença ⇒ a data local do LESTE é SEMPRE estritamente à frente da do
  -- OESTE, em qualquer instante. Nunca a mesma — é o que `current_date` (UTC) ignorava.
  perform pg_temp.assert108(v_leste > v_oeste,
    '⭐⭐ tenant_today(LESTE +14) > tenant_today(OESTE -11) — o fuso muda o "hoje"');
end $$;

\echo ''
\echo '=== CENÁRIO 2: a MESMA due_date classifica vencido DIFERENTE por fuso ==='

do $$
declare v_venc_leste int; v_venc_oeste int; v_due date;
begin
  reset role;
  -- A due_date é o "hoje" do OESTE (a data mais antiga dos dois).
  v_due := core.tenant_today('11111111-0000-4000-8000-00000000fee2');

  -- Um título IDÊNTICO (mesma due_date) para cada tenant.
  insert into ar.receivables (tenant_id, external_ref, due_date, amount_cents, received_amount_cents, currency, status) values
    ('11111111-0000-4000-8000-00000000fee1', 'r-leste', v_due, 10000, 0, 'BRL', 'open'),
    ('11111111-0000-4000-8000-00000000fee2', 'r-oeste', v_due, 10000, 0, 'BRL', 'open')
  on conflict do nothing;

  -- A MESMA regra do observador (due_date < core.tenant_today(tenant)), por tenant.
  select count(*) into v_venc_leste from ar.receivables
   where tenant_id = '11111111-0000-4000-8000-00000000fee1'
     and status = 'open' and due_date < core.tenant_today('11111111-0000-4000-8000-00000000fee1');

  select count(*) into v_venc_oeste from ar.receivables
   where tenant_id = '11111111-0000-4000-8000-00000000fee2'
     and status = 'open' and due_date < core.tenant_today('11111111-0000-4000-8000-00000000fee2');

  -- Para o OESTE, a due_date É hoje → NÃO vencido (due < hoje é falso).
  perform pg_temp.assert108(v_venc_oeste = 0,
    '⭐ OESTE: due_date = hoje-dele → NÃO vencido');
  -- Para o LESTE, já é o dia seguinte → o MESMO título está vencido.
  perform pg_temp.assert108(v_venc_leste = 1,
    '⭐⭐ LESTE: a MESMA due_date → VENCIDO (porque lá já é amanhã). Não é mais assunção do servidor.');
end $$;

\echo ''
\echo '=== CENÁRIO 3: fuso inválido é RECUSADO (validado contra pg_timezone_names) ==='

do $$
declare v_erro boolean := false;
begin
  reset role;
  begin
    update core.tenants set timezone = 'Marte/Base_Alfa'
     where id = '11111111-0000-4000-8000-00000000fee1';
  exception when others then v_erro := true;
  end;
  perform pg_temp.assert108(v_erro, '⭐ "Marte/Base_Alfa" recusado — só fuso IANA real entra');
end $$;

\echo ''
\echo '=== CENÁRIO 4: tenant_today é FECHADA ao anon (a lição do 0022) ==='

do $$
declare v_negado boolean := false;
begin
  set role anon;
  begin
    perform core.tenant_today('11111111-0000-4000-8000-00000000fee1');
  exception when insufficient_privilege then v_negado := true;
  end;
  reset role;
  perform pg_temp.assert108(v_negado, '⭐ anon NÃO executa core.tenant_today');
end $$;

\echo ''
\echo '✅ 108_tenant_timezone_isolation OK'
