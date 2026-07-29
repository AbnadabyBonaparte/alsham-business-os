-- =============================================================================
-- TRIÂNGULO DO CRÉDITO — ar emite, recon projeta (receivables)
-- =============================================================================
-- Roda depois de 07_ar_isolation.sql. Prova:
--   1. título AR → outbox → record_external_receivable → recon.receivables
--   2. origem = producedBy do envelope (não constante)
--   3. reentrega idempotente
--   4. receber a maior é aceito na projeção
--   5. authenticated NÃO chama a RPC
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert8(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: módulo ar nos tenants Alfa/Beta ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ar', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ar', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ar.receivable.manage', 'ar'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo ''
\echo '=== CENÁRIO 1: registrar AR emite e a projeção grava ==='

do $$
declare
  v_payload jsonb;
  v_produtor text;
  v_efeito text;
  v_n int;
  v_origem text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into ar.receivables
    (tenant_id, external_ref, due_date, amount_cents, currency, counterparty_name, description)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-CRED-0001', '2026-09-10',
     200000, 'BRL', 'Cliente Alfa', 'serviço faturado');

  reset role;

  select payload, produced_by into v_payload, v_produtor
    from core.event_outbox
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and event_type = 'ar.receivable.registered'
   order by created_at desc
   limit 1;

  perform pg_temp.assert8(v_payload is not null, 'evento ar.receivable.registered saiu');
  perform pg_temp.assert8(v_produtor = 'ar', 'produced_by é ar');
  perform pg_temp.assert8((v_payload->>'externalRef') = 'DOC-CRED-0001', 'payload autossuficiente');

  -- Correio (service_role) projeta — sem chumbar o produtor na RPC.
  select recon.record_external_receivable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    v_produtor,
    v_payload->>'externalRef',
    (v_payload->>'dueDate')::date,
    (v_payload->>'amountCents')::bigint,
    (v_payload->>'currency')::char(3),
    v_payload->>'status',
    coalesce((v_payload->>'receivedAmountCents')::bigint, 0),
    v_payload->>'counterpartyName',
    v_payload->>'counterpartyTaxId',
    v_payload->>'description'
  ) into v_efeito;

  perform pg_temp.assert8(v_efeito = 'created', 'projeção criada');

  select count(*), max(source_module_id) into v_n, v_origem
    from recon.receivables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-CRED-0001';

  perform pg_temp.assert8(v_n = 1, 'uma projeção');
  perform pg_temp.assert8(v_origem = 'ar', 'origem gravada = envelope');
end;
$$;

\echo ''
\echo '=== CENÁRIO 2: reentrega não duplica ==='

do $$
declare v_efeito text; v_n int;
begin
  select recon.record_external_receivable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ar', 'DOC-CRED-0001',
    '2026-09-10', 200000, 'BRL', 'open', 0, 'Cliente Alfa', null, 'serviço faturado'
  ) into v_efeito;
  perform pg_temp.assert8(v_efeito = 'unchanged', 'reentrega = unchanged');

  select count(*) into v_n from recon.receivables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-CRED-0001';
  perform pg_temp.assert8(v_n = 1, 'ainda uma linha');
end;
$$;

\echo ''
\echo '=== CENÁRIO 3: receber a maior é aceito na projeção ==='

do $$
declare v_efeito text; v_recv bigint;
begin
  select recon.record_external_receivable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ar', 'DOC-CRED-0001',
    '2026-09-10', 200000, 'BRL', 'received', 250000, 'Cliente Alfa', null, 'serviço faturado'
  ) into v_efeito;
  perform pg_temp.assert8(v_efeito = 'updated', 'update com over-receive');

  select received_amount_cents into v_recv from recon.receivables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-CRED-0001';
  perform pg_temp.assert8(v_recv = 250000, 'received 250000 > amount 200000');
end;
$$;

\echo ''
\echo '=== CENÁRIO 4: authenticated não chama a RPC ==='

do $$
declare v_ok boolean := false;
begin
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
    perform recon.record_external_receivable(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ar', 'HACK', '2026-09-10',
      1, 'BRL', 'open', 0, null, null, null
    );
  exception when insufficient_privilege or undefined_function then
    v_ok := true;
  when others then
    -- revoke costuma dar permission denied
    if sqlstate = '42501' then v_ok := true; end if;
  end;
  reset role;
  perform pg_temp.assert8(v_ok, 'authenticated sem EXECUTE na RPC');
end;
$$;

\echo ''
\echo '=== CENÁRIO 5: match XOR — crédito só com receivable_id ==='

do $$
declare
  v_recv_id uuid;
  v_line_id uuid;
  v_stmt_id uuid;
begin
  select id into v_recv_id from recon.receivables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-CRED-0001';

  insert into recon.bank_statements (
    id, tenant_id, account_ref, source_format, content_hash,
    period_start, period_end, currency, status
  ) values (
    gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'conta-demo', 'manual', 'hash-cred-001',
    '2026-09-01', '2026-09-30', 'BRL', 'imported'
  ) returning id into v_stmt_id;

  insert into recon.statement_lines (
    id, tenant_id, statement_id, line_no, posted_at, amount_cents, currency, description, status
  ) values (
    gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_stmt_id,
    1, '2026-09-10', 200000, 'BRL', 'PIX DOC-CRED-0001', 'unmatched'
  ) returning id into v_line_id;

  insert into recon.reconciliation_matches (
    tenant_id, statement_line_id, receivable_id, matched_amount_cents,
    score, origin, strategy, status
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_line_id, v_recv_id, 200000,
    0.9500, 'auto', 'amount+date+reference', 'suggested'
  );

  perform pg_temp.assert8(
    (select count(*) = 1 from recon.reconciliation_matches
      where receivable_id = v_recv_id and payable_id is null),
    'match de crédito com receivable_id e payable_id null'
  );
end;
$$;

\echo ''
\echo '=== 08_ar_recon_triangle: OK ==='
