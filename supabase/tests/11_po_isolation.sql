-- =============================================================================
-- MÓDULO 6 — isolamento, unicidade, transições, itens e permissões
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert11(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: instalar po nos tenants Alfa/Beta ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'po', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'po', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- Papel do tenant Alfa: manage + cancel + receive
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.perm, 'po'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values
    ('po.order.manage'),
    ('po.order.cancel'),
    ('po.order.receive')
  ) as p(perm)
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

-- Beta: só manage (sem cancel / receive) — para provar que as permissões mordem
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'po.order.manage', 'po'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '22222222-2222-4222-8222-222222222222'
on conflict (role_id, permission_key) do nothing;

\echo ''
\echo '=== CENÁRIO 1: registrar pedido com itens; total bate ==='

do $$
declare
  v_order_id uuid;
  v_total bigint;
  v_sum bigint;
  v_payload jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into po.orders (tenant_id, external_ref, currency, supplier_name, description)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PO-ALFA-0001', 'BRL',
    'Fornecedor Alfa', 'pedido teste'
  ) returning id into v_order_id;

  insert into po.order_items (
    tenant_id, order_id, line_no, description, quantity, unit_amount_cents
  ) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_order_id, 1, 'Item A', 10, 1000),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_order_id, 2, 'Item B', 2.5, 400);

  reset role;

  select total_cents into v_total from po.orders where id = v_order_id;
  select coalesce(sum(line_total_cents), 0) into v_sum
    from po.order_items where order_id = v_order_id;

  perform pg_temp.assert11(v_total = v_sum, 'total do cabeçalho = soma das linhas');
  perform pg_temp.assert11(v_total = 11000, 'total = 10*1000 + 2.5*400 = 11000');

  select payload into v_payload
    from core.event_outbox
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and event_type = 'po.order.registered'
   order by created_at desc limit 1;

  perform pg_temp.assert11(v_payload is not null, 'evento po.order.registered saiu');
  perform pg_temp.assert11((v_payload->>'externalRef') = 'PO-ALFA-0001', 'payload com ref');
end;
$$;

\echo ''
\echo '=== CENÁRIO 2: unicidade da referência por tenant ==='

do $$
declare v_ok boolean := false;
begin
  begin
    insert into po.orders (tenant_id, external_ref, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PO-ALFA-0001', 'BRL');
  exception when unique_violation then
    v_ok := true;
  end;
  perform pg_temp.assert11(v_ok, 'mesma ref no mesmo tenant é recusada');

  insert into po.orders (tenant_id, external_ref, currency)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'PO-ALFA-0001', 'BRL');
  perform pg_temp.assert11(true, 'mesma ref em outro tenant é permitida');
end;
$$;

\echo ''
\echo '=== CENÁRIO 3: isolamento — Alfa não vê Beta ==='

do $$
declare v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select count(*) into v_n from po.orders;
  reset role;
  perform pg_temp.assert11(v_n = 1, 'Alfa vê só o próprio pedido (n=' || v_n || ')');
end;
$$;

\echo ''
\echo '=== CENÁRIO 4: enviar, receber parcial, over-receive, cancelar ==='

do $$
declare
  v_order_id uuid;
  v_item_id uuid;
  v_status text;
  v_ok boolean := false;
begin
  select id into v_order_id from po.orders
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'PO-ALFA-0001';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  update po.orders set status = 'submitted' where id = v_order_id;
  select status into v_status from po.orders where id = v_order_id;
  perform pg_temp.assert11(v_status = 'submitted', 'draft → submitted');

  select id into v_item_id from po.order_items
   where order_id = v_order_id and line_no = 1;

  update po.order_items set qty_received = 4 where id = v_item_id;
  select status into v_status from po.orders where id = v_order_id;
  perform pg_temp.assert11(v_status = 'partially_received', 'recebimento parcial');

  -- Completa linha 1 e over-receive na linha 2
  update po.order_items set qty_received = 10 where id = v_item_id;
  update po.order_items set qty_received = 3
   where order_id = v_order_id and line_no = 2;
  select status into v_status from po.orders where id = v_order_id;
  perform pg_temp.assert11(v_status = 'received', 'over-receive ⇒ received');

  -- received → cancelled deve falhar
  begin
    update po.orders set status = 'cancelled' where id = v_order_id;
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.assert11(v_ok, 'received → cancelled recusado');

  reset role;
end;
$$;

\echo ''
\echo '=== CENÁRIO 5: cancelar exige permissão; Beta sem cancel ==='

do $$
declare
  v_order_id uuid;
  v_ok boolean := false;
begin
  insert into po.orders (tenant_id, external_ref, currency, description)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'PO-ALFA-CANCEL', 'BRL', 'para cancelar')
  returning id into v_order_id;

  insert into po.order_items (tenant_id, order_id, line_no, description, quantity, unit_amount_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_order_id, 1, 'X', 1, 100);

  -- Beta tenta cancelar pedido do Beta (só tem manage)
  insert into po.orders (tenant_id, external_ref, currency)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'PO-BETA-001', 'BRL')
  returning id into v_order_id;

  insert into po.order_items (tenant_id, order_id, line_no, description, quantity, unit_amount_cents)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_order_id, 1, 'Y', 1, 50);

  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  begin
    update po.orders set status = 'cancelled' where id = v_order_id;
  exception when insufficient_privilege then
    v_ok := true;
  when others then
    if sqlstate = '42501' then v_ok := true; end if;
  end;
  reset role;
  perform pg_temp.assert11(v_ok, 'Beta sem po.order.cancel não cancela');

  -- Alfa cancela o rascunho dela
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  update po.orders set status = 'cancelled'
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'PO-ALFA-CANCEL';
  reset role;
  perform pg_temp.assert11(
    (select status from po.orders
      where external_ref = 'PO-ALFA-CANCEL'
        and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 'cancelled',
    'Alfa com cancel consegue cancelar draft');
end;
$$;

\echo ''
\echo '=== CENÁRIO 6: authenticated sem DELETE em orders ==='

do $$
declare v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    delete from po.orders
     where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
       and external_ref = 'PO-ALFA-CANCEL';
  exception when insufficient_privilege then
    v_ok := true;
  when others then
    if sqlstate = '42501' then v_ok := true; end if;
  end;
  reset role;
  perform pg_temp.assert11(v_ok, 'authenticated não deleta pedido');
  perform pg_temp.assert11(
    exists (
      select 1 from po.orders
       where external_ref = 'PO-ALFA-CANCEL'
         and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    ),
    'pedido cancelado continua no banco');
end;
$$;

\echo ''
\echo '=== 11_po_isolation: OK ==='
