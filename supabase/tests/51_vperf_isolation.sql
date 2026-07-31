-- =============================================================================
-- O MÓDULO 46 NO BANCO — a avaliação de fornecedor que se isola, o autor e a
-- hora carimbados pelo servidor, o ato imutável e a nota presa à régua 0–100
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as avaliações de um tenant não aparecem no outro (isolamento);
--   2. ⭐ **o avaliador e a hora são carimbados pelo servidor** — o que o
--      cliente mentir no INSERT é descartado;
--   3. ⭐ **a avaliação é IMUTÁVEL** — update e delete são recusados até para
--      o cliente com permissão (fato consumado, o DIVERGE do perf sem o ciclo);
--   4. ⭐ **a nota vive presa a 0–100** — 150 bate no CHECK e é recusada;
--   5. a caneta de emitir evento não é do cliente; e o `anon` não encosta na
--      tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert51(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: vperf instalado nos dois tenants; ambos registram avaliação ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vperf', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'vperf', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'vperf.appraisal.record', 'vperf'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants registram avaliação de fornecedor.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O AUTOR E A HORA CARIMBADOS PELO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu livro; autor e hora do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_appraiser uuid; v_at timestamptz;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor E a hora no INSERT. O gatilho descarta os dois.
  insert into vperf.appraisals
    (tenant_id, supplier_id, supplier_name, rating, summary, source_kind, appraiser_id, appraised_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '99999999-9999-4999-8999-999999999999', 'Aço Bonaparte', 88,
          'Entregou no prazo, qualidade constante.', 'recebimento',
          '22222222-2222-4222-8222-222222222222', '1999-01-01T00:00:00Z')
  returning id, appraiser_id, appraised_at into v_id, v_appraiser, v_at;

  perform pg_temp.assert51(
    v_appraiser = '11111111-1111-4111-8111-111111111111',
    '⭐ appraiser_id é quem está autenticado — o autor mentido no INSERT foi descartado');
  perform pg_temp.assert51(
    v_at > '2020-01-01'::timestamptz,
    '⭐ appraised_at é a hora do servidor — a hora mentida (1999) foi descartada');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into vperf.appraisals (tenant_id, supplier_id, supplier_name, rating, summary)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          '88888888-8888-4888-8888-888888888888', 'Fornecedor B', 50, 'Regular.');

  select count(*) into v_n from vperf.appraisals;
  perform pg_temp.assert51(v_n = 1, 'o Beta enxerga só o livro dele');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'vperf.appraisal.recorded';
  perform pg_temp.assert51(v_n = 2, 'os dois fatos de avaliação registrada saíram');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ IMUTÁVEL: A AVALIAÇÃO NÃO SE EDITA NEM SE APAGA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: fato consumado — update e delete recusados (o DIVERGE do perf sem ciclo) ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from vperf.appraisals
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE nem DELETE (sem grant):
  -- barrado antes de o gatilho de imutabilidade rodar.
  begin
    update vperf.appraisals set summary = 'reescrevendo a história' where id = v_id;
    perform pg_temp.assert51(false, 'DEVERIA TER FALHADO: editou a avaliação');
  exception when insufficient_privilege then
    perform pg_temp.assert51(true, '⭐ o cliente não edita — não há porta de UPDATE');
  end;

  begin
    delete from vperf.appraisals where id = v_id;
    perform pg_temp.assert51(false, 'DEVERIA TER FALHADO: apagou a avaliação');
  exception when insufficient_privilege then
    perform pg_temp.assert51(true, '⭐ o cliente não apaga — não há porta de DELETE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: com privilégio, ele alcança o gatilho,
  -- e o gatilho recusa. As duas leis, provadas no mesmo cenário.
  reset role;
  begin
    update vperf.appraisals set summary = 'reescrito pelo dono' where id = v_id;
    perform pg_temp.assert51(false, 'DEVERIA TER FALHADO: o dono reescreveu a avaliação');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert51(
      v_erro like '%fato consumado%' or v_erro like '%não se edita%',
      '⭐ nem o dono reescreve — a avaliação é fato consumado');
  end;

  begin
    delete from vperf.appraisals where id = v_id;
    perform pg_temp.assert51(false, 'DEVERIA TER FALHADO: o dono apagou a avaliação');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert51(
      v_erro like '%fato consumado%' or v_erro like '%não se edita%',
      '⭐ nem o dono apaga — corrigir é registrar outra');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A NOTA VIVE PRESA A 0–100: 150 BATE NO CHECK
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a régua do método — nota fora de 0–100 é recusada ==='

do $$
declare
  v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into vperf.appraisals (tenant_id, supplier_id, supplier_name, rating, summary)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '99999999-9999-4999-8999-999999999999', 'Aço Bonaparte', 150, 'Nota impossível.');
    perform pg_temp.assert51(false, 'DEVERIA TER FALHADO: nota 150 fora da régua');
  exception when check_violation then
    perform pg_temp.assert51(true, '⭐ a nota vive presa a 0–100 — 150 bate no CHECK');
  end;

  -- Os limites 0 e 100 são válidos.
  insert into vperf.appraisals (tenant_id, supplier_id, supplier_name, rating, summary)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '99999999-9999-4999-8999-999999999999', 'Aço Bonaparte', 0, 'O pior recebimento do mês.');
  insert into vperf.appraisals (tenant_id, supplier_id, supplier_name, rating, summary)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '99999999-9999-4999-8999-999999999999', 'Aço Bonaparte', 100, 'Impecável.');
  perform pg_temp.assert51(true, 'os limites 0 e 100 passam');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO LIVRO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
declare
  v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into vperf.appraisals (tenant_id, supplier_id, supplier_name, rating, summary)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            '88888888-8888-4888-8888-888888888888', 'Invasor', 10, 'Bisbilhotando.');
    perform pg_temp.assert51(false, 'DEVERIA TER FALHADO: o Alfa escreveu no livro do Beta');
  exception when others then
    perform pg_temp.assert51(true, '⭐ cross-tenant barrado: o Alfa não avalia no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: emit_event não é concedida; anon barrado ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform vperf.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vperf.appraisal.recorded', '{}'::jsonb);
    perform pg_temp.assert51(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert51(true, 'vperf.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from vperf.appraisals limit 1;
    perform pg_temp.assert51(false, 'DEVERIA TER FALHADO: anon leu vperf.appraisals');
  exception when insufficient_privilege then
    perform pg_temp.assert51(true, '⭐ anon não encosta em vperf.appraisals');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 46 OK: livro isolado, avaliador do servidor, ato imutável, nota 0–100, anon fora ==='
