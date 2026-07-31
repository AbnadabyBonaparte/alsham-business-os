-- =============================================================================
-- O MÓDULO 66 NO BANCO — o requisito que se isola, a conformidade MUTÁVEL (não
-- um ciclo terminal), e o active↔archived reversível
-- =============================================================================
--
-- ⭐ Domain 🧪 Qualidade (Onda Quatorze, Fase 2) — o ÚLTIMO da onda.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--   1. os requisitos de um tenant não aparecem no outro; nasce active; autor
--      carimbado; a conformidade é OBRIGATÓRIA no registro (sem default — Lei 7);
--      e é CHECK (valor inválido recusado);
--   2. ⭐⭐ a conformidade é MUTÁVEL — qualquer valor vai para qualquer valor,
--      quantas vezes for preciso, cada mudança emitindo `assessed` (o DIVERGE de
--      TODO módulo com ciclo terminal desta onda);
--   3. ⭐ active ↔ archived reversível; cláusula ARQUIVADA não se reavalia;
--   4. cross-tenant barrado;
--   5. emit_event/anon/DELETE fora.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert71(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: iso instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'iso', 'Requisitos ISO', '0.1.0',
  'Requisitos de norma — a conformidade é MUTÁVEL, não um ciclo; active↔archived.',
  'domain', 'quality',
  '[{"key":"iso","canonicalName":"ISO"}]'::jsonb,
  '[{"key":"iso.requirement.manage","moduleId":"iso","description":"Gerir requisitos."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'iso', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'iso', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'iso.requirement.manage', 'iso'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, NASCE ACTIVE, CONFORMIDADE OBRIGATÓRIA E CHECK
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu requisito; conformidade obrigatória e CHECK ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into iso.requirements (tenant_id, clause_reference, description, compliance, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ISO 9001:2015 — 8.5.1',
          'controle da produção', 'compliant',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert71(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  -- ⭐ Sem conformidade: recusado (sem default — Lei 7, nada inventado).
  begin
    insert into iso.requirements (tenant_id, clause_reference, description)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ISO 14001 — 6.1.2', 'aspectos ambientais');
    perform pg_temp.assert71(false, 'DEVERIA TER FALHADO: sem conformidade declarada');
  exception when not_null_violation then
    perform pg_temp.assert71(true, '⭐ a conformidade é obrigatória no registro (sem default — Lei 7)');
  end;

  -- Conformidade fora do CHECK: recusado.
  begin
    insert into iso.requirements (tenant_id, clause_reference, description, compliance)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', 'y', 'talvez');
    perform pg_temp.assert71(false, 'DEVERIA TER FALHADO: conformidade fora do CHECK');
  exception when check_violation then
    perform pg_temp.assert71(true, '⭐ a conformidade é CHECK (compliant/non_compliant/not_applicable)');
  end;

  -- Nasce arquivado: recusado.
  begin
    insert into iso.requirements (tenant_id, clause_reference, description, compliance, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', 'y', 'compliant', 'archived');
    perform pg_temp.assert71(false, 'DEVERIA TER FALHADO: nasceu arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert71(v_erro like '%nasce ativo%', 'o requisito nasce ativo');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into iso.requirements (tenant_id, clause_reference, description, compliance)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'IATF 16949 — 8.3', 'projeto', 'non_compliant');

  select count(*) into v_n from iso.requirements;
  perform pg_temp.assert71(v_n = 1, 'o Beta enxerga só o requisito dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ A CONFORMIDADE É MUTÁVEL (o DIVERGE — não é ciclo terminal)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: qualquer conformidade vai para qualquer outra, sempre ==='

do $$
declare
  v_id uuid; v_assessed int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from iso.requirements
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and clause_reference like 'ISO 9001%';

  -- compliant → non_compliant → not_applicable → compliant: TODAS passam.
  update iso.requirements set compliance = 'non_compliant' where id = v_id;
  perform pg_temp.assert71(
    (select compliance from iso.requirements where id = v_id) = 'non_compliant',
    'compliant → non_compliant');

  update iso.requirements set compliance = 'not_applicable' where id = v_id;
  perform pg_temp.assert71(
    (select compliance from iso.requirements where id = v_id) = 'not_applicable',
    'non_compliant → not_applicable');

  update iso.requirements set compliance = 'compliant' where id = v_id;
  perform pg_temp.assert71(
    (select compliance from iso.requirements where id = v_id) = 'compliant',
    '⭐⭐ not_applicable → compliant — a conformidade é MUTÁVEL (não um ciclo terminal)');

  reset role;
  select count(*) into v_assessed from core.event_outbox where event_type = 'iso.requirement.assessed';
  perform pg_temp.assert71(v_assessed = 3, '⭐ cada reavaliação emitiu assessed (três mudanças, três fatos)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ ACTIVE ↔ ARCHIVED; ARQUIVADO NÃO SE REAVALIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: arquivar e reabrir; arquivado não se reavalia ==='

do $$
declare
  v_id uuid; v_erro text; v_arch int; v_rest int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from iso.requirements
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and clause_reference like 'ISO 9001%';

  update iso.requirements set status = 'archived' where id = v_id;
  perform pg_temp.assert71(
    (select status from iso.requirements where id = v_id) = 'archived', 'arquivar leva a archived');

  -- ⭐ Cláusula arquivada não se reavalia.
  begin
    update iso.requirements set compliance = 'non_compliant' where id = v_id;
    perform pg_temp.assert71(false, 'DEVERIA TER FALHADO: reavaliou cláusula arquivada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert71(v_erro like '%não se reavalia%',
      '⭐ requisito arquivado não se reavalia — fora de escopo não tem conformidade a medir');
  end;

  -- ⭐ E VOLTA (reversível), e aí reavalia.
  update iso.requirements set status = 'active' where id = v_id;
  update iso.requirements set compliance = 'non_compliant' where id = v_id;
  perform pg_temp.assert71(
    (select compliance from iso.requirements where id = v_id) = 'non_compliant',
    '⭐ a cláusula reaberta volta a ser reavaliável');

  reset role;
  select count(*) into v_arch from core.event_outbox where event_type = 'iso.requirement.archived';
  select count(*) into v_rest from core.event_outbox where event_type = 'iso.requirement.restored';
  perform pg_temp.assert71(v_arch = 1 and v_rest = 1, 'os fatos de arquivar e reabrir saíram');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    insert into iso.requirements (tenant_id, clause_reference, description, compliance)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'invasor', 'x', 'compliant');
    perform pg_temp.assert71(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert71(true, '⭐ cross-tenant barrado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CANETA/ANON/DELETE FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: emit_event/anon/DELETE fora ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from iso.requirements
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from iso.requirements where id = v_id;
    perform pg_temp.assert71(false, 'DEVERIA TER FALHADO: apagou requisito');
  exception when insufficient_privilege then
    perform pg_temp.assert71(true, 'apagar requisito não existe — fora de escopo é arquivar');
  end;

  begin
    perform iso.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'iso.requirement.registered', '{}'::jsonb);
    perform pg_temp.assert71(false, 'DEVERIA TER FALHADO: cliente emitiu evento');
  exception when insufficient_privilege then
    perform pg_temp.assert71(true, 'iso.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from iso.requirements limit 1;
    perform pg_temp.assert71(false, 'DEVERIA TER FALHADO: anon leu iso.requirements');
  exception when insufficient_privilege then
    perform pg_temp.assert71(true, '⭐ anon não encosta em iso.requirements');
  end;
  reset role;
end $$;

\echo ''
\echo '=== ⭐ MÓDULO 66 OK — conformidade mutável; active↔archived; FECHA a Onda Quatorze ==='
