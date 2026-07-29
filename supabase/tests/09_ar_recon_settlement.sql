-- =============================================================================
-- CICLO FECHADO — recon confirma match → AR liquida o título
-- =============================================================================
-- Roda depois de 08_ar_recon_triangle.sql. Prova:
--   1. confirmar match de crédito emite recon.match.decided
--   2. ar.apply_recon_match liquida o título (received)
--   3. reentrega é unchanged
--   4. authenticated NÃO chama a RPC
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert9(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== CENÁRIO 1: confirmar match emite recon.match.decided ==='

do $$
declare
  v_recv_id uuid;
  v_line_id uuid;
  v_match_id uuid;
  v_payload jsonb;
  v_produtor text;
  v_efeito text;
  v_status text;
  v_recv bigint;
begin
  select id into v_recv_id from recon.receivables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-CRED-0001';

  select id into v_line_id from recon.statement_lines
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and description = 'PIX DOC-CRED-0001'
   limit 1;

  -- O teste 08 já inseriu um match suggested; confirma.
  update recon.reconciliation_matches
     set status = 'confirmed',
         decided_at = now()
   where receivable_id = v_recv_id
     and status = 'suggested'
  returning id into v_match_id;

  perform pg_temp.assert9(v_match_id is not null, 'match confirmado');

  select payload, produced_by into v_payload, v_produtor
    from core.event_outbox
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and event_type = 'recon.match.decided'
   order by created_at desc
   limit 1;

  perform pg_temp.assert9(v_payload is not null, 'evento recon.match.decided saiu');
  perform pg_temp.assert9(v_produtor = 'recon', 'produced_by é recon');
  perform pg_temp.assert9((v_payload->>'decision') = 'confirmed', 'decision confirmed');
  perform pg_temp.assert9((v_payload->>'targetKind') = 'receivable', 'alvo receivable');
  perform pg_temp.assert9((v_payload->>'externalRef') = 'DOC-CRED-0001', 'ref no payload');

  select ar.apply_recon_match(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    v_produtor,
    (v_payload->>'matchId')::uuid,
    v_payload->>'externalRef',
    (v_payload->>'matchedAmountCents')::bigint,
    (v_payload->>'currency')::char(3),
    v_payload->>'decision',
    v_payload->>'targetKind'
  ) into v_efeito;

  perform pg_temp.assert9(v_efeito = 'applied', 'liquidação aplicada');

  select status, received_amount_cents into v_status, v_recv
    from ar.receivables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-CRED-0001';

  -- O cenário 3 do teste 08 já tinha projetado received=250000 no recon;
  -- o título AR ainda estava open/0 até esta liquidação.
  perform pg_temp.assert9(v_status = 'received', 'título AR ficou received');
  perform pg_temp.assert9(v_recv = 200000, 'received_amount = matched 200000');
end;
$$;

\echo ''
\echo '=== CENÁRIO 2: reentrega não duplica ==='

do $$
declare v_efeito text; v_recv bigint;
begin
  select ar.apply_recon_match(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon',
    (select (payload->>'matchId')::uuid from core.event_outbox
      where event_type = 'recon.match.decided'
        and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      order by created_at desc limit 1),
    'DOC-CRED-0001', 200000, 'BRL', 'confirmed', 'receivable'
  ) into v_efeito;
  perform pg_temp.assert9(v_efeito = 'unchanged', 'reentrega = unchanged');

  select received_amount_cents into v_recv from ar.receivables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-CRED-0001';
  perform pg_temp.assert9(v_recv = 200000, 'valor não dobrou');
end;
$$;

\echo ''
\echo '=== CENÁRIO 3: alvo payable é ignorado pela RPC do AR ==='

do $$
declare v_efeito text;
begin
  select ar.apply_recon_match(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon',
    '44444444-4444-4444-8444-444444444444',
    'DOC-ANY', 100, 'BRL', 'confirmed', 'payable'
  ) into v_efeito;
  perform pg_temp.assert9(v_efeito = 'ignored-target', 'payable não liquida no AR');
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
    perform ar.apply_recon_match(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon',
      '55555555-5555-4555-8555-555555555555',
      'HACK', 1, 'BRL', 'confirmed', 'receivable'
    );
  exception when insufficient_privilege or undefined_function then
    v_ok := true;
  when others then
    if sqlstate = '42501' then v_ok := true; end if;
  end;
  reset role;
  perform pg_temp.assert9(v_ok, 'authenticated sem EXECUTE na RPC');
end;
$$;

\echo ''
\echo '=== 09_ar_recon_settlement: OK ==='
