-- =============================================================================
-- O MÓDULO 51 NO BANCO — o livro de despachos que se isola, o carimbo do
-- servidor, a imutabilidade do fato e ⭐ o vínculo id solto com o centro
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os despachos de um tenant não aparecem no outro;
--   2. ⭐ **quem/quando são carimbados pelo servidor** — o dispatched_by/at
--      mentidos no INSERT são descartados;
--   3. ⭐ **o centro é ID SOLTO** — um dispatch com um dc_center_id qualquer
--      (que não existe em cadastro nenhum) entra, porque NÃO há FK;
--   4. ⭐⭐ **IMUTÁVEL em DUAS camadas** — reescrever E apagar o despacho os dois
--      RAISE: o CLIENTE por falta de porta (insufficient_privilege), e o DONO do
--      banco pelo gatilho ("fato consumado"). O espelho invertido do recv;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela; e cross-tenant é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert55(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: disp instalado nos dois tenants; os dois despacham ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'disp', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'disp', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'disp.dispatch.record', 'disp'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois registram despachos.'

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
  insert into disp.dispatches (tenant_id, destination, quantity, dispatched_on, dispatched_by, dispatched_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'São Paulo — SP', 500, '2026-07-31',
          '22222222-2222-4222-8222-222222222222', '1999-01-01 00:00:00+00')
  returning id, dispatched_by, dispatched_at into v_id, v_by, v_at;

  perform pg_temp.assert55(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ dispatched_by é quem está autenticado — o autor mentido no INSERT foi descartado');
  perform pg_temp.assert55(
    v_at > '2020-01-01 00:00:00+00',
    '⭐ dispatched_at é do servidor — a hora mentida (1999) foi descartada');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into disp.dispatches (tenant_id, destination, quantity, dispatched_on)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Filial Norte', 12, '2026-07-30');

  select count(*) into v_n from disp.dispatches;
  perform pg_temp.assert55(v_n = 1, 'o Beta enxerga só o despacho dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O CENTRO É ID SOLTO: SEM FK, UM UUID QUALQUER ENTRA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o centro de distribuição é id solto — sem FK cruzada ==='

do $$
declare
  v_id uuid; v_center uuid; v_name text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Um centro que não existe em cadastro nenhum — o disp não conhece o schema
  -- de ninguém, e aceita o id solto + o nome carimbado pela tela.
  insert into disp.dispatches (tenant_id, dc_center_id, dc_center_name, destination, carrier, quantity, dispatched_on, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          gen_random_uuid(), 'CD Sul', 'Cliente Final — RJ', 'Transportadora X', 340, '2026-07-31', 'palete completo')
  returning id, dc_center_id, dc_center_name into v_id, v_center, v_name;

  perform pg_temp.assert55(v_center is not null and v_name = 'CD Sul',
    '⭐ o centro é id solto + nome carimbado — sem FK, um uuid qualquer entra');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ IMUTÁVEL EM DUAS CAMADAS: REESCREVER E APAGAR OS DOIS RAISE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o despacho é fato consumado — não se edita nem se apaga ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from disp.dispatches
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and destination = 'São Paulo — SP';

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE nem DELETE (sem grant):
  -- é barrado antes mesmo de o gatilho de imutabilidade rodar.
  begin
    update disp.dispatches set note = 'corrigindo' where id = v_id;
    perform pg_temp.assert55(false, 'DEVERIA TER FALHADO: editou um despacho');
  exception when insufficient_privilege then
    perform pg_temp.assert55(true, '⭐ o cliente não edita — não há porta de UPDATE');
  end;

  begin
    delete from disp.dispatches where id = v_id;
    perform pg_temp.assert55(false, 'DEVERIA TER FALHADO: apagou um despacho');
  exception when insufficient_privilege then
    perform pg_temp.assert55(true, '⭐ o cliente não apaga — não há porta de DELETE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: com privilégio para escrever, ele
  -- alcança o gatilho, e o gatilho recusa. É a diferença entre "sem porta" e
  -- "fato consumado" — as duas leis, provadas no mesmo cenário.
  reset role;
  begin
    update disp.dispatches set note = 'reescrito pelo dono' where id = v_id;
    perform pg_temp.assert55(false, 'DEVERIA TER FALHADO: o dono reescreveu o despacho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert55(v_erro like '%fato consumado%', '⭐ nem o dono reescreve — o despacho é fato consumado');
  end;

  begin
    delete from disp.dispatches where id = v_id;
    perform pg_temp.assert55(false, 'DEVERIA TER FALHADO: o dono apagou o despacho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert55(v_erro like '%fato consumado%', '⭐ nem o dono apaga — corrigir é registrar outro, com nota');
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
    insert into disp.dispatches (tenant_id, destination, quantity, dispatched_on)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 1, '2026-07-31');
    perform pg_temp.assert55(false, 'DEVERIA TER FALHADO: o Alfa escreveu no livro do Beta');
  exception when others then
    perform pg_temp.assert55(true, '⭐ cross-tenant barrado: o Alfa não registra no tenant do Beta');
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
    perform disp.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'disp.dispatch.recorded', '{}'::jsonb);
    perform pg_temp.assert55(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert55(true, 'disp.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from disp.dispatches limit 1;
    perform pg_temp.assert55(false, 'DEVERIA TER FALHADO: anon leu disp.dispatches');
  exception when insufficient_privilege then
    perform pg_temp.assert55(true, '⭐ anon não encosta em disp.dispatches');
  end;
  reset role;
end $$;

-- =============================================================================
-- CONFERÊNCIA FINAL — os fatos saíram para a caixa de saída do Core
-- =============================================================================
\echo ''
\echo '=== CONFERÊNCIA: os despachos viraram fato no correio ==='

do $$
declare
  v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'disp.dispatch.recorded';
  perform pg_temp.assert55(v_n >= 3, 'cada despacho gravado emitiu disp.dispatch.recorded');
end $$;

\echo ''
\echo '=== MÓDULO 51 OK: livro isolado, carimbo do servidor, imutável em 2 camadas, centro id solto, anon fora ==='
