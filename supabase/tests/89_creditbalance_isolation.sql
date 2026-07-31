-- =============================================================================
-- O MÓDULO 84 NO BANCO — o LIVRO DE CRÉDITOS que se isola: lançamento IMUTÁVEL
-- (as duas camadas), a direção no credit_type (generated/consumed), quantity_kwh
-- > 0, o saldo é VIEW, e ⭐⭐ consumir mais que o saldo é RECUSADO (a física da
-- compensação — energia não se deve, se gera).
-- =============================================================================
--
-- ⭐ Vertical ☀️ Energia (Onda Vinte, Fase 3) — o QUARTO e último módulo.
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert89(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: creditbalance instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'creditbalance', 'Créditos de Compensação', '0.1.0',
  'O livro de créditos de energia: lançamento imutável, direção no credit_type, quantity_kwh > 0, saldo é VIEW; consumir mais que o saldo é recusado.',
  'vertical', 'energy',
  '[{"key":"compensation-credits","canonicalName":"Créditos de compensação"}]'::jsonb,
  '[{"key":"creditbalance.entry.manage","moduleId":"creditbalance","description":"Lançar crédito."}]'::jsonb,
  '[{"type":"creditbalance.credit.generated","version":1,"description":"Gerado."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'creditbalance', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'creditbalance', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'creditbalance.entry.manage', 'creditbalance'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- Uma assinatura fabricada (id solto — não há FK, é só um uuid).
\set sub '55555555-5555-4555-8555-555555555555'

-- =============================================================================
-- CENÁRIO 1 — GERAR CRÉDITO: ISOLA, O SERVIDOR CARIMBA O AUTOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: generated cria; created_by do servidor; isola ==='

do $$
declare v_id uuid; v_by uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into creditbalance.entries (tenant_id, credit_type, quantity_kwh, subscription_id, subscription_name, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'generated', 500, '55555555-5555-4555-8555-555555555555',
          'Assinatura UC-3', '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_by;

  perform pg_temp.assert89(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from creditbalance.entries;
  perform pg_temp.assert89(v_n = 0, 'o Beta não vê o lançamento do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — quantity_kwh > 0 E credit_type ∈ (generated, consumed)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: quantity_kwh > 0; credit_type só generated/consumed ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into creditbalance.entries (tenant_id, credit_type, quantity_kwh)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'generated', 0);
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: quantity_kwh = 0');
  exception when check_violation then
    perform pg_temp.assert89(true, '⭐ quantity_kwh > 0 (zero não é lançamento)');
  end;

  begin
    insert into creditbalance.entries (tenant_id, credit_type, quantity_kwh)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bonus', 10);
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: credit_type inválido');
  exception when check_violation then
    perform pg_temp.assert89(true, '⭐ credit_type só generated/consumed (a física da compensação)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ IMUTÁVEL: AS DUAS CAMADAS (cliente sem porta; nem o dono)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o lançamento é fato consumado — não se edita nem se apaga ==='

do $$
declare v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from creditbalance.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and credit_type = 'generated' limit 1;

  -- CAMADA 1 — o cliente não tem porta de UPDATE.
  begin
    update creditbalance.entries set quantity_kwh = 999 where id = v_id;
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: cliente editou um lançamento');
  exception when insufficient_privilege then
    perform pg_temp.assert89(true, '⭐ CAMADA 1: o cliente não edita — não há porta de UPDATE');
  end;

  -- CAMADA 2 — nem o dono do banco: o gatilho recusa.
  reset role;
  begin
    update creditbalance.entries set quantity_kwh = 999 where id = v_id;
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: o dono reescreveu o lançamento');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert89(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2: nem o dono reescreve — o lançamento é fato consumado');
  end;

  begin
    delete from creditbalance.entries where id = v_id;
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: o dono apagou o lançamento');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert89(v_erro like '%fato consumado%', '⭐⭐ nem o dono apaga — corrigir é lançar o ato inverso');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — O SALDO É VIEW (Σ generated − Σ consumed); consumo dentro OK
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: saldo = generated − consumed (VIEW); consumo dentro do saldo passa ==='

do $$
declare v_saldo numeric;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- consumo de 200 sobre saldo 500: passa.
  insert into creditbalance.entries (tenant_id, credit_type, quantity_kwh, subscription_id, subscription_name, reason)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'consumed', 200, '55555555-5555-4555-8555-555555555555',
          'Assinatura UC-3', 'compensação de julho');

  select balance_kwh into v_saldo from creditbalance.subscription_balances
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and subscription_id = '55555555-5555-4555-8555-555555555555';
  perform pg_temp.assert89(v_saldo = 300, '⭐ o saldo é VIEW: 500 gerados − 200 consumidos = 300');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐⭐ A TERCEIRA RESPOSTA: consumir mais que o saldo é RECUSADO
-- (a física da compensação — energia não se deve, se gera)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: ninguém compensa energia que não gerou ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into creditbalance.entries (tenant_id, credit_type, quantity_kwh, subscription_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'consumed', 999, '55555555-5555-4555-8555-555555555555');
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: consumir mais que o saldo');
  exception when invalid_parameter_value then
    perform pg_temp.assert89(true, '⭐⭐ consumir mais que o saldo é recusado (energia não se deve, se gera)');
  end;

  -- E a conta é POR ASSINATURA (o bucket): outra assinatura tem saldo próprio (zero).
  begin
    insert into creditbalance.entries (tenant_id, credit_type, quantity_kwh, subscription_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'consumed', 1, '66666666-6666-4666-8666-666666666666');
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: consumir de assinatura sem saldo');
  exception when invalid_parameter_value then
    perform pg_temp.assert89(true, '⭐ a conta é por assinatura: outra assinatura tem saldo próprio');
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
    insert into creditbalance.entries (tenant_id, credit_type, quantity_kwh)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'generated', 10);
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert89(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform creditbalance.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'creditbalance.credit.generated', '{}'::jsonb);
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert89(true, 'creditbalance.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from creditbalance.entries limit 1;
    perform pg_temp.assert89(false, 'DEVERIA TER FALHADO: anon leu creditbalance.entries');
  exception when insufficient_privilege then
    perform pg_temp.assert89(true, '⭐ anon não encosta em creditbalance.entries');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'creditbalance.credit.generated';
  perform pg_temp.assert89(v_n >= 1, 'gerar crédito emitiu creditbalance.credit.generated');
  select count(*) into v_n from core.event_outbox where event_type = 'creditbalance.credit.consumed';
  perform pg_temp.assert89(v_n >= 1, 'consumir crédito emitiu creditbalance.credit.consumed');
end $$;

\echo ''
\echo '=== MÓDULO 84 OK: livro isolado, imutável (2 camadas), quantity>0, saldo é VIEW, consumo > saldo recusado, anon fora ==='
