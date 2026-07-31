-- =============================================================================
-- O MÓDULO 61 NO BANCO — o livro de horas trabalhadas que se isola, o carimbo
-- do servidor, a imutabilidade do fato (as DUAS camadas) e o CHECK das horas > 0
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os apontamentos de um tenant não aparecem no outro; e ⭐ **created_by é
--      carimbado pelo servidor** — o autor mentido no INSERT é descartado;
--   2. ⭐ **horas <= 0** (zero E negativo) são recusadas pelo CHECK;
--   3. ⭐⭐ **IMUTÁVEL na UPDATE — as DUAS camadas**: como CLIENTE
--      (`authenticated`) o UPDATE falha por insufficient_privilege (não há
--      grant); como DONO (`reset role`) o UPDATE bate no gatilho `fato
--      consumado` (errcode 42501);
--   4. ⭐⭐ **IMUTÁVEL na DELETE — as DUAS camadas** (cliente sem porta; o dono
--      barrado pelo gatilho);
--   5. cross-tenant é barrado; e
--   6. a caneta de emitir evento não é do cliente, o `anon` não encosta na
--      tabela, e o fato `timesheet.entry.registered` chega no correio.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert66(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: timesheet instalado nos dois tenants; os dois apontam ==='

-- ⚠️ O cartão do timesheet ainda NÃO está no seed compartilhado (entra numa
-- frente à parte). Para o FK de tenant_modules fechar no banco efêmero, o teste
-- registra o módulo aqui — espelho fiel do manifesto de @alsham/timesheet.
insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'timesheet', 'Apontamento de horas', '0.1.0',
  'O livro de horas trabalhadas: cada apontamento é lançamento imutável.',
  'domain', 'pmo',
  '[{"key":"timesheet","canonicalName":"Timesheet"}]'::jsonb,
  '[{"key":"timesheet.entry.manage","moduleId":"timesheet","description":"Registrar um apontamento de horas."}]'::jsonb,
  '[{"type":"timesheet.entry.registered","version":1,"description":"Um apontamento de horas foi registrado."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'timesheet', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'timesheet', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'timesheet.entry.manage', 'timesheet'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois apontam horas.'

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
  insert into timesheet.entries (tenant_id, project_id, project_name, collaborator_name, worked_on, hours, description, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Obra Central', 'Ana', '2026-07-31', 8, 'fundação',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_by;

  perform pg_temp.assert66(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into timesheet.entries (tenant_id, project_id, collaborator_name, worked_on, hours)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Bruno', '2026-07-30', 6);

  select count(*) into v_n from timesheet.entries;
  perform pg_temp.assert66(v_n = 1, 'o Beta enxerga só o apontamento dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ HORAS > 0: ZERO E NEGATIVO SÃO RECUSADOS PELO CHECK
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: horas devem ser > 0 — zero e negativo recusados ==='

do $$
declare
  v_h numeric;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Fracionário positivo entra (não se exige inteiro).
  insert into timesheet.entries (tenant_id, project_id, collaborator_name, worked_on, hours)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Ana', '2026-07-29', 7.75)
  returning hours into v_h;
  perform pg_temp.assert66(v_h = 7.75, '⭐ horas fracionárias positivas entram');

  -- Zero é recusado (linha muda).
  begin
    insert into timesheet.entries (tenant_id, project_id, collaborator_name, worked_on, hours)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Ana', '2026-07-29', 0);
    perform pg_temp.assert66(false, 'DEVERIA TER FALHADO: apontamento de zero horas');
  exception when check_violation then
    perform pg_temp.assert66(true, '⭐ zero é recusado — é linha muda, não trabalho');
  end;

  -- Negativo é recusado (não é trabalho).
  begin
    insert into timesheet.entries (tenant_id, project_id, collaborator_name, worked_on, hours)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Ana', '2026-07-29', -3);
    perform pg_temp.assert66(false, 'DEVERIA TER FALHADO: apontamento de horas negativas');
  exception when check_violation then
    perform pg_temp.assert66(true, '⭐ negativo é recusado — corrigir é lançar o ato inverso, não número negativo');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ IMUTÁVEL NA UPDATE: AS DUAS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: reescrever o apontamento — cliente sem porta; nem o dono ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from timesheet.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and description = 'fundação';

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE (sem grant): é barrado antes
  -- mesmo de o gatilho de imutabilidade rodar.
  begin
    update timesheet.entries set hours = 99 where id = v_id;
    perform pg_temp.assert66(false, 'DEVERIA TER FALHADO: cliente editou um apontamento');
  exception when insufficient_privilege then
    perform pg_temp.assert66(true, '⭐ CAMADA 1: o cliente não edita — não há porta de UPDATE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: com privilégio para escrever, ele
  -- alcança o gatilho, e o gatilho recusa. "Sem porta" × "fato consumado".
  reset role;
  begin
    update timesheet.entries set hours = 99 where id = v_id;
    perform pg_temp.assert66(false, 'DEVERIA TER FALHADO: o dono reescreveu o apontamento');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert66(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2: nem o dono reescreve — o apontamento é fato consumado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐⭐ IMUTÁVEL NA DELETE: AS DUAS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: apagar o apontamento — cliente sem porta; nem o dono ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from timesheet.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and description = 'fundação';

  -- CAMADA 1 — o cliente não tem porta de DELETE.
  begin
    delete from timesheet.entries where id = v_id;
    perform pg_temp.assert66(false, 'DEVERIA TER FALHADO: cliente apagou um apontamento');
  exception when insufficient_privilege then
    perform pg_temp.assert66(true, '⭐ CAMADA 1: o cliente não apaga — não há porta de DELETE');
  end;

  -- CAMADA 2 — nem o dono do banco: o gatilho recusa.
  reset role;
  begin
    delete from timesheet.entries where id = v_id;
    perform pg_temp.assert66(false, 'DEVERIA TER FALHADO: o dono apagou o apontamento');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert66(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2: nem o dono apaga — corrigir é lançar outro, com descrição');
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
    insert into timesheet.entries (tenant_id, project_id, collaborator_name, worked_on, hours)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Invasor', '2026-07-31', 1);
    perform pg_temp.assert66(false, 'DEVERIA TER FALHADO: o Alfa escreveu no livro do Beta');
  exception when others then
    perform pg_temp.assert66(true, '⭐ cross-tenant barrado: o Alfa não aponta no tenant do Beta');
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
    perform timesheet.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'timesheet.entry.registered', '{}'::jsonb);
    perform pg_temp.assert66(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert66(true, 'timesheet.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from timesheet.entries limit 1;
    perform pg_temp.assert66(false, 'DEVERIA TER FALHADO: anon leu timesheet.entries');
  exception when insufficient_privilege then
    perform pg_temp.assert66(true, '⭐ anon não encosta em timesheet.entries');
  end;
  reset role;
end $$;

-- =============================================================================
-- CONFERÊNCIA FINAL — os fatos saíram para a caixa de saída do Core
-- =============================================================================
\echo ''
\echo '=== CONFERÊNCIA: os apontamentos viraram fato no correio ==='

do $$
declare
  v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'timesheet.entry.registered';
  perform pg_temp.assert66(v_n >= 3, 'cada apontamento gravado emitiu timesheet.entry.registered');
end $$;

\echo ''
\echo '=== MÓDULO 61 OK: livro isolado, carimbo do servidor, imutável (2 camadas), horas > 0, anon fora ==='
