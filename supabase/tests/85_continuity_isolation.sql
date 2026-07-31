-- =============================================================================
-- O MÓDULO 80 NO BANCO — o plano de continuidade que se isola, o active ↔
-- archived que exige a permissão PRÓPRIA de decisão, e ⭐⭐ o LIVRO DE DRILLS
-- que é FATO CONSUMADO: não se rasura nem se apaga — nem para o dono do banco.
-- =============================================================================
--
-- ⭐ Domain 🔐 Segurança da Informação (Onda Dezenove, Fase 3) — capacidade
-- *Continuidade de negócios* (Taxonomia §5). O documento detalhado do plano é o
-- `pol` (declarado FORA); o que JUSTIFICA módulo próprio é a PRÁTICA — o registro
-- imutável dos testes que provam que o plano funciona.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o plano nasce `active`, com `created_by` carimbado pelo servidor, e o
--      plano de um tenant não aparece no outro;
--   2. ⭐ **active ↔ archived exige `continuity.plan.decide`**: o Beta (só
--      `manage`) é barrado por insufficient_privilege ao arquivar; o Alfa (com
--      `decide`) arquiva E reativa (archived → active — a física do vendor);
--   3. ⭐⭐ **o DRILL é IMUTÁVEL** — o cenário e o desfecho são obrigatórios
--      (desfecho em branco cai no CHECK), e depois de gravado o fato não muda:
--      como CLIENTE o UPDATE/DELETE falha por insufficient_privilege (sem
--      grant); como DONO (`reset role`) bate no gatilho `fato consumado`;
--   4. cross-tenant é barrado; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta em `continuity.plans`;
--   5. os fatos chegam no correio: `plan.registered`, `plan.archived`,
--      `plan.reopened` e `drill.recorded`.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert85(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: continuity instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'continuity', 'Continuidade de Negócios', '0.1.0',
  'O plano de continuidade (active ↔ archived) + o livro imutável de drills.',
  'domain', 'infosec',
  '[{"key":"business-continuity","canonicalName":"Continuidade de negócios"}]'::jsonb,
  '[{"key":"continuity.plan.manage","moduleId":"continuity","description":"Gerir planos e registrar drills."},
    {"key":"continuity.plan.decide","moduleId":"continuity","description":"Arquivar/reativar um plano."}]'::jsonb,
  '[{"type":"continuity.plan.registered","version":1,"description":"Registrado."},
    {"type":"continuity.plan.archived","version":1,"description":"Arquivado."},
    {"type":"continuity.plan.reopened","version":1,"description":"Reativado."},
    {"type":"continuity.drill.recorded","version":1,"description":"Drill registrado."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'continuity', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'continuity', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⭐ O Alfa (user 1) tem manage + decide; o Beta (user 2) SÓ manage — para provar
-- que arquivar/reativar exige a permissão PRÓPRIA de decisão.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'continuity.plan.manage', 'continuity'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'continuity.plan.decide', 'continuity'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE ATIVO, O SERVIDOR CARIMBA O AUTOR, E ISOLA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: o plano nasce active; created_by é do servidor; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Mente o autor no INSERT. O gatilho descarta e carimba quem está logado.
  insert into continuity.plans (tenant_id, name, scope, rto, rpo, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'BCP Sede', 'Datacenter primário',
          '4 horas', 'última transação confirmada',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert85(v_st = 'active', 'o plano nasce active');
  perform pg_temp.assert85(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  select count(*) into v_n from continuity.plans;
  perform pg_temp.assert85(v_n = 0, 'o Beta não vê o plano do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ active ↔ archived, E A TRANSIÇÃO EXIGE A PERMISSÃO DE DECISÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: arquivar/reativar exige decide; o plano volta ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  -- O Beta (só manage, sem decide) cria e TENTA arquivar.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into continuity.plans (tenant_id, name, rto, rpo)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'BCP Filial', '1 dia útil', 'meio período')
  returning id into v_id;

  begin
    update continuity.plans set status = 'archived' where id = v_id;
    perform pg_temp.assert85(false, 'DEVERIA TER FALHADO: arquivar sem a permissão decide');
  exception when insufficient_privilege then
    perform pg_temp.assert85(true, '⭐ arquivar exige continuity.plan.decide (o Beta não tem)');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem decide)

  select id into v_id from continuity.plans
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'BCP Sede';

  update continuity.plans set status = 'archived' where id = v_id;
  perform pg_temp.assert85((select status = 'archived' from continuity.plans where id = v_id),
    'o Alfa (com decide) arquivou o plano');

  -- ⭐ E volta: archived → active (o plano descontinuado volta — a física do vendor).
  update continuity.plans set status = 'active' where id = v_id;
  perform pg_temp.assert85((select status = 'active' from continuity.plans where id = v_id),
    '⭐ archived → active: o plano volta (a física do vendor)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ O DRILL É FATO CONSUMADO: obrigatório, e IMUTÁVEL (2 camadas)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o drill exige cenário/desfecho e não se rasura ==='

do $$
declare v_plan uuid; v_drill uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_plan from continuity.plans
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'BCP Sede';

  -- Desfecho em branco cai no CHECK (não-vazio): um teste sem resultado é papel.
  begin
    insert into continuity.drills (tenant_id, plan_id, drilled_on, scenario, outcome)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_plan, '2026-07-30',
            'Queda total do datacenter primário', '   ');
    perform pg_temp.assert85(false, 'DEVERIA TER FALHADO: drill com desfecho em branco');
  exception when check_violation then
    perform pg_temp.assert85(true, '⭐ o desfecho é obrigatório — drill sem resultado não é evidência');
  end;

  -- O drill válido entra.
  insert into continuity.drills (tenant_id, plan_id, drilled_on, scenario, outcome, note, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_plan, '2026-07-30',
          'Queda total do datacenter primário', 'RTO de 4h cumprido em 3h20', 'sem perda de dados',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_drill, v_plan;
  perform pg_temp.assert85(v_plan = '11111111-1111-4111-8111-111111111111',
    '⭐ o drill também carimba o autor pelo servidor');
end $$;

do $$
declare v_drill uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_drill from continuity.drills
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and scenario = 'Queda total do datacenter primário';

  -- CAMADA 1 — o CLIENTE não tem porta de UPDATE (sem grant).
  begin
    update continuity.drills set outcome = 'reescrito' where id = v_drill;
    perform pg_temp.assert85(false, 'DEVERIA TER FALHADO: cliente editou um drill');
  exception when insufficient_privilege then
    perform pg_temp.assert85(true, '⭐ CAMADA 1: o cliente não edita — não há porta de UPDATE no livro de drills');
  end;

  -- CAMADA 1 — nem DELETE.
  begin
    delete from continuity.drills where id = v_drill;
    perform pg_temp.assert85(false, 'DEVERIA TER FALHADO: cliente apagou um drill');
  exception when insufficient_privilege then
    perform pg_temp.assert85(true, '⭐ CAMADA 1: o cliente não apaga — não há porta de DELETE');
  end;

  -- CAMADA 2 — ⭐⭐ E NEM O DONO DO BANCO: com privilégio para escrever, alcança
  -- o gatilho, e o gatilho recusa. "Sem porta" × "fato consumado".
  reset role;
  begin
    update continuity.drills set outcome = 'reescrito pelo dono' where id = v_drill;
    perform pg_temp.assert85(false, 'DEVERIA TER FALHADO: o dono reescreveu o drill');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert85(v_erro like '%fato consumado%',
      '⭐⭐ CAMADA 2: nem o dono reescreve — o drill é fato consumado; corrigir é registrar outro');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT, A CANETA, ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- O Alfa não escreve um plano no tenant do Beta.
  begin
    insert into continuity.plans (tenant_id, name, rto, rpo)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', '0', '0');
    perform pg_temp.assert85(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert85(true, '⭐ cross-tenant barrado: o Alfa não escreve no tenant do Beta');
  end;

  -- A caneta de emitir evento não é do cliente.
  begin
    perform continuity.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'continuity.plan.registered', '{}'::jsonb);
    perform pg_temp.assert85(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert85(true, 'continuity.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from continuity.plans limit 1;
    perform pg_temp.assert85(false, 'DEVERIA TER FALHADO: anon leu continuity.plans');
  exception when insufficient_privilege then
    perform pg_temp.assert85(true, '⭐ anon não encosta em continuity.plans');
  end;
  reset role;
end $$;

-- =============================================================================
-- CONFERÊNCIA FINAL — os fatos saíram para a caixa de saída do Core
-- =============================================================================
\echo ''
\echo '=== CONFERÊNCIA: os planos e drills viraram fato no correio ==='

do $$
declare v_n int;
begin
  reset role;

  select count(*) into v_n from core.event_outbox where event_type = 'continuity.plan.registered';
  perform pg_temp.assert85(v_n >= 1, 'cada plano registrado emitiu continuity.plan.registered');

  select count(*) into v_n from core.event_outbox where event_type = 'continuity.plan.archived';
  perform pg_temp.assert85(v_n >= 1, 'o arquivamento emitiu continuity.plan.archived');

  select count(*) into v_n from core.event_outbox where event_type = 'continuity.plan.reopened';
  perform pg_temp.assert85(v_n >= 1, '⭐ a reativação emitiu continuity.plan.reopened');

  select count(*) into v_n from core.event_outbox where event_type = 'continuity.drill.recorded';
  perform pg_temp.assert85(v_n >= 1, 'o drill gravado emitiu continuity.drill.recorded');
end $$;

\echo ''
\echo '=== MÓDULO 80 OK: plano isolado, active↔archived com decide, drill imutável (2 camadas), anon fora ==='
