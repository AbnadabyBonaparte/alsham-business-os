-- =============================================================================
-- O MÓDULO 78 NO BANCO — a vulnerabilidade que se isola, a régua 1–5 na
-- constraint, os carimbos do servidor e AS DUAS RESPOSTAS TERMINAIS:
-- `remediated` (corrigi-a) e `accepted_risk` (decidi conviver com ela), ambas
-- com justificativa escrita e sem volta.
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as vulnerabilidades de um tenant não aparecem no outro; ⭐ nasce ABERTA e
--      o autor é carimbado pelo servidor (o created_by mentido no INSERT é
--      descartado); ⭐ a régua 1–5 é física do método — severity=6 bate no CHECK;
--   2. ⭐ o ciclo: open→in_progress (progressed); in_progress→open REABRE
--      (reavaliar — permitido); in_progress→remediated exige a resolução
--      (vazia → invalid_parameter_value; com nota → carimba resolved_at);
--      `remediated` é TERMINAL (remediated→in_progress falha) e o conteúdo
--      congela;
--   3. ⭐⭐ A SEGUNDA RESPOSTA TERMINAL: outra vulnerabilidade vai
--      open→accepted_risk (exige a justificativa do risco aceito) — e é TERMINAL
--      (accepted_risk→open falha). As duas saídas com justificativa, sem volta;
--   4. cross-tenant barrado; a caneta de emitir não é do cliente; o `anon` não
--      encosta na tabela;
--   5. os cinco fatos saíram no correio: registered, progressed, remediated,
--      accepted, reopened.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert83(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: vuln instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'vuln', 'Gestão de Vulnerabilidades', '0.1.0',
  'A vulnerabilidade DOS SISTEMAS DO TENANT; severidade 1–5, remediated e accepted_risk como respostas terminais.',
  'domain', 'infosec',
  '[{"key":"vulnerability-management","canonicalName":"Gestão de vulnerabilidades"}]'::jsonb,
  '[{"key":"vuln.finding.manage","moduleId":"vuln","description":"Registrar, tratar e encerrar vulnerabilidades."}]'::jsonb,
  '[{"type":"vuln.finding.registered","version":1,"description":"Registrada."},
    {"type":"vuln.finding.progressed","version":1,"description":"Em tratamento."},
    {"type":"vuln.finding.remediated","version":1,"description":"Remediada."},
    {"type":"vuln.finding.accepted","version":1,"description":"Risco aceito."},
    {"type":"vuln.finding.reopened","version":1,"description":"Reaberta."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vuln', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'vuln', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- A permissão ÚNICA do módulo, concedida aos DOIS operadores.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'vuln.finding.manage', 'vuln'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE ABERTA, O AUTOR VEM DO SERVIDOR, ISOLA, E A RÉGUA É 1–5
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce open; created_by carimbado; isola; severity 1..5 ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into vuln.findings (tenant_id, title, description, affected_system, severity, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'Injeção de SQL no formulário de busca', 'parâmetro não sanitizado no endpoint de busca',
          'portal-web', 4,
          '22222222-2222-4222-8222-222222222222')  -- o autor mentido
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert83(v_st = 'open', 'a vulnerabilidade nasce open');
  perform pg_temp.assert83(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  -- ⭐ A régua 1–5 é física do método.
  begin
    insert into vuln.findings (tenant_id, title, description, severity)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fora da régua', 'severidade impossível', 6);
    perform pg_temp.assert83(false, 'DEVERIA TER FALHADO: severity 6');
  exception when check_violation then
    perform pg_temp.assert83(true, '⭐ severity=6 recusada pelo CHECK (régua 1–5)');
  end;

  -- Isolamento: o Beta não enxerga a vulnerabilidade do Alfa.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  select count(*) into v_n from vuln.findings;
  perform pg_temp.assert83(v_n = 0, 'o Beta não vê a vulnerabilidade do Alfa (cross-tenant)');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O CICLO: reabrir permitido, remediar exige nota, TERMINAL, congela
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: open→in_progress→open (reabre); →remediated exige resolução; terminal; congela ==='

do $$
declare v_id uuid; v_res timestamptz;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from vuln.findings
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and title = 'Injeção de SQL no formulário de busca';

  -- open → in_progress (progressed).
  update vuln.findings set status = 'in_progress' where id = v_id;
  perform pg_temp.assert83((select status from vuln.findings where id = v_id) = 'in_progress',
    'open → in_progress: entrou em tratamento');

  -- ⭐ in_progress → open: REABRE (reavaliar — permitido).
  update vuln.findings set status = 'open' where id = v_id;
  perform pg_temp.assert83((select status from vuln.findings where id = v_id) = 'open',
    '⭐ in_progress → open: a reabertura (reavaliar) é permitida');

  -- Volta a in_progress para poder remediar.
  update vuln.findings set status = 'in_progress' where id = v_id;

  -- ⭐ in_progress → remediated com resolução VAZIA: barrada.
  begin
    update vuln.findings set status = 'remediated', resolution = '' where id = v_id;
    perform pg_temp.assert83(false, 'DEVERIA TER FALHADO: remediar sem a resposta escrita');
  exception when invalid_parameter_value then
    perform pg_temp.assert83(true, '⭐ remediar exige a resolução escrita (vazia recusada)');
  end;

  -- in_progress → remediated com a nota: carimba resolved_at.
  update vuln.findings
     set status = 'remediated', resolution = 'input sanitizado e prepared statement aplicado; retestado'
   where id = v_id;
  select resolved_at into v_res from vuln.findings where id = v_id;
  perform pg_temp.assert83(v_res is not null, '⭐ ao remediar, resolved_at é carimbado pelo servidor');

  -- ⭐ remediated é TERMINAL: remediated → in_progress falha.
  begin
    update vuln.findings set status = 'in_progress' where id = v_id;
    perform pg_temp.assert83(false, 'DEVERIA TER FALHADO: reabriu a vulnerabilidade remediada');
  exception when invalid_parameter_value then
    perform pg_temp.assert83(true, '⭐ remediated é TERMINAL — remediated → in_progress não existe');
  end;

  -- ⭐ O conteúdo congela depois de remediar.
  begin
    update vuln.findings set title = 'reescrevendo o encerrado' where id = v_id;
    perform pg_temp.assert83(false, 'DEVERIA TER FALHADO: editou vulnerabilidade encerrada');
  exception when invalid_parameter_value then
    perform pg_temp.assert83(true, '⭐ o conteúdo congela depois de remediada — nada nela muda mais');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ A SEGUNDA RESPOSTA TERMINAL: accepted_risk
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: open→accepted_risk exige justificativa; accepted_risk é TERMINAL ==='

do $$
declare v_id uuid; v_res timestamptz;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into vuln.findings (tenant_id, title, description, affected_system, severity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'Biblioteca legada sem patch disponível', 'dependência descontinuada, sem correção do fornecedor',
          'servico-batch', 2)
  returning id into v_id;

  -- ⭐ open → accepted_risk com justificativa VAZIA: barrada.
  begin
    update vuln.findings set status = 'accepted_risk', resolution = '' where id = v_id;
    perform pg_temp.assert83(false, 'DEVERIA TER FALHADO: aceitar o risco sem a justificativa');
  exception when invalid_parameter_value then
    perform pg_temp.assert83(true, '⭐ aceitar o risco exige a justificativa escrita (vazia recusada)');
  end;

  -- open → accepted_risk com a justificativa: carimba resolved_at.
  update vuln.findings
     set status = 'accepted_risk',
         resolution = 'risco aceito: baixa severidade e custo de troca supera a exposição; revisão em 12 meses'
   where id = v_id;
  select resolved_at into v_res from vuln.findings where id = v_id;
  perform pg_temp.assert83(
    (select status from vuln.findings where id = v_id) = 'accepted_risk' and v_res is not null,
    '⭐⭐ open → accepted_risk: a SEGUNDA resposta terminal, com justificativa e carimbo');

  -- ⭐⭐ accepted_risk é TERMINAL: accepted_risk → open falha.
  begin
    update vuln.findings set status = 'open' where id = v_id;
    perform pg_temp.assert83(false, 'DEVERIA TER FALHADO: reabriu o risco aceito');
  exception when invalid_parameter_value then
    perform pg_temp.assert83(true, '⭐⭐ accepted_risk é TERMINAL — a que reaparece é registro novo (como remediated)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT, A CANETA NÃO É DO CLIENTE, ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into vuln.findings (tenant_id, title, description, severity)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 'escrita no tenant do vizinho', 3);
    perform pg_temp.assert83(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert83(true, '⭐ cross-tenant barrado: o Alfa não registra no tenant do Beta');
  end;

  begin
    perform vuln.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vuln.finding.registered', '{}'::jsonb);
    perform pg_temp.assert83(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert83(true, 'vuln.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from vuln.findings limit 1;
    perform pg_temp.assert83(false, 'DEVERIA TER FALHADO: anon leu vuln.findings');
  exception when insufficient_privilege then
    perform pg_temp.assert83(true, '⭐ anon não encosta em vuln.findings');
  end;
  reset role;
end $$;

-- =============================================================================
-- CENÁRIO 5 — OS CINCO FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: registered, progressed, remediated, accepted, reopened no outbox ==='

do $$
declare v_n int;
begin
  reset role;

  select count(*) into v_n from core.event_outbox where event_type = 'vuln.finding.registered';
  perform pg_temp.assert83(v_n >= 1, 'cada vulnerabilidade registrada emitiu vuln.finding.registered');

  select count(*) into v_n from core.event_outbox where event_type = 'vuln.finding.progressed';
  perform pg_temp.assert83(v_n >= 1, 'entrar em tratamento emitiu vuln.finding.progressed');

  select count(*) into v_n from core.event_outbox where event_type = 'vuln.finding.remediated';
  perform pg_temp.assert83(v_n >= 1, 'remediar emitiu vuln.finding.remediated');

  select count(*) into v_n from core.event_outbox where event_type = 'vuln.finding.accepted';
  perform pg_temp.assert83(v_n >= 1, 'aceitar o risco emitiu vuln.finding.accepted');

  select count(*) into v_n from core.event_outbox where event_type = 'vuln.finding.reopened';
  perform pg_temp.assert83(v_n >= 1, 'reabrir emitiu vuln.finding.reopened');
end $$;

\echo ''
\echo '=== MÓDULO 78 OK: vulnerabilidade isolada, régua 1–5 no CHECK, remediated e accepted_risk terminais com justificativa, anon fora ==='
