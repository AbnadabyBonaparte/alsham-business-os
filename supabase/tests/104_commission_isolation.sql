-- =============================================================================
-- O MÓDULO 99 NO BANCO — o livro de comissões que se isola, o carimbo do
-- servidor, a imutabilidade do fato (as DUAS camadas) e o CHECK do valor >= 0
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as comissões de um tenant não aparecem no outro; e ⭐ **created_by é
--      carimbado pelo servidor** — o autor mentido no INSERT é descartado;
--   2. ⭐ **valor da comissão < 0** é recusado pelo CHECK; **zero é permitido**
--      (serviço de cortesia sem comissão);
--   3. ⭐⭐ **IMUTÁVEL na UPDATE — as DUAS camadas**: como CLIENTE
--      (`authenticated`) o UPDATE falha por insufficient_privilege (não há
--      grant); como DONO (`reset role`) o UPDATE bate no gatilho `fato
--      consumado` (errcode 42501);
--   4. ⭐⭐ **IMUTÁVEL na DELETE — as DUAS camadas** (cliente sem porta; o dono
--      barrado pelo gatilho);
--   5. cross-tenant é barrado; e
--   6. a caneta de emitir evento não é do cliente, o `anon` não encosta na
--      tabela, e o fato `commission.commission.registered` chega no correio.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert104(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: commission instalado nos dois tenants; os dois lançam ==='

-- ⚠️ O cartão do commission ainda NÃO está no seed compartilhado (entra numa
-- frente à parte). Para o FK de tenant_modules fechar no banco efêmero, o teste
-- registra o módulo aqui — espelho fiel do manifesto de @alsham/commission.
insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'commission', 'Comissões', '0.1.0',
  'O livro de comissões de profissional por serviço: cada lançamento é imutável.',
  'vertical', 'beauty',
  '[{"key":"commissions","canonicalName":"Comissões"}]'::jsonb,
  '[{"key":"commission.commission.record","moduleId":"commission","description":"Registrar uma comissão."}]'::jsonb,
  '[{"type":"commission.commission.registered","version":1,"description":"Uma comissão foi registrada."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'commission', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'commission', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'commission.commission.record', 'commission'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois lançam comissões.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E O CARIMBO DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu livro; quem do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT. O gatilho descarta e carimba quem está logado.
  insert into commission.commissions (tenant_id, professional_id, professional_name, service, base_amount_cents, commission_amount_cents, occurred_on, note, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Ana', 'coloração', 12000, 3600, '2026-07-31', 'cliente fiel',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_by;

  perform pg_temp.assert104(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into commission.commissions (tenant_id, professional_id, professional_name, service, commission_amount_cents, occurred_on)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Bruno', 'corte', 2000, '2026-07-30');

  select count(*) into v_n from commission.commissions;
  perform pg_temp.assert104(v_n = 1, 'o Beta enxerga só a comissão dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ VALOR >= 0: NEGATIVO RECUSADO, ZERO (CORTESIA) PERMITIDO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: comissão >= 0 — negativo recusado; zero é cortesia ==='

do $$
declare
  v_v bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Zero entra (serviço de cortesia sem comissão).
  insert into commission.commissions (tenant_id, professional_id, professional_name, service, commission_amount_cents, occurred_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Ana', 'retoque cortesia', 0, '2026-07-29')
  returning commission_amount_cents into v_v;
  perform pg_temp.assert104(v_v = 0, '⭐ zero entra — serviço de cortesia sem comissão');

  -- Negativo é recusado (não é comissão).
  begin
    insert into commission.commissions (tenant_id, professional_id, professional_name, service, commission_amount_cents, occurred_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Ana', 'corte', -300, '2026-07-29');
    perform pg_temp.assert104(false, 'DEVERIA TER FALHADO: comissão negativa');
  exception when check_violation then
    perform pg_temp.assert104(true, '⭐ negativo é recusado — corrigir é lançar o ato inverso, não valor negativo');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ IMUTÁVEL NA UPDATE: AS DUAS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: reescrever a comissão — cliente sem porta; nem o dono ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from commission.commissions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and note = 'cliente fiel';

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE (sem grant): é barrado antes
  -- mesmo de o gatilho de imutabilidade rodar.
  begin
    update commission.commissions set commission_amount_cents = 99900 where id = v_id;
    perform pg_temp.assert104(false, 'DEVERIA TER FALHADO: cliente editou uma comissão');
  exception when insufficient_privilege then
    perform pg_temp.assert104(true, '⭐ CAMADA 1: o cliente não edita — não há porta de UPDATE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: com privilégio para escrever, ele
  -- alcança o gatilho, e o gatilho recusa. "Sem porta" × "fato consumado".
  reset role;
  begin
    update commission.commissions set commission_amount_cents = 99900 where id = v_id;
    perform pg_temp.assert104(false, 'DEVERIA TER FALHADO: o dono reescreveu a comissão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert104(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2: nem o dono reescreve — a comissão é fato consumado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐⭐ IMUTÁVEL NA DELETE: AS DUAS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: apagar a comissão — cliente sem porta; nem o dono ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from commission.commissions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and note = 'cliente fiel';

  -- CAMADA 1 — o cliente não tem porta de DELETE.
  begin
    delete from commission.commissions where id = v_id;
    perform pg_temp.assert104(false, 'DEVERIA TER FALHADO: cliente apagou uma comissão');
  exception when insufficient_privilege then
    perform pg_temp.assert104(true, '⭐ CAMADA 1: o cliente não apaga — não há porta de DELETE');
  end;

  -- CAMADA 2 — nem o dono do banco: o gatilho recusa.
  reset role;
  begin
    delete from commission.commissions where id = v_id;
    perform pg_temp.assert104(false, 'DEVERIA TER FALHADO: o dono apagou a comissão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert104(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2: nem o dono apaga — corrigir é lançar outro, com nota');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT: O ALFA NÃO ESCREVE NO LIVRO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into commission.commissions (tenant_id, professional_id, professional_name, service, commission_amount_cents, occurred_on)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Invasor', 'corte', 100, '2026-07-31');
    perform pg_temp.assert104(false, 'DEVERIA TER FALHADO: o Alfa escreveu no livro do Beta');
  exception when others then
    perform pg_temp.assert104(true, '⭐ cross-tenant barrado: o Alfa não lança no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: emit_event não é concedida; anon barrado ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform commission.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'commission.commission.registered', '{}'::jsonb);
    perform pg_temp.assert104(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert104(true, 'commission.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from commission.commissions limit 1;
    perform pg_temp.assert104(false, 'DEVERIA TER FALHADO: anon leu commission.commissions');
  exception when insufficient_privilege then
    perform pg_temp.assert104(true, '⭐ anon não encosta em commission.commissions');
  end;
  reset role;
end $$;

-- =============================================================================
-- CONFERÊNCIA FINAL — os fatos saíram para a caixa de saída do Core
-- =============================================================================
\echo ''
\echo '=== CONFERÊNCIA: as comissões viraram fato no correio ==='

do $$
declare
  v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'commission.commission.registered';
  perform pg_temp.assert104(v_n >= 3, 'cada comissão gravada emitiu commission.commission.registered');
end $$;

\echo ''
\echo '=== MÓDULO 99 OK: livro isolado, carimbo do servidor, imutável (2 camadas), valor >= 0, anon fora ==='
