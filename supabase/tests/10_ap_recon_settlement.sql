-- =============================================================================
-- CICLO FECHADO (DÉBITO) — recon confirma match → AP liquida o título
-- =============================================================================
-- Autossuficiente: NÃO reusa DOC-TRI-0001 do 05 (esse título é cancelado no
-- cenário 6). Cria título, projeção, extrato, match e liquida.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert10(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: título AP fresco + projeção + extrato ==='

do $$
declare
  v_pay_id   uuid;
  v_stmt_id  uuid;
  v_line_id  uuid;
  v_match_id uuid;
  v_payload  jsonb;
  v_produtor text;
  v_efeito   text;
  v_status   text;
  v_settled  bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into ap.payables
    (tenant_id, external_ref, due_date, amount_cents, currency, supplier_name, description)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-AP-SETTLE-0001', '2026-10-15',
     88000, 'BRL', 'Fornecedor Settle', 'ciclo débito');

  reset role;

  select recon.record_external_payable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap', 'DOC-AP-SETTLE-0001',
    '2026-10-15', 88000, 'BRL', 'open', 0, 'Fornecedor Settle', null, 'ciclo débito'
  ) into v_efeito;
  perform pg_temp.assert10(v_efeito = 'created', 'projeção criada');

  select id into v_pay_id from recon.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-AP-SETTLE-0001';

  insert into recon.bank_statements (
    id, tenant_id, account_ref, source_format, content_hash,
    period_start, period_end, currency, status
  ) values (
    gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'conta-ap-settle', 'manual', 'hash-ap-settlement-001',
    '2026-10-01', '2026-10-31', 'BRL', 'imported'
  ) returning id into v_stmt_id;

  insert into recon.statement_lines (
    id, tenant_id, statement_id, line_no, posted_at, amount_cents, currency, description, status
  ) values (
    gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_stmt_id,
    1, '2026-10-15', -88000, 'BRL', 'PAG DOC-AP-SETTLE-0001', 'unmatched'
  ) returning id into v_line_id;

  insert into recon.reconciliation_matches (
    tenant_id, statement_line_id, payable_id, matched_amount_cents,
    score, origin, strategy, status, decided_at
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_line_id, v_pay_id, 88000,
    0.9500, 'auto', 'amount+date+reference', 'confirmed', now()
  ) returning id into v_match_id;

  select payload, produced_by into v_payload, v_produtor
    from core.event_outbox
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and event_type = 'recon.match.decided'
     and payload->>'externalRef' = 'DOC-AP-SETTLE-0001'
   order by created_at desc
   limit 1;

  perform pg_temp.assert10(v_payload is not null, 'evento recon.match.decided saiu');
  perform pg_temp.assert10((v_payload->>'targetKind') = 'payable', 'alvo payable');
  perform pg_temp.assert10(v_produtor = 'recon', 'produced_by é recon');

  select ap.apply_recon_match(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    v_produtor,
    (v_payload->>'matchId')::uuid,
    v_payload->>'externalRef',
    (v_payload->>'matchedAmountCents')::bigint,
    (v_payload->>'currency')::char(3),
    v_payload->>'decision',
    v_payload->>'targetKind'
  ) into v_efeito;

  perform pg_temp.assert10(v_efeito = 'applied', 'liquidação AP aplicada');

  select status, settled_amount_cents into v_status, v_settled
    from ap.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-AP-SETTLE-0001';

  perform pg_temp.assert10(v_status = 'settled', 'título AP ficou settled');
  perform pg_temp.assert10(v_settled = 88000, 'settled_amount = 88000');
end;
$$;

\echo ''
\echo '=== CENÁRIO 2: reentrega e overpay ==='

do $$
declare v_efeito text; v_settled bigint;
begin
  select ap.apply_recon_match(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon',
    (select (payload->>'matchId')::uuid from core.event_outbox
      where event_type = 'recon.match.decided'
        and payload->>'externalRef' = 'DOC-AP-SETTLE-0001'
      order by created_at desc limit 1),
    'DOC-AP-SETTLE-0001', 88000, 'BRL', 'confirmed', 'payable'
  ) into v_efeito;
  perform pg_temp.assert10(v_efeito = 'unchanged', 'reentrega = unchanged');

  select ap.apply_recon_match(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon',
    '77777777-7777-4777-8777-777777777777',
    'DOC-AP-SETTLE-0001', 1, 'BRL', 'confirmed', 'payable'
  ) into v_efeito;
  perform pg_temp.assert10(v_efeito = 'ignored-overpay', 'overpay recusado');

  select settled_amount_cents into v_settled from ap.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-AP-SETTLE-0001';
  perform pg_temp.assert10(v_settled = 88000, 'overpay não alterou settled');
end;
$$;

\echo ''
\echo '=== CENÁRIO 3: alvo receivable ignorado; authenticated sem EXECUTE ==='

do $$
declare v_efeito text; v_ok boolean := false;
begin
  select ap.apply_recon_match(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon',
    '88888888-8888-4888-8888-888888888888',
    'DOC-ANY', 100, 'BRL', 'confirmed', 'receivable'
  ) into v_efeito;
  perform pg_temp.assert10(v_efeito = 'ignored-target', 'receivable não liquida no AP');

  begin
    set local role authenticated;
    set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
    perform ap.apply_recon_match(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon',
      '99999999-9999-4999-8999-999999999999',
      'HACK', 1, 'BRL', 'confirmed', 'payable'
    );
  exception when insufficient_privilege or undefined_function then
    v_ok := true;
  when others then
    if sqlstate = '42501' then v_ok := true; end if;
  end;
  reset role;
  perform pg_temp.assert10(v_ok, 'authenticated sem EXECUTE na RPC');
end;
$$;

\echo ''
\echo '=== 10_ap_recon_settlement: OK ==='
