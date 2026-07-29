-- =============================================================================
-- CICLO FECHADO (DÉBITO) — recon confirma match → AP liquida o título
-- =============================================================================
-- Autossuficiente. NÃO reusa DOC-TRI-0001 (cancelado no 05 §6).
-- Montagem como superuser (como as projeções do 05 depois do reset role):
-- o que se prova com authenticated é só a ausência de EXECUTE na RPC.
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
\echo '=== MONTAGEM: permissões AP (idempotente) ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ap.payable.manage', 'ap'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo ''
\echo '=== CENÁRIO 1: match confirmado emite e AP liquida ==='

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
  -- Superuser: evita depender de RLS só para montar o cenário.
  insert into ap.payables
    (tenant_id, external_ref, due_date, amount_cents, currency, supplier_name, description)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-AP-SETTLE-0001', '2026-10-15',
     88000, 'BRL', 'Fornecedor Settle', 'ciclo débito');

  select recon.record_external_payable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap', 'DOC-AP-SETTLE-0001',
    '2026-10-15', 88000, 'BRL', 'open', 0, 'Fornecedor Settle', null, 'ciclo débito'
  ) into v_efeito;
  perform pg_temp.assert10(
    v_efeito = 'created',
    'projeção criada (efeito=' || coalesce(v_efeito, 'null') || ')');

  select id into v_pay_id from recon.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-AP-SETTLE-0001';
  perform pg_temp.assert10(v_pay_id is not null, 'projeção tem id');

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

  -- Igual ao 09: suggested → confirmed (UPDATE), não INSERT já decidido.
  insert into recon.reconciliation_matches (
    tenant_id, statement_line_id, payable_id, matched_amount_cents,
    score, origin, strategy, status
  ) values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_line_id, v_pay_id, 88000,
    0.9500, 'auto', 'amount+date+reference', 'suggested'
  ) returning id into v_match_id;

  update recon.reconciliation_matches
     set status = 'confirmed',
         decided_at = now()
   where id = v_match_id;

  select payload, produced_by into v_payload, v_produtor
    from core.event_outbox
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and event_type = 'recon.match.decided'
     and payload->>'externalRef' = 'DOC-AP-SETTLE-0001'
   order by created_at desc
   limit 1;

  perform pg_temp.assert10(v_payload is not null, 'evento recon.match.decided saiu');
  perform pg_temp.assert10((v_payload->>'targetKind') = 'payable', 'alvo payable');
  perform pg_temp.assert10((v_payload->>'decision') = 'confirmed', 'decision confirmed');
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

  perform pg_temp.assert10(
    v_efeito = 'applied',
    'liquidação AP aplicada (efeito=' || coalesce(v_efeito, 'null') || ')');

  select status, settled_amount_cents into v_status, v_settled
    from ap.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-AP-SETTLE-0001';

  perform pg_temp.assert10(
    v_status = 'settled',
    'título AP ficou settled (status=' || coalesce(v_status, 'null') || ')');
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
  perform pg_temp.assert10(
    v_efeito = 'unchanged',
    'reentrega = unchanged (efeito=' || coalesce(v_efeito, 'null') || ')');

  select ap.apply_recon_match(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon',
    '77777777-7777-4777-8777-777777777777',
    'DOC-AP-SETTLE-0001', 1, 'BRL', 'confirmed', 'payable'
  ) into v_efeito;
  perform pg_temp.assert10(
    v_efeito = 'ignored-overpay',
    'overpay recusado (efeito=' || coalesce(v_efeito, 'null') || ')');

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
