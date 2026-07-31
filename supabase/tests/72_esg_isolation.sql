-- =============================================================================
-- O MÓDULO 67 NO BANCO — o livro de leituras ambientais que se isola, o carimbo
-- do servidor, a imutabilidade do fato (as DUAS camadas), o metric_type CHECK
-- (as quatro dimensões) e o quantity >= 0 (o DIVERGE assinado do pcost/timesheet)
-- =============================================================================
--
-- ⭐ Domain 🌱 ESG & Sustentabilidade (Onda Quinze, Fase 2) — o primeiro (e
-- único) da onda, ABRE o território novo.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as leituras de um tenant não aparecem no outro; e ⭐ **recorded_by é
--      carimbado pelo servidor** — o autor mentido no INSERT é descartado;
--   2. ⭐⭐ **metric_type** só aceita as QUATRO dimensões (carbon/water/energy/
--      waste); qualquer outra é recusada pelo CHECK;
--   3. ⭐⭐ **quantity >= 0**: zero ENTRA (leitura real — zero resíduo é
--      reportável); negativo é RECUSADO (infísico) — o DIVERGE do pcost;
--   4. ⭐⭐ **IMUTÁVEL na UPDATE — as DUAS camadas**: como CLIENTE o UPDATE falha
--      por insufficient_privilege (não há grant); como DONO (`reset role`) o
--      UPDATE bate no gatilho `fato consumado` (errcode 42501);
--   5. ⭐⭐ **IMUTÁVEL na DELETE — as DUAS camadas**;
--   6. cross-tenant é barrado; a caneta de emitir evento não é do cliente, o
--      `anon` não encosta na tabela, e o fato `esg.reading.recorded` chega no
--      correio.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert72(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: esg instalado nos dois tenants; os dois medem ==='

-- ⚠️ O cartão do esg já está no seed compartilhado; para o banco efêmero deste
-- teste, registra aqui também — espelho fiel do manifesto de @alsham/esg.
insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'esg', 'Métricas Ambientais', '0.1.0',
  'O livro de leituras ambientais: cada leitura é ato imutável.',
  'domain', 'esg',
  '[{"key":"esg","canonicalName":"Inventário de carbono"}]'::jsonb,
  '[{"key":"esg.reading.record","moduleId":"esg","description":"Registrar uma leitura ambiental."}]'::jsonb,
  '[{"type":"esg.reading.recorded","version":1,"description":"Uma leitura ambiental foi registrada."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'esg', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'esg', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'esg.reading.record', 'esg'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois medem métricas ambientais.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E O CARIMBO DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu livro; quem do servidor ==='

do $$
declare
  v_by uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT. O gatilho descarta e carimba quem está logado.
  insert into esg.readings (tenant_id, metric_type, quantity, unit, reference_on, source_name, note, recorded_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'carbon', 12.5, 'tCO2e', '2026-07-31', 'Usina Norte', 'escopo 1',
          '22222222-2222-4222-8222-222222222222')
  returning recorded_by into v_by;

  perform pg_temp.assert72(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ recorded_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into esg.readings (tenant_id, metric_type, quantity, unit, reference_on)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'water', 340, 'm³', '2026-07-30');

  select count(*) into v_n from esg.readings;
  perform pg_temp.assert72(v_n = 1, 'o Beta enxerga só a leitura dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ metric_type: AS QUATRO DIMENSÕES, E SÓ ELAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: metric_type só aceita carbon/water/energy/waste ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- As quatro dimensões entram.
  insert into esg.readings (tenant_id, metric_type, quantity, unit, reference_on) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'energy', 1200, 'kWh', '2026-07-29'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'waste',   90,  'kg',  '2026-07-29');
  perform pg_temp.assert72(true, '⭐ energy e waste entram — as quatro dimensões do método');

  -- Uma quinta "dimensão" é recusada pelo CHECK.
  begin
    insert into esg.readings (tenant_id, metric_type, quantity, unit, reference_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'plastic', 1, 'kg', '2026-07-29');
    perform pg_temp.assert72(false, 'DEVERIA TER FALHADO: metric_type fora das quatro dimensões');
  exception when check_violation then
    perform pg_temp.assert72(true, '⭐⭐ metric_type fora das quatro dimensões é recusado (física do método)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ quantity >= 0: ZERO ENTRA, NEGATIVO É RECUSADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: zero é leitura real; negativo é infísico ==='

do $$
declare
  v_q numeric;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⭐⭐ Zero ENTRA — zero resíduo ao aterro é reportável (o DIVERGE do timesheet>0).
  insert into esg.readings (tenant_id, metric_type, quantity, unit, reference_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'waste', 0, 'kg', '2026-07-28')
  returning quantity into v_q;
  perform pg_temp.assert72(v_q = 0, '⭐⭐ quantidade ZERO entra — leitura real e reportável');

  -- Negativo é recusado (infísico).
  begin
    insert into esg.readings (tenant_id, metric_type, quantity, unit, reference_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'carbon', -3, 'tCO2e', '2026-07-28');
    perform pg_temp.assert72(false, 'DEVERIA TER FALHADO: quantidade negativa');
  exception when check_violation then
    perform pg_temp.assert72(true, '⭐⭐ negativo é recusado — infísico (o DIVERGE do pcost <> 0)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐⭐ IMUTÁVEL NA UPDATE: AS DUAS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: reescrever a leitura — cliente sem porta; nem o dono ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from esg.readings
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and note = 'escopo 1';

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE (sem grant).
  begin
    update esg.readings set quantity = 99 where id = v_id;
    perform pg_temp.assert72(false, 'DEVERIA TER FALHADO: cliente editou uma leitura');
  exception when insufficient_privilege then
    perform pg_temp.assert72(true, '⭐ CAMADA 1: o cliente não edita — não há porta de UPDATE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: o gatilho recusa.
  reset role;
  begin
    update esg.readings set quantity = 99 where id = v_id;
    perform pg_temp.assert72(false, 'DEVERIA TER FALHADO: o dono reescreveu a leitura');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert72(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2: nem o dono reescreve — a leitura é fato consumado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐⭐ IMUTÁVEL NA DELETE: AS DUAS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar a leitura — cliente sem porta; nem o dono ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from esg.readings
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and note = 'escopo 1';

  -- CAMADA 1 — o cliente não tem porta de DELETE.
  begin
    delete from esg.readings where id = v_id;
    perform pg_temp.assert72(false, 'DEVERIA TER FALHADO: cliente apagou uma leitura');
  exception when insufficient_privilege then
    perform pg_temp.assert72(true, '⭐ CAMADA 1: o cliente não apaga — não há porta de DELETE');
  end;

  -- CAMADA 2 — nem o dono do banco: o gatilho recusa.
  reset role;
  begin
    delete from esg.readings where id = v_id;
    perform pg_temp.assert72(false, 'DEVERIA TER FALHADO: o dono apagou a leitura');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert72(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2: nem o dono apaga — corrigir é registrar outra, com nota');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — CROSS-TENANT: O ALFA NÃO ESCREVE NO LIVRO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into esg.readings (tenant_id, metric_type, quantity, unit, reference_on)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'carbon', 1, 'tCO2e', '2026-07-31');
    perform pg_temp.assert72(false, 'DEVERIA TER FALHADO: o Alfa escreveu no livro do Beta');
  exception when others then
    perform pg_temp.assert72(true, '⭐ cross-tenant barrado: o Alfa não mede no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 7 — A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: emit_event não é concedida; anon barrado ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform esg.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'esg.reading.recorded', '{}'::jsonb);
    perform pg_temp.assert72(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert72(true, 'esg.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from esg.readings limit 1;
    perform pg_temp.assert72(false, 'DEVERIA TER FALHADO: anon leu esg.readings');
  exception when insufficient_privilege then
    perform pg_temp.assert72(true, '⭐ anon não encosta em esg.readings');
  end;
  reset role;
end $$;

-- =============================================================================
-- CONFERÊNCIA FINAL — os fatos saíram para a caixa de saída do Core
-- =============================================================================
\echo ''
\echo '=== CONFERÊNCIA: as leituras viraram fato no correio ==='

do $$
declare
  v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'esg.reading.recorded';
  perform pg_temp.assert72(v_n >= 5, 'cada leitura gravada emitiu esg.reading.recorded');
end $$;

\echo ''
\echo '=== MÓDULO 67 OK: livro isolado, carimbo do servidor, imutável (2 camadas), metric_type CHECK, quantity >= 0, anon fora ==='
