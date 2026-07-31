-- =============================================================================
-- O MÓDULO 75 NO BANCO — o risco CORPORATIVO que se isola, a régua 1–5 na
-- constraint, o CHECK do tratamento (os 4 T's da ISO 31000), os carimbos do
-- servidor e a FÍSICA MANTIDA do risk: mitigated REABRE, closed é TERMINAL.
-- =============================================================================
--
-- ⭐ Domain 🏛 GRC (Onda Dezenove, Fase 3) — Risco Corporativo. É o DIVERGE
-- assinado do `risk` (Módulo 60, PMO): aquele é escopado a um PROJETO; este é o
-- risco ESTRATÉGICO do negócio, sem projeto. O que se MANTÉM está aqui provado:
-- régua 1–5, severidade como leitura, mitigated reabre, closed terminal.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os riscos de um tenant não aparecem no outro; ⭐ nasce ABERTO e o autor é
--      carimbado pelo servidor (o created_by mentido no INSERT é descartado);
--      inserir exige probabilidade/impacto na régua 1–5;
--   2. ⭐ a régua 1–5 é física do método — probability=6 (ou impact=0) bate no CHECK;
--   3. ⭐ o tratamento é CHECK dos 4 T's — 'foo' é recusado, 'mitigate' passa;
--   4. ⭐⭐ **A ASSINATURA (o MANTIDO do risk):** open→mitigated (carimba
--      mitigated_at), mitigated→open REABRE (o mesmo risco volta; mitigated_at é
--      LIMPO), →closed, e closed→open FALHA (terminal); o conteúdo congela;
--   5. cross-tenant barrado; a caneta de emitir não é do cliente; o `anon` fora;
--   6. os fatos (registered/mitigated/reopened/closed) saem no correio.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert80(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: erisk instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'erisk', 'Risco Corporativo', '0.1.0',
  'O risco estratégico do negócio (não o de projeto — o DIVERGE do risk). Régua 1–5, mitigated reabre, closed terminal; tratamento nos 4 T''s.',
  'domain', 'grc',
  '[{"key":"risk-management","canonicalName":"Gestão de riscos"},
    {"key":"risk-matrix","canonicalName":"Matriz de riscos"}]'::jsonb,
  '[{"key":"erisk.entry.manage","moduleId":"erisk","description":"Gerir riscos corporativos."}]'::jsonb,
  '[{"type":"erisk.entry.registered","version":1,"description":"Registrado."},
    {"type":"erisk.entry.mitigated","version":1,"description":"Mitigado."},
    {"type":"erisk.entry.reopened","version":1,"description":"Reaberto."},
    {"type":"erisk.entry.closed","version":1,"description":"Encerrado."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'erisk', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'erisk', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- erisk tem uma permissão só — concedida aos DOIS usuários.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'erisk.entry.manage', 'erisk'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE OPEN, O SERVIDOR CARIMBA O AUTOR, E ISOLA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce open; created_by do servidor; a régua é obrigatória; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into erisk.entries (tenant_id, description, category, owner, probability, impact, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'um concorrente pode nos tirar o mercado', 'estratégico', 'Diretoria', 4, 5,
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert80(v_st = 'open', 'o risco corporativo nasce open');
  perform pg_temp.assert80(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from erisk.entries;
  perform pg_temp.assert80(v_n = 0, 'o Beta não vê o risco do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A RÉGUA 1–5 É FÍSICA DO MÉTODO (o CHECK)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: probabilidade/impacto fora de 1..5 batem no CHECK ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into erisk.entries (tenant_id, description, probability, impact)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fora da régua', 6, 3);
    perform pg_temp.assert80(false, 'DEVERIA TER FALHADO: probabilidade 6');
  exception when check_violation then
    perform pg_temp.assert80(true, '⭐ probabilidade=6 recusada pelo CHECK (régua 1–5)');
  end;

  begin
    insert into erisk.entries (tenant_id, description, probability, impact)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fora da régua', 3, 0);
    perform pg_temp.assert80(false, 'DEVERIA TER FALHADO: impacto 0');
  exception when check_violation then
    perform pg_temp.assert80(true, '⭐ impacto=0 recusado pelo CHECK (régua 1–5)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O TRATAMENTO É CHECK DOS 4 T's (accept/mitigate/transfer/avoid)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: treatment fora dos 4 T''s bate no CHECK; um válido passa ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into erisk.entries (tenant_id, description, probability, impact)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a regulação pode mudar', 3, 4)
  returning id into v_id;

  begin
    update erisk.entries set treatment = 'foo' where id = v_id;
    perform pg_temp.assert80(false, 'DEVERIA TER FALHADO: tratamento fora dos 4 T''s');
  exception when check_violation then
    perform pg_temp.assert80(true, '⭐ treatment=foo recusado pelo CHECK (os 4 T''s da ISO 31000)');
  end;

  update erisk.entries set treatment = 'mitigate' where id = v_id;
  perform pg_temp.assert80(
    (select treatment = 'mitigate' from erisk.entries where id = v_id),
    '⭐ treatment=mitigate (um dos 4 T''s) é aceito');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐⭐ A ASSINATURA: mitigated REABRE, closed é TERMINAL; congela
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: open→mitigated→open (reabre, limpa carimbo)→mitigated→closed; closed→open FALHA ==='

do $$
declare v_id uuid; v_mit timestamptz; v_clo timestamptz;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from erisk.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and description = 'um concorrente pode nos tirar o mercado';

  -- open → mitigated: carimba mitigated_at.
  update erisk.entries set status = 'mitigated' where id = v_id;
  select mitigated_at into v_mit from erisk.entries where id = v_id;
  perform pg_temp.assert80(v_mit is not null, '⭐ mitigated_at carimbado pelo servidor');

  -- ⭐⭐ mitigated → open: REABRE — o mesmo risco volta — e LIMPA o carimbo.
  update erisk.entries set status = 'open' where id = v_id;
  select mitigated_at into v_mit from erisk.entries where id = v_id;
  perform pg_temp.assert80(
    (select status from erisk.entries where id = v_id) = 'open',
    '⭐⭐ mitigated → open: o risco REABRIU (o mesmo risco volta)');
  perform pg_temp.assert80(v_mit is null, '⭐⭐ ao reabrir, o carimbo de mitigação foi LIMPO');

  -- mitigated de novo, e então → closed: carimba closed_at.
  update erisk.entries set status = 'mitigated' where id = v_id;
  update erisk.entries set status = 'closed' where id = v_id;
  select closed_at into v_clo from erisk.entries where id = v_id;
  perform pg_temp.assert80(v_clo is not null, '⭐ closed_at carimbado pelo servidor');

  -- ⭐ closed → open: FALHA — terminal (guarda com errcode 22023).
  begin
    update erisk.entries set status = 'open' where id = v_id;
    perform pg_temp.assert80(false, 'DEVERIA TER FALHADO: reabriu o risco encerrado');
  exception when invalid_parameter_value then
    perform pg_temp.assert80(true, '⭐ closed é TERMINAL — não reabre (o MANTIDO do risk)');
  end;

  -- ⭐ o conteúdo congela depois de fechar.
  begin
    update erisk.entries set description = 'reescrevendo o fechado' where id = v_id;
    perform pg_temp.assert80(false, 'DEVERIA TER FALHADO: editou risco encerrado');
  exception when invalid_parameter_value then
    perform pg_temp.assert80(true, '⭐ descrição/régua/tratamento congelam depois de encerrar');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT, A CANETA, E O ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into erisk.entries (tenant_id, description, probability, impact)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 2, 2);
    perform pg_temp.assert80(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert80(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;

  begin
    perform erisk.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'erisk.entry.registered', '{}'::jsonb);
    perform pg_temp.assert80(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert80(true, 'erisk.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from erisk.entries limit 1;
    perform pg_temp.assert80(false, 'DEVERIA TER FALHADO: anon leu erisk.entries');
  exception when insufficient_privilege then
    perform pg_temp.assert80(true, '⭐ anon não encosta em erisk.entries');
  end;
  reset role;
end $$;

-- =============================================================================
-- CENÁRIO 6 — OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: registered/mitigated/reopened/closed saíram no correio ==='

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'erisk.entry.registered';
  perform pg_temp.assert80(v_n >= 1, 'cada risco registrado emitiu erisk.entry.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'erisk.entry.mitigated';
  perform pg_temp.assert80(v_n >= 1, 'a mitigação emitiu erisk.entry.mitigated');
  select count(*) into v_n from core.event_outbox where event_type = 'erisk.entry.reopened';
  perform pg_temp.assert80(v_n >= 1, 'a reabertura emitiu erisk.entry.reopened');
  select count(*) into v_n from core.event_outbox where event_type = 'erisk.entry.closed';
  perform pg_temp.assert80(v_n >= 1, 'o encerramento emitiu erisk.entry.closed');
end $$;

\echo ''
\echo '=== MÓDULO 75 OK: risco corporativo isolado, régua 1–5 no CHECK, tratamento nos 4 T''s, mitigated reabre, closed terminal, anon fora ==='
