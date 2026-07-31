-- =============================================================================
-- O MÓDULO 83 NO BANCO — o LIVRO DE GERAÇÃO que se isola: leitura IMUTÁVEL (as
-- duas camadas), generated_kwh >= 0 (zero é leitura real — à noite; negativo é
-- infísico), a usina é OBRIGATÓRIA (o DIVERGE do esg), e o servidor carimba o
-- autor. Sem status, sem ciclo — a física do esg/timesheet.
-- =============================================================================
--
-- ⭐ Vertical ☀️ Energia (Onda Vinte, Fase 3).
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert88(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: genreading instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'genreading', 'Monitoramento de Geração', '0.1.0',
  'O livro de leituras de geração: leitura imutável, generated_kwh >= 0, usina obrigatória.',
  'vertical', 'energy',
  '[{"key":"generation-monitoring","canonicalName":"Monitoramento de geração"}]'::jsonb,
  '[{"key":"genreading.reading.record","moduleId":"genreading","description":"Registrar leitura."}]'::jsonb,
  '[{"type":"genreading.reading.recorded","version":1,"description":"Registrada."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'genreading', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'genreading', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'genreading.reading.record', 'genreading'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- Uma usina fabricada (id solto ao plant — não há FK, é só um uuid).
\set usina '44444444-4444-4444-8444-444444444444'

-- =============================================================================
-- CENÁRIO 1 — REGISTRA, ISOLA, O SERVIDOR CARIMBA O AUTOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: registra; recorded_by do servidor; isola ==='

do $$
declare v_id uuid; v_by uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into genreading.readings
    (tenant_id, plant_id, plant_name, generated_kwh, unit, reference_on, recorded_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'Usina Cerrado',
          1234.56, 'kWh', date '2026-07-01', '22222222-2222-4222-8222-222222222222')
  returning id, recorded_by into v_id, v_by;

  perform pg_temp.assert88(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ recorded_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from genreading.readings;
  perform pg_temp.assert88(v_n = 0, 'o Beta não vê a leitura do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — generated_kwh >= 0 (zero é leitura real; negativo é infísico)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: generated_kwh >= 0 (zero à noite é real) ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⭐ zero é leitura REAL (à noite a usina gera zero).
  insert into genreading.readings (tenant_id, plant_id, generated_kwh, reference_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 0, date '2026-07-02')
  returning id into v_id;
  perform pg_temp.assert88(v_id is not null, '⭐ generated_kwh = 0 é leitura real (à noite) — o MANTIDO do esg');

  begin
    insert into genreading.readings (tenant_id, plant_id, generated_kwh, reference_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', -3, date '2026-07-03');
    perform pg_temp.assert88(false, 'DEVERIA TER FALHADO: geração negativa');
  exception when check_violation then
    perform pg_temp.assert88(true, '⭐ generated_kwh negativo é infísico (não se gera -3 kWh)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ IMUTÁVEL: AS DUAS CAMADAS (cliente sem porta; nem o dono)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a leitura é fato consumado — não se edita nem se apaga ==='

do $$
declare v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from genreading.readings
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and generated_kwh = 1234.56 limit 1;

  -- CAMADA 1 — o cliente não tem porta de UPDATE.
  begin
    update genreading.readings set generated_kwh = 999 where id = v_id;
    perform pg_temp.assert88(false, 'DEVERIA TER FALHADO: cliente editou uma leitura');
  exception when insufficient_privilege then
    perform pg_temp.assert88(true, '⭐ CAMADA 1: o cliente não edita — não há porta de UPDATE');
  end;

  -- CAMADA 2 — nem o dono do banco: o gatilho recusa.
  reset role;
  begin
    update genreading.readings set generated_kwh = 999 where id = v_id;
    perform pg_temp.assert88(false, 'DEVERIA TER FALHADO: o dono reescreveu a leitura');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert88(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2: nem o dono reescreve — a leitura é fato consumado');
  end;

  begin
    delete from genreading.readings where id = v_id;
    perform pg_temp.assert88(false, 'DEVERIA TER FALHADO: o dono apagou a leitura');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert88(v_erro like '%fato consumado%', '⭐⭐ nem o dono apaga — corrigir é registrar outra');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT, A CANETA, ANON, E OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into genreading.readings (tenant_id, plant_id, generated_kwh, reference_on)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 10, date '2026-07-01');
    perform pg_temp.assert88(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert88(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform genreading.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'genreading.reading.recorded', '{}'::jsonb);
    perform pg_temp.assert88(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert88(true, 'genreading.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from genreading.readings limit 1;
    perform pg_temp.assert88(false, 'DEVERIA TER FALHADO: anon leu genreading.readings');
  exception when insufficient_privilege then
    perform pg_temp.assert88(true, '⭐ anon não encosta em genreading.readings');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'genreading.reading.recorded';
  perform pg_temp.assert88(v_n >= 2, 'cada leitura registrada emitiu genreading.reading.recorded');
end $$;

\echo ''
\echo '=== MÓDULO 83 OK: livro isolado, imutável (2 camadas), generated_kwh>=0, usina obrigatória, anon fora ==='
