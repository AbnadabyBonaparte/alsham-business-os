-- =============================================================================
-- O MÓDULO 60 NO BANCO — o risco que se isola, a régua 1–5 na constraint, os
-- carimbos do servidor e a FÍSICA NOVA: mitigated REABRE, closed é TERMINAL
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os riscos de um tenant não aparecem no outro; ⭐ nasce ABERTO e o autor é
--      carimbado pelo servidor (o created_by mentido no INSERT é descartado);
--   2. ⭐ a régua 1–5 é física do método — probability=6 (ou 0) bate no CHECK;
--   3. ⭐⭐ **A ASSINATURA:** open→mitigated (carimba mitigated_at), mitigated→open
--      REABRE (o mesmo risco volta; mitigated_at é LIMPO), →closed, e closed→open
--      FALHA (terminal). É o cenário que prova a física nova;
--   4. ⭐ o conteúdo congela depois de fechar;
--   5. cross-tenant barrado; apagar não existe; a caneta de emitir não é do
--      cliente; o `anon` não encosta na tabela.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert65(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: risk instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'risk', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'risk', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'risk.entry.manage', 'risk'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ABERTO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu risco; nasce open; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into risk.entries (tenant_id, project_id, project_name, description, probability, impact, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'Obra', 'fornecedor único de insumo crítico', 4, 5,
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert65(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  begin
    insert into risk.entries (tenant_id, project_id, description, probability, impact, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Nasce Errado', 2, 2, 'mitigated');
    perform pg_temp.assert65(false, 'DEVERIA TER FALHADO: nasceu mitigado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert65(v_erro like '%nasce aberto%', 'o risco nasce aberto');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into risk.entries (tenant_id, project_id, description, probability, impact)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Risco do Beta', 1, 1);

  select count(*) into v_n from risk.entries;
  perform pg_temp.assert65(v_n = 1, 'o Beta enxerga só o risco dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A RÉGUA 1–5 É FÍSICA DO MÉTODO (o CHECK)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: probabilidade/impacto fora de 1..5 batem no CHECK ==='

do $$
declare
  v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into risk.entries (tenant_id, project_id, description, probability, impact)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Fora da régua', 6, 3);
    perform pg_temp.assert65(false, 'DEVERIA TER FALHADO: probabilidade 6');
  exception when check_violation then
    perform pg_temp.assert65(true, '⭐ probabilidade=6 recusada pelo CHECK (régua 1–5)');
  end;

  begin
    insert into risk.entries (tenant_id, project_id, description, probability, impact)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Fora da régua', 3, 0);
    perform pg_temp.assert65(false, 'DEVERIA TER FALHADO: impacto 0');
  exception when check_violation then
    perform pg_temp.assert65(true, '⭐ impacto=0 recusado pelo CHECK (régua 1–5)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ A ASSINATURA: mitigated REABRE, closed é TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: open→mitigated→open (reabre, limpa carimbo)→closed; closed→open FALHA ==='

do $$
declare
  v_id uuid; v_mit timestamptz; v_clo timestamptz; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from risk.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and description = 'fornecedor único de insumo crítico';

  -- open → mitigated: carimba mitigated_at.
  update risk.entries set status = 'mitigated' where id = v_id;
  select mitigated_at into v_mit from risk.entries where id = v_id;
  perform pg_temp.assert65(v_mit is not null, '⭐ mitigated_at carimbado pelo servidor');

  -- ⭐⭐ mitigated → open: REABRE — o mesmo risco volta — e LIMPA o carimbo.
  update risk.entries set status = 'open' where id = v_id;
  select mitigated_at into v_mit from risk.entries where id = v_id;
  perform pg_temp.assert65(
    (select status from risk.entries where id = v_id) = 'open',
    '⭐⭐ mitigated → open: o risco REABRIU (o mesmo risco volta)');
  perform pg_temp.assert65(v_mit is null, '⭐⭐ ao reabrir, o carimbo de mitigação foi LIMPO');

  -- open → closed: carimba closed_at.
  update risk.entries set status = 'closed' where id = v_id;
  select closed_at into v_clo from risk.entries where id = v_id;
  perform pg_temp.assert65(v_clo is not null, '⭐ closed_at carimbado pelo servidor');

  -- ⭐ closed → open: FALHA — terminal.
  begin
    update risk.entries set status = 'open' where id = v_id;
    perform pg_temp.assert65(false, 'DEVERIA TER FALHADO: reabriu o risco encerrado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert65(v_erro like '%não reabre%', '⭐ closed é TERMINAL — não reabre (o DIVERGE do mitigated)');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'risk.entry.mitigated';
  perform pg_temp.assert65(v_n = 1, 'o fato de mitigação saiu');
  select count(*) into v_n from core.event_outbox where event_type = 'risk.entry.reopened';
  perform pg_temp.assert65(v_n = 1, 'o fato de reabertura saiu');
  select count(*) into v_n from core.event_outbox where event_type = 'risk.entry.closed';
  perform pg_temp.assert65(v_n = 1, 'o fato de encerramento saiu');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O CONTEÚDO CONGELA DEPOIS DE FECHAR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: descrição/régua/plano congelam depois de encerrar ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from risk.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status = 'closed' limit 1;

  begin
    update risk.entries set description = 'reescrevendo o fechado' where id = v_id;
    perform pg_temp.assert65(false, 'DEVERIA TER FALHADO: editou risco encerrado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert65(v_erro like '%não mudam mais%', '⭐ descrição/régua/plano congelam depois de encerrar');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT: O ALFA NÃO ESCREVE NO RISCO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  begin
    insert into risk.entries (tenant_id, project_id, description, probability, impact)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Invasor', 2, 2);
    perform pg_temp.assert65(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert65(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: apagar não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from risk.entries limit 1;

  begin
    delete from risk.entries where id = v_id;
    perform pg_temp.assert65(false, 'DEVERIA TER FALHADO: apagou risco');
  exception when insufficient_privilege then
    perform pg_temp.assert65(true, 'apagar não existe — o registro de riscos se mantém');
  end;

  begin
    perform risk.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'risk.entry.registered', '{}'::jsonb);
    perform pg_temp.assert65(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert65(true, 'risk.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from risk.entries limit 1;
    perform pg_temp.assert65(false, 'DEVERIA TER FALHADO: anon leu risk.entries');
  exception when insufficient_privilege then
    perform pg_temp.assert65(true, '⭐ anon não encosta em risk.entries');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 60 OK: risco isolado, régua 1–5 no CHECK, mitigated reabre, closed terminal, anon fora ==='
