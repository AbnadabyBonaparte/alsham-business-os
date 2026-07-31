-- =============================================================================
-- O MÓDULO 74 NO BANCO — o LIVRO DE PONTOS que se isola: lançamento IMUTÁVEL
-- (as duas camadas), a direção no entry_type (earn/redeem), points > 0, o saldo
-- é VIEW, e ⭐⭐ resgatar mais que o saldo é RECUSADO (a física do invest).
-- =============================================================================
--
-- ⭐ Vertical 🛒 Varejo & Supermercados (Onda Dezoito, Fase 2) — o QUARTO e
-- último módulo do vertical retail.
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert79(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: loyalty instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'loyalty', 'Fidelidade', '0.1.0',
  'O livro de pontos: lançamento imutável, direção no entry_type (earn/redeem), points > 0, saldo é VIEW; resgatar mais que o saldo é recusado.',
  'vertical', 'retail',
  '[{"key":"loyalty","canonicalName":"Fidelidade"}]'::jsonb,
  '[{"key":"loyalty.entry.manage","moduleId":"loyalty","description":"Lançar pontos (ganhar/resgatar)."}]'::jsonb,
  '[{"type":"loyalty.points.earned","version":1,"description":"Ganhou."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'loyalty', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'loyalty', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'loyalty.entry.manage', 'loyalty'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- Um cliente fabricado (id solto ao crm — não há FK, é só um uuid).
\set cust '33333333-3333-4333-8333-333333333333'

-- =============================================================================
-- CENÁRIO 1 — GANHAR PONTOS: ISOLA, O SERVIDOR CARIMBA O AUTOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: earn cria; created_by do servidor; isola ==='

do $$
declare v_id uuid; v_by uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into loyalty.entries (tenant_id, customer_id, customer_name, entry_type, points, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
          'Cliente Fiel', 'earn', 100, '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_by;

  perform pg_temp.assert79(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from loyalty.entries;
  perform pg_temp.assert79(v_n = 0, 'o Beta não vê o movimento do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — points > 0 E entry_type ∈ (earn, redeem) (a física do método)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: points > 0; entry_type só earn/redeem ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into loyalty.entries (tenant_id, customer_id, entry_type, points)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'earn', 0);
    perform pg_temp.assert79(false, 'DEVERIA TER FALHADO: points = 0');
  exception when check_violation then
    perform pg_temp.assert79(true, '⭐ points > 0 (zero não é movimento)');
  end;

  begin
    insert into loyalty.entries (tenant_id, customer_id, entry_type, points)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'bonus', 10);
    perform pg_temp.assert79(false, 'DEVERIA TER FALHADO: entry_type inválido');
  exception when check_violation then
    perform pg_temp.assert79(true, '⭐ entry_type só earn/redeem (a física do método)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ IMUTÁVEL: AS DUAS CAMADAS (cliente sem porta; nem o dono)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o movimento é fato consumado — não se edita nem se apaga ==='

do $$
declare v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from loyalty.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and entry_type = 'earn' limit 1;

  -- CAMADA 1 — o cliente não tem porta de UPDATE.
  begin
    update loyalty.entries set points = 999 where id = v_id;
    perform pg_temp.assert79(false, 'DEVERIA TER FALHADO: cliente editou um movimento');
  exception when insufficient_privilege then
    perform pg_temp.assert79(true, '⭐ CAMADA 1: o cliente não edita — não há porta de UPDATE');
  end;

  -- CAMADA 2 — nem o dono do banco: o gatilho recusa.
  reset role;
  begin
    update loyalty.entries set points = 999 where id = v_id;
    perform pg_temp.assert79(false, 'DEVERIA TER FALHADO: o dono reescreveu o movimento');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert79(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2: nem o dono reescreve — o movimento é fato consumado');
  end;

  begin
    delete from loyalty.entries where id = v_id;
    perform pg_temp.assert79(false, 'DEVERIA TER FALHADO: o dono apagou o movimento');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert79(v_erro like '%fato consumado%', '⭐⭐ nem o dono apaga — corrigir é lançar o ato inverso');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — O SALDO É VIEW (Σ earn − Σ redeem); resgatar dentro do saldo OK
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: saldo = earn − redeem (VIEW); resgate dentro do saldo passa ==='

do $$
declare v_saldo bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- resgate de 30 sobre saldo 100: passa.
  insert into loyalty.entries (tenant_id, customer_id, customer_name, entry_type, points, reason)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
          'Cliente Fiel', 'redeem', 30, 'troca — brinde');

  select balance_points into v_saldo from loyalty.customer_balances
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and customer_id = '33333333-3333-4333-8333-333333333333';
  perform pg_temp.assert79(v_saldo = 70, '⭐ o saldo é VIEW: 100 ganhos − 30 resgatados = 70');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐⭐ A TERCEIRA RESPOSTA: resgatar mais que o saldo é RECUSADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: ninguém resgata o que não tem (a física do invest) ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into loyalty.entries (tenant_id, customer_id, entry_type, points)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'redeem', 999);
    perform pg_temp.assert79(false, 'DEVERIA TER FALHADO: resgatar mais que o saldo');
  exception when invalid_parameter_value then
    perform pg_temp.assert79(true, '⭐⭐ resgatar mais que o saldo é recusado (a física do invest)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — CROSS-TENANT, A CANETA, ANON, E OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into loyalty.entries (tenant_id, customer_id, entry_type, points)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'earn', 10);
    perform pg_temp.assert79(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert79(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform loyalty.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'loyalty.points.earned', '{}'::jsonb);
    perform pg_temp.assert79(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert79(true, 'loyalty.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from loyalty.entries limit 1;
    perform pg_temp.assert79(false, 'DEVERIA TER FALHADO: anon leu loyalty.entries');
  exception when insufficient_privilege then
    perform pg_temp.assert79(true, '⭐ anon não encosta em loyalty.entries');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'loyalty.points.earned';
  perform pg_temp.assert79(v_n >= 1, 'ganhar pontos emitiu loyalty.points.earned');
  select count(*) into v_n from core.event_outbox where event_type = 'loyalty.points.redeemed';
  perform pg_temp.assert79(v_n >= 1, 'resgatar pontos emitiu loyalty.points.redeemed');
end $$;

\echo ''
\echo '=== MÓDULO 74 OK: livro isolado, imutável (2 camadas), points>0, saldo é VIEW, resgate > saldo recusado, anon fora ==='
