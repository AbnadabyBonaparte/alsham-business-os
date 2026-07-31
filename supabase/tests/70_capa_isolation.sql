-- =============================================================================
-- O MÓDULO 65 NO BANCO — a ação que se isola, o tipo CHECK, o ciclo
-- open→verified→closed (SEM atalho), e a verificação carimbada pelo servidor
-- =============================================================================
--
-- ⭐ Domain 🧪 Qualidade (Onda Quatorze, Fase 2).
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--   1. as ações de um tenant não aparecem no outro; nasce open; autor carimbado;
--      o tipo é CHECK (corrective/preventive) — outro valor é recusado no banco;
--   2. ⭐⭐ verificar EXIGE a nota E carimba QUEM pelo servidor (o digitado morre);
--      NÃO há atalho open→closed — sem verificação, não fecha;
--   3. ⭐ verificada CONGELA (o plano não se edita); closed é terminal; o carimbo
--      de verificação não se forja por UPDATE de plano;
--   4. cross-tenant barrado;
--   5. emit_event/anon/DELETE fora.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert70(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: capa instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'capa', 'CAPA', '0.1.0',
  'Ações corretivas e preventivas — tipo CHECK, ciclo com verificação.',
  'domain', 'quality',
  '[{"key":"capa","canonicalName":"CAPA"}]'::jsonb,
  '[{"key":"capa.action.manage","moduleId":"capa","description":"Criar/editar."},
    {"key":"capa.action.decide","moduleId":"capa","description":"Verificar/fechar."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'capa', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'capa', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.perm, 'capa'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('capa.action.manage'), ('capa.action.decide')) as p(perm)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, NASCE OPEN, AUTOR CARIMBADO, TIPO É CHECK
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua ação; nasce open; tipo é CHECK ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into capa.actions (tenant_id, action_type, description, responsible, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'corrective', 'recalibrar balança',
          'manutenção', '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert70(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  -- ⭐ Tipo é CHECK: outro valor é recusado.
  begin
    insert into capa.actions (tenant_id, action_type, description, responsible)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'melhoria', 'x', 'y');
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: tipo fora do CHECK');
  exception when check_violation then
    perform pg_temp.assert70(true, '⭐ o tipo é CHECK (corrective/preventive) — a física do método');
  end;

  begin
    insert into capa.actions (tenant_id, action_type, description, responsible, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'preventive', 'x', 'y', 'verified');
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: nasceu verificada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert70(v_erro like '%nasce aberta%', 'a ação nasce aberta');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into capa.actions (tenant_id, action_type, description, responsible)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'preventive', 'treinar equipe', 'RH');

  select count(*) into v_n from capa.actions;
  perform pg_temp.assert70(v_n = 1, 'o Beta enxerga só a ação dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ VERIFICAR EXIGE NOTA E CARIMBA O SERVIDOR; SEM ATALHO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: sem atalho open→closed; verificar exige nota e carimba quem ==='

do $$
declare
  v_id uuid; v_erro text; v_vby uuid; v_ver int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from capa.actions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and action_type = 'corrective';

  -- ⭐ Sem atalho: open → closed não existe.
  begin
    update capa.actions set status = 'closed' where id = v_id;
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: fechou sem verificar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert70(v_erro like '%não existe%',
      '⭐ sem atalho open→closed — sem verificação, não fecha');
  end;

  -- Verificar sem nota: recusado.
  begin
    update capa.actions set status = 'verified' where id = v_id;
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: verificou sem nota');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert70(v_erro like '%exige a nota%', '⭐⭐ verificar exige a nota');
  end;

  -- Verificar com nota E um verified_by MENTIDO: o servidor carimba o verdadeiro.
  update capa.actions
     set status = 'verified',
         verification_note = 'reinspeção aprovada — QA',
         verified_by = '22222222-2222-4222-8222-222222222222'
   where id = v_id;
  select verified_by into v_vby from capa.actions where id = v_id;
  perform pg_temp.assert70(v_vby = '11111111-1111-4111-8111-111111111111',
    '⭐⭐ verified_by é o servidor (auth.uid) — o digitado morreu');

  -- verified → closed.
  update capa.actions set status = 'closed' where id = v_id;
  perform pg_temp.assert70(
    (select status from capa.actions where id = v_id) = 'closed', 'verified → closed');

  reset role;
  select count(*) into v_ver from core.event_outbox where event_type = 'capa.action.verified';
  perform pg_temp.assert70(v_ver = 1, 'o fato de verificação saiu');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ VERIFICADA CONGELA; CLOSED TERMINAL; CARIMBO NÃO SE FORJA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: verificada congela; closed terminal; o carimbo não se forja ==='

do $$
declare
  v_open uuid; v_verif uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Uma ação aberta: o plano edita-se; mas o carimbo não se forja por UPDATE.
  insert into capa.actions (tenant_id, action_type, description, responsible)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'preventive', 'revisar procedimento', 'QA')
  returning id into v_open;

  update capa.actions set responsible = 'Engenharia' where id = v_open;  -- edita plano: ok
  perform pg_temp.assert70(
    (select responsible from capa.actions where id = v_open) = 'Engenharia',
    'o plano edita-se enquanto aberto');

  begin
    update capa.actions set verified_at = now() where id = v_open;
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: forjou o carimbo de verificação');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert70(v_erro like '%não se edita à mão%',
      '⭐ o carimbo de verificação não se forja por UPDATE de plano');
  end;

  -- Uma ação verificada CONGELA o plano.
  insert into capa.actions (tenant_id, action_type, description, responsible)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'corrective', 'trocar peça', 'Manutenção')
  returning id into v_verif;
  update capa.actions set status = 'verified', verification_note = 'ok' where id = v_verif;

  begin
    update capa.actions set description = 'mudando depois de verificar' where id = v_verif;
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: editou plano verificado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert70(v_erro like '%congelada%', '⭐ ação verificada congela o plano');
  end;

  -- Closed terminal.
  update capa.actions set status = 'closed' where id = v_verif;
  begin
    update capa.actions set status = 'verified' where id = v_verif;
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: moveu ação fechada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert70(v_erro like '%terminal%', '⭐ closed é terminal — ação que volta é ação nova');
  end;
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
    insert into capa.actions (tenant_id, action_type, description, responsible)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'corrective', 'invasor', 'x');
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert70(true, '⭐ cross-tenant barrado');
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

  select id into v_id from capa.actions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from capa.actions where id = v_id;
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: apagou ação');
  exception when insufficient_privilege then
    perform pg_temp.assert70(true, 'apagar ação não existe — fechar é status terminal');
  end;

  begin
    perform capa.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'capa.action.opened', '{}'::jsonb);
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: cliente emitiu evento');
  exception when insufficient_privilege then
    perform pg_temp.assert70(true, 'capa.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from capa.actions limit 1;
    perform pg_temp.assert70(false, 'DEVERIA TER FALHADO: anon leu capa.actions');
  exception when insufficient_privilege then
    perform pg_temp.assert70(true, '⭐ anon não encosta em capa.actions');
  end;
  reset role;
end $$;

\echo ''
\echo '=== ⭐ MÓDULO 65 OK — tipo CHECK; ciclo com verificação; carimbo do servidor ==='
