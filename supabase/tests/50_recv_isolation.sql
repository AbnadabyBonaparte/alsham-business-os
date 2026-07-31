-- =============================================================================
-- O MÓDULO 45 NO BANCO — o livro de recebimentos que se isola, o carimbo do
-- servidor, a imutabilidade do fato e ⭐⭐ a SOBRA que é aceita (o recv × ar)
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os recebimentos de um tenant não aparecem no outro;
--   2. ⭐ **quem/quando são carimbados pelo servidor** — o received_by/at
--      mentidos no INSERT são descartados;
--   3. ⭐⭐ **IMUTÁVEL** — reescrever E apagar o recebimento os dois RAISE
--      (nem o dono do banco reescreve o fato consumado);
--   4. ⭐⭐ **receber a maior é PERMITIDO** — uma quantidade de sobra ENORME
--      entra sem trave (o paralelo recv × ar; o recv não lê o po, não há
--      quantidade pedida contra a qual recusar);
--   5. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela; e cross-tenant é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert50(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: recv instalado nos dois tenants; os dois registram ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recv', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recv', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'recv.receipt.record', 'recv'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois registram recebimentos.'

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
  insert into recv.receipts (tenant_id, item, quantity, received_on, received_by, received_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Parafusos M6', 500, '2026-07-31',
          '22222222-2222-4222-8222-222222222222', '1999-01-01 00:00:00+00')
  returning id, received_by, received_at into v_id, v_by, v_at;

  perform pg_temp.assert50(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ received_by é quem está autenticado — o autor mentido no INSERT foi descartado');
  perform pg_temp.assert50(
    v_at > '2020-01-01 00:00:00+00',
    '⭐ received_at é do servidor — a hora mentida (1999) foi descartada');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into recv.receipts (tenant_id, item, quantity, received_on)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Caixas', 12, '2026-07-30');

  select count(*) into v_n from recv.receipts;
  perform pg_temp.assert50(v_n = 1, 'o Beta enxerga só o recebimento dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ RECEBER A MAIOR: A SOBRA ENTRA SEM TRAVE (o recv × ar)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: uma quantidade de sobra enorme é aceita — não há teto ==='

do $$
declare
  v_id uuid; v_q numeric;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Um pedido pediu pouco; o fornecedor entregou muito. O recv não sabe do
  -- pedido (id solto), e aceita o que fisicamente chegou.
  insert into recv.receipts (tenant_id, order_id, order_ref, item, quantity, received_on, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          gen_random_uuid(), 'PO-1042', 'Bobinas', 9999999, '2026-07-31', 'sobra do fornecedor')
  returning id, quantity into v_id, v_q;

  perform pg_temp.assert50(v_q = 9999999,
    '⭐⭐ receber a maior é PERMITIDO — a sobra é fato (o paralelo recv × ar)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ IMUTÁVEL: REESCREVER E APAGAR OS DOIS RAISE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o recebimento é fato consumado — não se edita nem se apaga ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from recv.receipts
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and item = 'Parafusos M6';

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE nem DELETE (sem grant):
  -- é barrado antes mesmo de o gatilho de imutabilidade rodar.
  begin
    update recv.receipts set note = 'corrigindo' where id = v_id;
    perform pg_temp.assert50(false, 'DEVERIA TER FALHADO: editou um recebimento');
  exception when insufficient_privilege then
    perform pg_temp.assert50(true, '⭐ o cliente não edita — não há porta de UPDATE');
  end;

  begin
    delete from recv.receipts where id = v_id;
    perform pg_temp.assert50(false, 'DEVERIA TER FALHADO: apagou um recebimento');
  exception when insufficient_privilege then
    perform pg_temp.assert50(true, '⭐ o cliente não apaga — não há porta de DELETE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: com privilégio para escrever, ele
  -- alcança o gatilho, e o gatilho recusa. É a diferença entre "sem porta" e
  -- "fato consumado" — as duas leis, provadas no mesmo cenário.
  reset role;
  begin
    update recv.receipts set note = 'reescrito pelo dono' where id = v_id;
    perform pg_temp.assert50(false, 'DEVERIA TER FALHADO: o dono reescreveu o recebimento');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert50(v_erro like '%fato consumado%', '⭐ nem o dono reescreve — o recebimento é fato consumado');
  end;

  begin
    delete from recv.receipts where id = v_id;
    perform pg_temp.assert50(false, 'DEVERIA TER FALHADO: o dono apagou o recebimento');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert50(v_erro like '%fato consumado%', '⭐ nem o dono apaga — corrigir é registrar outro, com nota');
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
    insert into recv.receipts (tenant_id, item, quantity, received_on)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 1, '2026-07-31');
    perform pg_temp.assert50(false, 'DEVERIA TER FALHADO: o Alfa escreveu no livro do Beta');
  exception when others then
    perform pg_temp.assert50(true, '⭐ cross-tenant barrado: o Alfa não registra no tenant do Beta');
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
    perform recv.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recv.receipt.recorded', '{}'::jsonb);
    perform pg_temp.assert50(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert50(true, 'recv.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from recv.receipts limit 1;
    perform pg_temp.assert50(false, 'DEVERIA TER FALHADO: anon leu recv.receipts');
  exception when insufficient_privilege then
    perform pg_temp.assert50(true, '⭐ anon não encosta em recv.receipts');
  end;
  reset role;
end $$;

-- =============================================================================
-- CONFERÊNCIA FINAL — os fatos saíram para a caixa de saída do Core
-- =============================================================================
\echo ''
\echo '=== CONFERÊNCIA: os recebimentos viraram fato no correio ==='

do $$
declare
  v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'recv.receipt.recorded';
  perform pg_temp.assert50(v_n >= 3, 'cada recebimento gravado emitiu recv.receipt.recorded');
end $$;

\echo ''
\echo '=== MÓDULO 45 OK: livro isolado, carimbo do servidor, imutável, a sobra aceita, anon fora ==='
