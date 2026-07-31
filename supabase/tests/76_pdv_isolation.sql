-- =============================================================================
-- O MÓDULO 71 NO BANCO — a VENDA (PDV) que se isola: nasce draft, o servidor
-- carimba o autor, FINALIZAR exige item e CONGELA, cancelar exige razão, os
-- fins são TERMINAIS, e o total é VIEW. ⭐ O DIVERGE do rfq: sem estado
-- intermediário — a venda fecha na hora.
-- =============================================================================
--
-- ⭐ Vertical 🛒 Varejo & Supermercados (Onda Dezoito, Fase 2) — o PRIMEIRO
-- módulo do vertical retail. PDV é "integra-se por padrão" (Lei 3); o bastão é
-- a decisão de dono. Registra a VENDA COMERCIAL, nunca o documento fiscal.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert76(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: pdv instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'pdv', 'Ponto de Venda (PDV)', '0.1.0',
  'A venda comercial (não o documento fiscal): cabeçalho + itens, congela ao finalizar, draft → completed/cancelled terminais.',
  'vertical', 'retail',
  '[{"key":"pos","canonicalName":"PDV"}]'::jsonb,
  '[{"key":"pdv.sale.manage","moduleId":"pdv","description":"Registrar e finalizar vendas."}]'::jsonb,
  '[{"type":"pdv.sale.registered","version":1,"description":"Registrada."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pdv', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pdv', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'pdv.sale.manage', 'pdv'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE DRAFT, ISOLA, O SERVIDOR CARIMBA O AUTOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce draft; created_by do servidor; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into pdv.sales (tenant_id, operator, payment_method, discount_cents, currency, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Balcão 1', 'dinheiro', 0, 'BRL',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert76(v_st = 'draft', 'a venda nasce em rascunho');
  perform pg_temp.assert76(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from pdv.sales;
  perform pg_temp.assert76(v_n = 0, 'o Beta não vê a venda do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — FINALIZAR EXIGE ITEM; O TOTAL É VIEW (bruto − desconto)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: finalizar exige item; net = bruto − desconto (VIEW) ==='

do $$
declare v_id uuid; v_net bigint; v_gross bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into pdv.sales (tenant_id, operator, payment_method, discount_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Balcão 1', 'pix', 500, 'BRL')
  returning id into v_id;

  -- finalizar cupom vazio: recusado.
  begin
    update pdv.sales set status = 'completed' where id = v_id;
    perform pg_temp.assert76(false, 'DEVERIA TER FALHADO: finalizar venda sem item');
  exception when invalid_parameter_value then
    perform pg_temp.assert76(true, '⭐ finalizar exige ao menos um item');
  end;

  insert into pdv.sale_items (tenant_id, sale_id, line_no, product_name, quantity, unit_price_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 1, 'Pão francês', 10, 150);

  select gross_cents, net_cents into v_gross, v_net from pdv.sale_totals where sale_id = v_id;
  perform pg_temp.assert76(v_gross = 1500, 'bruto = soma das linhas (10 × 150)');
  perform pg_temp.assert76(v_net = 1000, '⭐ líquido = bruto − desconto (1500 − 500)');

  update pdv.sales set status = 'completed' where id = v_id;
  perform pg_temp.assert76(
    (select status = 'completed' and completed_at is not null from pdv.sales where id = v_id),
    'finalizou e carimbou completed_at');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ CONGELA: a venda finalizada não muda (item nem cabeçalho)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: fechada, os itens e o cabeçalho congelam ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from pdv.sales
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and payment_method = 'pix' and status = 'completed';

  begin
    insert into pdv.sale_items (tenant_id, sale_id, line_no, product_name, quantity, unit_price_cents)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 2, 'Leite', 1, 500);
    perform pg_temp.assert76(false, 'DEVERIA TER FALHADO: inserir item em venda fechada');
  exception when invalid_parameter_value then
    perform pg_temp.assert76(true, '⭐ item não entra em venda fechada — refazer é venda nova');
  end;

  begin
    update pdv.sales set discount_cents = 999 where id = v_id;
    perform pg_temp.assert76(false, 'DEVERIA TER FALHADO: editar cabeçalho de venda fechada');
  exception when invalid_parameter_value then
    perform pg_temp.assert76(true, '⭐ o cabeçalho congela depois de fechar');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CANCELAR EXIGE RAZÃO; OS FINS SÃO TERMINAIS (o DIVERGE do rfq)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cancelar exige razão; cancelada/concluída não reabrem ==='

do $$
declare v_id uuid; v_done uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into pdv.sales (tenant_id, operator, payment_method, discount_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Balcão 2', 'cartão', 0, 'BRL')
  returning id into v_id;

  begin
    update pdv.sales set status = 'cancelled' where id = v_id;  -- sem razão
    perform pg_temp.assert76(false, 'DEVERIA TER FALHADO: cancelar sem razão');
  exception when invalid_parameter_value then
    perform pg_temp.assert76(true, 'cancelar exige uma razão');
  end;

  update pdv.sales set status = 'cancelled', cancel_reason = 'cliente desistiu' where id = v_id;
  perform pg_temp.assert76((select status = 'cancelled' from pdv.sales where id = v_id), 'cancelou com razão');

  -- cancelada é TERMINAL — não reabre.
  begin
    update pdv.sales set status = 'draft' where id = v_id;
    perform pg_temp.assert76(false, 'DEVERIA TER FALHADO: reabrir venda cancelada');
  exception when invalid_parameter_value then
    perform pg_temp.assert76(true, '⭐ venda cancelada não reabre (o DIVERGE do rfq: sem volta)');
  end;

  -- concluída também é TERMINAL.
  select id into v_done from pdv.sales
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status = 'completed' limit 1;
  begin
    update pdv.sales set status = 'draft' where id = v_done;
    perform pg_temp.assert76(false, 'DEVERIA TER FALHADO: reabrir venda concluída');
  exception when invalid_parameter_value then
    perform pg_temp.assert76(true, '⭐ venda concluída não reabre');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT, A CANETA, ANON, E OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into pdv.sales (tenant_id, operator, payment_method, discount_cents, currency)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 'x', 0, 'BRL');
    perform pg_temp.assert76(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert76(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform pdv.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pdv.sale.registered', '{}'::jsonb);
    perform pg_temp.assert76(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert76(true, 'pdv.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from pdv.sales limit 1;
    perform pg_temp.assert76(false, 'DEVERIA TER FALHADO: anon leu pdv.sales');
  exception when insufficient_privilege then
    perform pg_temp.assert76(true, '⭐ anon não encosta em pdv.sales');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'pdv.sale.registered';
  perform pg_temp.assert76(v_n >= 3, 'cada venda registrada emitiu pdv.sale.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'pdv.sale.completed';
  perform pg_temp.assert76(v_n >= 1, 'finalizar emitiu pdv.sale.completed');
  select count(*) into v_n from core.event_outbox where event_type = 'pdv.sale.cancelled';
  perform pg_temp.assert76(v_n >= 1, 'cancelar emitiu pdv.sale.cancelled');
end $$;

\echo ''
\echo '=== MÓDULO 71 OK: venda isolada, carimbo do servidor, congela ao fechar, fins terminais, anon fora ==='
