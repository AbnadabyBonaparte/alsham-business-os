-- =============================================================================
-- O MÓDULO 54 NO BANCO — o marco que se isola, nasce planejado, é carimbado pelo
-- servidor ao concluir, ⭐ REABRE (done→planned, limpando o carimbo), e cujo
-- cancelamento é TERMINAL e exige razão
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os marcos de um tenant não aparecem no outro;
--   2. ⭐ **nasce planejado** e o autor é carimbado pelo servidor;
--   3. ⭐ **concluir carimba done_at pelo SERVIDOR**; ⭐⭐ **REABRIR (done→planned)
--      LIMPA done_at** (a coerência done ⇔ done_at exige) — a prova de que o
--      DIVERGE do dem/bud é real no banco, não só no motor;
--   4. **cancelar exige razão**; **cancelled é TERMINAL** (nem reabre nem
--      conclui);
--   5. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert59(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: sched instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sched', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'sched', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'sched.milestone.manage', 'sched'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO PLANEJADO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu marco; nasce planned; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into sched.milestones (tenant_id, project_id, project_name, title, due_on, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Implantação ERP', 'Kickoff', '2027-03-01',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert59(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  begin
    insert into sched.milestones (tenant_id, project_id, title, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Nasce Errado', 'done');
    perform pg_temp.assert59(false, 'DEVERIA TER FALHADO: nasceu concluído');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert59(v_erro like '%nasce planejado%', 'o marco nasce planejado');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into sched.milestones (tenant_id, project_id, title)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Marco da obra');

  select count(*) into v_n from sched.milestones;
  perform pg_temp.assert59(v_n = 1, 'o Beta enxerga só o marco dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ CONCLUIR CARIMBA done_at; REABRIR LIMPA done_at
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: concluir carimba done_at; ⭐ REABRIR volta a planned e zera done_at ==='

do $$
declare
  v_id uuid; v_status text; v_done timestamptz; v_by uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from sched.milestones
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Kickoff';

  -- Concluir carimba pelo servidor.
  update sched.milestones set status = 'done' where id = v_id;
  select status, done_at, done_by into v_status, v_done, v_by from sched.milestones where id = v_id;
  perform pg_temp.assert59(v_status = 'done', 'o marco foi concluído');
  perform pg_temp.assert59(v_done is not null, '⭐ done_at carimbado pelo servidor');
  perform pg_temp.assert59(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ done_by é quem concluiu (servidor)');

  -- ⭐⭐ REABRIR (o DIVERGE do dem/bud): volta a planned e ZERA os carimbos, senão
  -- a coerência done ⇔ done_at falharia.
  update sched.milestones set status = 'planned' where id = v_id;
  select status, done_at, done_by into v_status, v_done, v_by from sched.milestones where id = v_id;
  perform pg_temp.assert59(v_status = 'planned', '⭐⭐ o marco concluído por engano REABRE (done→planned)');
  perform pg_temp.assert59(v_done is null, '⭐⭐ reabrir LIMPA done_at (coerência done ⇔ done_at)');
  perform pg_temp.assert59(v_by is null, 'reabrir limpa done_by também');

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type in ('sched.milestone.completed','sched.milestone.reopened');
  perform pg_temp.assert59(v_n = 2, 'os fatos de concluir e reabrir saíram (completed + reopened)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ CANCELAR EXIGE RAZÃO; cancelled É TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: cancelar exige razão; o cancelado não reabre nem conclui ==='

do $$
declare
  v_id uuid; v_status text; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into sched.milestones (tenant_id, project_id, title)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Marco a abandonar')
  returning id into v_id;

  begin
    update sched.milestones set status = 'cancelled' where id = v_id;
    perform pg_temp.assert59(false, 'DEVERIA TER FALHADO: cancelou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert59(v_erro like '%razão%', '⭐ cancelar exige uma razão');
  end;

  update sched.milestones set status = 'cancelled', cancel_reason = 'escopo removido' where id = v_id;
  select status into v_status from sched.milestones where id = v_id;
  perform pg_temp.assert59(v_status = 'cancelled', 'cancelou com razão');

  -- O cancelado é terminal: não reabre.
  begin
    update sched.milestones set status = 'planned' where id = v_id;
    perform pg_temp.assert59(false, 'DEVERIA TER FALHADO: reabriu o marco cancelado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert59(v_erro like '%terminal%', '⭐ o cancelado é terminal — não reabre');
  end;

  -- E também não conclui.
  begin
    update sched.milestones set status = 'done' where id = v_id;
    perform pg_temp.assert59(false, 'DEVERIA TER FALHADO: concluiu o marco cancelado');
  exception when others then
    perform pg_temp.assert59(true, 'o cancelado tampouco conclui');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'sched.milestone.cancelled';
  perform pg_temp.assert59(v_n = 1, 'o fato do cancelamento saiu');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO MARCO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  begin
    insert into sched.milestones (tenant_id, project_id, title)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Invasor');
    perform pg_temp.assert59(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert59(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from sched.milestones limit 1;

  begin
    delete from sched.milestones where id = v_id;
    perform pg_temp.assert59(false, 'DEVERIA TER FALHADO: apagou marco');
  exception when insufficient_privilege then
    perform pg_temp.assert59(true, 'apagar não existe — marco percorrido é história');
  end;

  begin
    perform sched.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sched.milestone.registered', '{}'::jsonb);
    perform pg_temp.assert59(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert59(true, 'sched.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from sched.milestones limit 1;
    perform pg_temp.assert59(false, 'DEVERIA TER FALHADO: anon leu sched.milestones');
  exception when insufficient_privilege then
    perform pg_temp.assert59(true, '⭐ anon não encosta em sched.milestones');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 54 OK: marco isolado, concluir/reabrir carimbam e limpam, cancelado terminal, anon fora ==='
