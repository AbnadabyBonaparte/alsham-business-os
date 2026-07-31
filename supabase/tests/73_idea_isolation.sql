-- =============================================================================
-- O MÓDULO 68 NO BANCO — o funil que se isola, a ideia SEM projeto (o DIVERGE
-- do kanban), o movimento livre, o ciclo (promoted terminal / archived
-- reversível) e a FK intra-schema que barra apagar etapa ocupada
-- =============================================================================
--
-- ⭐ Domain 🔬 Pesquisa & Desenvolvimento (Onda Dezesseis, Fase 2) — o primeiro
-- da onda, ABRE o território novo.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert73(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: idea instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'idea', 'Ideias & Pipeline de Inovação', '0.1.0',
  'O funil de inovação: etapas do tenant + ideias que andam. Sem project_id (o DIVERGE do kanban).',
  'domain', 'rnd',
  '[{"key":"ideas","canonicalName":"Ideias"}]'::jsonb,
  '[{"key":"idea.idea.manage","moduleId":"idea","description":"Gerir o funil de ideias."}]'::jsonb,
  '[{"type":"idea.idea.registered","version":1,"description":"Uma ideia foi registrada."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'idea', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'idea', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'idea.idea.manage', 'idea'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ⭐⭐ A IDEIA NASCE SEM PROJETO, NUMA ETAPA, E ANDA (o DIVERGE)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: a ideia existe antes de qualquer projeto e move-se livre ==='

do $$
declare
  v_s1 uuid; v_s2 uuid; v_id uuid; v_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Duas etapas do funil (texto livre, ordenadas).
  insert into idea.stages (tenant_id, name, position)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Captação', 0) returning id into v_s1;
  insert into idea.stages (tenant_id, name, position)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Triagem', 1) returning id into v_s2;

  -- ⭐⭐ Uma ideia SEM projeto nenhum — mente o autor, o gatilho descarta.
  insert into idea.ideas (tenant_id, title, current_stage_id, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Motor solar modular', v_s1,
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_by;

  perform pg_temp.assert73(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  -- ⭐ Move de etapa por UPDATE simples, sem porteiro.
  update idea.ideas set current_stage_id = v_s2 where id = v_id;
  perform pg_temp.assert73(
    (select current_stage_id from idea.ideas where id = v_id) = v_s2,
    '⭐ a ideia andou de etapa por UPDATE simples (a liberdade do kanban)');

  -- Isolamento: o Beta não vê nada disso.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  perform pg_temp.assert73((select count(*) from idea.ideas) = 0, 'o Beta não vê a ideia do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ PROMOVER: virou projeto (terminal), exige o projeto de destino
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: promover exige projeto de destino; promoted é terminal ==='

do $$
declare
  v_id uuid; v_s uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_s from idea.stages where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name='Captação';
  insert into idea.ideas (tenant_id, title, current_stage_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ideia a promover', v_s) returning id into v_id;

  -- Promover SEM projeto de destino é recusado.
  begin
    update idea.ideas set status='promoted' where id = v_id;
    perform pg_temp.assert73(false, 'DEVERIA TER FALHADO: promover sem projeto de destino');
  exception when others then
    perform pg_temp.assert73(true, '⭐ promover exige o projeto de destino (promoted_project_id)');
  end;

  -- Promover COM projeto de destino funciona e carimba.
  update idea.ideas
     set status='promoted',
         promoted_project_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         promoted_project_name='Projeto Motor Solar'
   where id = v_id;
  perform pg_temp.assert73(
    (select promoted_at is not null from idea.ideas where id = v_id),
    '⭐ promovida: o carimbo promoted_at é do servidor');

  -- ⭐⭐ promoted é TERMINAL: não volta para active.
  begin
    update idea.ideas set status='active' where id = v_id;
    perform pg_temp.assert73(false, 'DEVERIA TER FALHADO: reabrir uma ideia promovida');
  exception when others then
    perform pg_temp.assert73(true, '⭐⭐ promoted é terminal — a ideia que virou projeto não volta');
  end;

  -- E promovida não anda mais pelo funil.
  begin
    update idea.ideas set current_stage_id =
      (select id from idea.stages where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name='Triagem')
     where id = v_id;
    perform pg_temp.assert73(false, 'DEVERIA TER FALHADO: mover uma ideia promovida');
  exception when others then
    perform pg_temp.assert73(true, '⭐ a ideia promovida não anda mais pelo funil');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ ARQUIVAR É REVERSÍVEL (a gaveta que volta é a MESMA ideia)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: archived ↔ active reversível ==='

do $$
declare
  v_id uuid; v_s uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_s from idea.stages where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name='Captação';
  insert into idea.ideas (tenant_id, title, current_stage_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ideia a engavetar', v_s) returning id into v_id;

  update idea.ideas set status='archived' where id = v_id;
  perform pg_temp.assert73(
    (select archived_at is not null from idea.ideas where id = v_id),
    'arquivada: o carimbo archived_at é do servidor');

  -- ⭐ Restaurar: volta a active e LIMPA o carimbo.
  update idea.ideas set status='active' where id = v_id;
  perform pg_temp.assert73(
    (select status='active' and archived_at is null from idea.ideas where id = v_id),
    '⭐ archived → active reversível, e o carimbo de arquivamento foi limpo');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ FK INTRA-SCHEMA: não se apaga etapa com ideia em cima
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: a etapa ocupada não se apaga (restrict); a vazia sai ==='

do $$
declare
  v_s_ocupada uuid; v_s_vazia uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_s_ocupada from idea.stages where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name='Captação';
  insert into idea.stages (tenant_id, name, position)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Etapa vazia', 9) returning id into v_s_vazia;

  begin
    delete from idea.stages where id = v_s_ocupada;
    perform pg_temp.assert73(false, 'DEVERIA TER FALHADO: apagar etapa com ideia em cima');
  exception when foreign_key_violation then
    perform pg_temp.assert73(true, '⭐ a etapa ocupada não se apaga (FK restrict)');
  end;

  delete from idea.stages where id = v_s_vazia;
  perform pg_temp.assert73(true, 'a etapa VAZIA se apaga (desenhar o funil é tentativa e erro)');
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT, A CANETA, ANON, E OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
declare v_s uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  select id into v_s from idea.stages where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name='Captação';

  begin
    insert into idea.ideas (tenant_id, title, current_stage_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasora', v_s);
    perform pg_temp.assert73(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert73(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform idea.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'idea.idea.registered', '{}'::jsonb);
    perform pg_temp.assert73(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert73(true, 'idea.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from idea.ideas limit 1;
    perform pg_temp.assert73(false, 'DEVERIA TER FALHADO: anon leu idea.ideas');
  exception when insufficient_privilege then
    perform pg_temp.assert73(true, '⭐ anon não encosta em idea.ideas');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'idea.idea.registered';
  perform pg_temp.assert73(v_n >= 3, 'cada ideia registrada emitiu idea.idea.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'idea.idea.promoted';
  perform pg_temp.assert73(v_n >= 1, 'a promoção emitiu idea.idea.promoted');
end $$;

\echo ''
\echo '=== MÓDULO 68 OK: ideia sem projeto, movimento livre, promoted terminal, archived reversível, FK intra-schema ==='
