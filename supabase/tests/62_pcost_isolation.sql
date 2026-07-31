-- =============================================================================
-- O MÓDULO 57 NO BANCO — o livro de custos de projeto que se isola, o carimbo
-- do servidor, a imutabilidade do fato e ⭐⭐ o gasto SEM TRAVE (o DIVERGE do fund)
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os custos de um tenant não aparecem no outro;
--   2. ⭐ **quem/quando são carimbados pelo servidor** — o recorded_by/at
--      mentidos no INSERT são descartados;
--   3. ⭐⭐ **SEM TRAVE DE SALDO** — um valor ENORME (positivo E negativo) entra
--      sem recusa; não há saldo a defender (o DIVERGE do fund);
--   4. ⭐⭐ **IMUTÁVEL** — reescrever E apagar o custo os dois RAISE (nem o dono
--      do banco reescreve o fato consumado — as DUAS camadas);
--   5. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela; e cross-tenant é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert62(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: pcost instalado nos dois tenants; os dois registram ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pcost', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pcost', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'pcost.entry.record', 'pcost'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois registram custos de projeto.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E O CARIMBO DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu livro; quem/quando do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_by uuid; v_at timestamptz;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor E a hora no INSERT. O gatilho descarta os dois.
  insert into pcost.entries (tenant_id, project_id, project_name, amount_cents, currency, category, incurred_on, recorded_by, recorded_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Obra Central', 150000, 'BRL', 'Materiais', '2026-07-31',
          '22222222-2222-4222-8222-222222222222', '1999-01-01 00:00:00+00')
  returning id, recorded_by, recorded_at into v_id, v_by, v_at;

  perform pg_temp.assert62(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ recorded_by é quem está autenticado — o autor mentido no INSERT foi descartado');
  perform pg_temp.assert62(
    v_at > '2020-01-01 00:00:00+00',
    '⭐ recorded_at é do servidor — a hora mentida (1999) foi descartada');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into pcost.entries (tenant_id, project_id, amount_cents, currency)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 4200, 'BRL');

  select count(*) into v_n from pcost.entries;
  perform pg_temp.assert62(v_n = 1, 'o Beta enxerga só o custo dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ SEM TRAVE DE SALDO: valor ENORME (positivo E negativo) entra
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: um custo enorme e um estorno enorme entram — não há saldo ==='

do $$
declare
  v_pos bigint; v_neg bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Um gasto gigantesco. Não há "orçamento do projeto" contra o qual recusar
  -- (o DIVERGE do fund, que confere saldo e recusa o negativo).
  insert into pcost.entries (tenant_id, project_id, amount_cents, currency, category, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 999999999999, 'BRL', 'Equipamento', 'compra vultosa')
  returning amount_cents into v_pos;

  perform pg_temp.assert62(v_pos = 999999999999,
    '⭐⭐ custo enorme entra sem trave de saldo (o DIVERGE do fund)');

  -- Sinal LIVRE: um estorno gigantesco (crédito) — a correção pelo ato inverso.
  insert into pcost.entries (tenant_id, project_id, amount_cents, currency, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', -999999999999, 'BRL', 'estorno integral')
  returning amount_cents into v_neg;

  perform pg_temp.assert62(v_neg = -999999999999,
    '⭐ estorno (valor negativo) é aceito — corrigir é lançar o ato inverso');

  -- Só zero é recusado (linha muda).
  begin
    insert into pcost.entries (tenant_id, project_id, amount_cents, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 0, 'BRL');
    perform pg_temp.assert62(false, 'DEVERIA TER FALHADO: um custo de valor zero');
  exception when check_violation then
    perform pg_temp.assert62(true, '⭐ zero é recusado — é linha muda, não custo');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ IMUTÁVEL: REESCREVER E APAGAR OS DOIS RAISE (as DUAS camadas)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o custo é fato consumado — não se edita nem se apaga ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from pcost.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and category = 'Materiais';

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE nem DELETE (sem grant):
  -- é barrado antes mesmo de o gatilho de imutabilidade rodar.
  begin
    update pcost.entries set note = 'corrigindo' where id = v_id;
    perform pg_temp.assert62(false, 'DEVERIA TER FALHADO: editou um custo');
  exception when insufficient_privilege then
    perform pg_temp.assert62(true, '⭐ o cliente não edita — não há porta de UPDATE');
  end;

  begin
    delete from pcost.entries where id = v_id;
    perform pg_temp.assert62(false, 'DEVERIA TER FALHADO: apagou um custo');
  exception when insufficient_privilege then
    perform pg_temp.assert62(true, '⭐ o cliente não apaga — não há porta de DELETE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: com privilégio para escrever, ele
  -- alcança o gatilho, e o gatilho recusa. É a diferença entre "sem porta" e
  -- "fato consumado" — as duas leis, provadas no mesmo cenário.
  reset role;
  begin
    update pcost.entries set note = 'reescrito pelo dono' where id = v_id;
    perform pg_temp.assert62(false, 'DEVERIA TER FALHADO: o dono reescreveu o custo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert62(v_erro like '%fato consumado%', '⭐ nem o dono reescreve — o custo é fato consumado');
  end;

  begin
    delete from pcost.entries where id = v_id;
    perform pg_temp.assert62(false, 'DEVERIA TER FALHADO: o dono apagou o custo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert62(v_erro like '%fato consumado%', '⭐ nem o dono apaga — corrigir é lançar outro, com nota');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO LIVRO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into pcost.entries (tenant_id, project_id, amount_cents, currency)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 'BRL');
    perform pg_temp.assert62(false, 'DEVERIA TER FALHADO: o Alfa escreveu no livro do Beta');
  exception when others then
    perform pg_temp.assert62(true, '⭐ cross-tenant barrado: o Alfa não registra no tenant do Beta');
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
    perform pcost.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pcost.entry.recorded', '{}'::jsonb);
    perform pg_temp.assert62(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert62(true, 'pcost.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from pcost.entries limit 1;
    perform pg_temp.assert62(false, 'DEVERIA TER FALHADO: anon leu pcost.entries');
  exception when insufficient_privilege then
    perform pg_temp.assert62(true, '⭐ anon não encosta em pcost.entries');
  end;
  reset role;
end $$;

-- =============================================================================
-- CONFERÊNCIA FINAL — os fatos saíram para a caixa de saída do Core
-- =============================================================================
\echo ''
\echo '=== CONFERÊNCIA: os custos viraram fato no correio ==='

do $$
declare
  v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'pcost.entry.recorded';
  perform pg_temp.assert62(v_n >= 4, 'cada custo gravado emitiu pcost.entry.recorded');
end $$;

\echo ''
\echo '=== MÓDULO 57 OK: livro isolado, carimbo do servidor, imutável, gasto sem trave, anon fora ==='
