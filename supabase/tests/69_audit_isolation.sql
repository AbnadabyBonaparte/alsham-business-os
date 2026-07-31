-- =============================================================================
-- O MÓDULO 64 NO BANCO — a auditoria que se isola, o ciclo TERMINAL, o achado
-- IMUTÁVEL com FK intra-schema, e o cancelamento que exige razão
-- =============================================================================
--
-- ⭐ Domain 🧪 Qualidade (Onda Quatorze, Fase 2).
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--   1. as auditorias de um tenant não aparecem no outro; nasce planned; o autor
--      é carimbado; cancelar EXIGE razão (constraint);
--   2. ⭐ o ciclo é TERMINAL (a física do proj): completed e cancelled não têm saída;
--   3. ⭐⭐ o achado liga-se à auditoria por FK COMPOSTA INTRA-SCHEMA (barra
--      auditoria inexistente/de outro tenant) e é IMUTÁVEL (nem UPDATE nem DELETE);
--      auditoria cancelada não recebe achado; o achado guarda o nc por id solto;
--   4. cross-tenant barrado;
--   5. a caneta de emitir evento não é do cliente; anon fora.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert69(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: audit instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'audit', 'Auditorias', '0.1.0',
  'A auditoria de qualidade — ciclo terminal, achado imutável, id solto ao nc.',
  'domain', 'quality',
  '[{"key":"audit","canonicalName":"Auditorias"}]'::jsonb,
  '[{"key":"audit.audit.manage","moduleId":"audit","description":"Planejar/concluir/cancelar."},
    {"key":"audit.finding.record","moduleId":"audit","description":"Registrar achados."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'audit', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'audit', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.perm, 'audit'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('audit.audit.manage'), ('audit.finding.record')) as p(perm)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, NASCE PLANNED, AUTOR CARIMBADO, CANCELAR EXIGE RAZÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua auditoria; nasce planned; cancelar exige razão ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into audit.audits (tenant_id, audit_type, scope, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'interna', 'linha de produção 3',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert69(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  begin
    insert into audit.audits (tenant_id, audit_type, scope, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', 'y', 'completed');
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: nasceu concluída');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert69(v_erro like '%nasce planejada%', 'a auditoria nasce planejada');
  end;

  -- Cancelar SEM razão: recusado pela constraint.
  begin
    update audit.audits set status = 'cancelled' where id = v_id;
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: cancelou sem razão');
  exception when check_violation then
    perform pg_temp.assert69(true, '⭐ cancelar a auditoria exige razão (a assimetria do proj)');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into audit.audits (tenant_id, audit_type, scope)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'certificação', 'ISO 9001');

  select count(*) into v_n from audit.audits;
  perform pg_temp.assert69(v_n = 1, 'o Beta enxerga só a auditoria dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O CICLO É TERMINAL (a física do proj)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: planned → completed; completed é terminal ==='

do $$
declare
  v_id uuid; v_erro text; v_done int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from audit.audits
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and audit_type = 'interna';

  update audit.audits set status = 'completed' where id = v_id;
  perform pg_temp.assert69(
    (select status from audit.audits where id = v_id) = 'completed',
    'planned → completed');

  -- ⭐ Terminal: de completed não sai.
  begin
    update audit.audits set status = 'cancelled', cancel_reason = 'tarde demais' where id = v_id;
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: moveu auditoria concluída');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert69(v_erro like '%não existe%',
      '⭐ completed é terminal — auditoria encerrada não reabre (a física do proj)');
  end;

  reset role;
  select count(*) into v_done from core.event_outbox where event_type = 'audit.audit.completed';
  perform pg_temp.assert69(v_done = 1, 'o fato de conclusão saiu');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ O ACHADO: FK INTRA-SCHEMA, IMUTÁVEL, id solto ao nc
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: achado liga por FK intra-schema, é imutável, cancelada não recebe ==='

do $$
declare
  v_audit uuid; v_beta uuid; v_finding uuid; v_erro text; v_n int; v_cancel uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_audit from audit.audits
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and audit_type = 'interna';

  -- Achado com nc por id solto.
  insert into audit.findings (tenant_id, audit_id, description, nc_entry_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_audit, 'sem registro de calibração',
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd')
  returning id into v_finding;
  perform pg_temp.assert69(true, 'achado registrado, com nc por id solto');

  -- Achado em auditoria inexistente: FK composta barra.
  begin
    insert into audit.findings (tenant_id, audit_id, description)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '99999999-9999-4999-8999-999999999999', 'achado órfão');
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: achado em auditoria inexistente');
  exception when foreign_key_violation then
    perform pg_temp.assert69(true, '⭐ achado em auditoria inexistente barrado (FK composta intra-schema)');
  end;

  -- Achado do Alfa apontando auditoria do Beta: a FK exige (id,tenant) do mesmo.
  reset role;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_beta from audit.audits where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    insert into audit.findings (tenant_id, audit_id, description)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_beta, 'atravessando tenant');
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: achado do Alfa na auditoria do Beta');
  exception when foreign_key_violation then
    perform pg_temp.assert69(true, '⭐ o achado não atravessa tenant (FK composta)');
  end;

  -- ⭐ O achado é IMUTÁVEL em DUAS camadas.
  -- Camada 1 — o cliente não tem a caneta: nenhum grant de UPDATE.
  begin
    update audit.findings set description = 'reescrevendo' where id = v_finding;
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: cliente editou achado');
  exception when insufficient_privilege then
    perform pg_temp.assert69(true, '⭐ o achado não tem porta de UPDATE para o cliente (camada 1)');
  end;
  -- Camada 2 — nem o DONO DO BANCO reescreve: o gatilho barra.
  reset role;
  begin
    update audit.findings set description = 'reescrevendo como dono' where id = v_finding;
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: dono editou achado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert69(v_erro like '%fato constatado%',
      '⭐ nem o dono do banco reescreve o achado (camada 2 — o gatilho)');
  end;
  -- volta a ser o Alfa para o resto do cenário
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Auditoria CANCELADA não recebe achado.
  insert into audit.audits (tenant_id, audit_type, scope)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'externa', 'a cancelar')
  returning id into v_cancel;
  update audit.audits set status = 'cancelled', cancel_reason = 'sem auditor' where id = v_cancel;
  begin
    insert into audit.findings (tenant_id, audit_id, description)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_cancel, 'achado tardio');
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: achado em auditoria cancelada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert69(v_erro like '%cancelada não recebe%', 'auditoria cancelada não recebe achado');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'audit.finding.recorded';
  perform pg_temp.assert69(v_n = 1, 'o fato de achado saiu (uma vez)');
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
    insert into audit.audits (tenant_id, audit_type, scope)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'invasora', 'x');
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert69(true, '⭐ cross-tenant barrado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CANETA/ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: emit_event/anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    perform audit.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'audit.audit.scheduled', '{}'::jsonb);
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: cliente emitiu evento');
  exception when insufficient_privilege then
    perform pg_temp.assert69(true, 'audit.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from audit.audits limit 1;
    perform pg_temp.assert69(false, 'DEVERIA TER FALHADO: anon leu audit.audits');
  exception when insufficient_privilege then
    perform pg_temp.assert69(true, '⭐ anon não encosta em audit.audits');
  end;
  reset role;
end $$;

\echo ''
\echo '=== ⭐ MÓDULO 64 OK — auditoria terminal; achado imutável FK intra-schema; nc id solto ==='
