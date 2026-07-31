-- =============================================================================
-- O MÓDULO 73 NO BANCO — a SESSÃO DE CAIXA que se isola: nasce open, o servidor
-- carimba a abertura, UMA sessão aberta por caixa (constraint), fechar exige a
-- contagem física, closed é TERMINAL e a abertura CONGELA. ⭐ O DIVERGE do cash:
-- o cash é livro perpétuo sem ciclo; aqui o turno tem começo e fim.
-- =============================================================================
--
-- ⭐ Vertical 🛒 Varejo & Supermercados (Onda Dezoito, Fase 2).
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert78(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: cashregister instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'cashregister', 'Sessão de Caixa', '0.1.0',
  'O turno físico de uma gaveta: abre contando o fundo, fecha contando a gaveta; open → closed terminal.',
  'vertical', 'retail',
  '[{"key":"cash-register","canonicalName":"Caixa"}]'::jsonb,
  '[{"key":"cashregister.session.manage","moduleId":"cashregister","description":"Abrir e fechar sessões de caixa."}]'::jsonb,
  '[{"type":"cashregister.session.opened","version":1,"description":"Aberta."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cashregister', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cashregister', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'cashregister.session.manage', 'cashregister'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — NASCE OPEN, ISOLA, O SERVIDOR CARIMBA A ABERTURA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce open; opened_by do servidor; isola ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into cashregister.sessions (tenant_id, register_name, operator_name, opening_amount_cents, currency, opened_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Caixa 1', 'Op. Manhã', 10000, 'BRL',
          '22222222-2222-4222-8222-222222222222')
  returning id, opened_by, status into v_id, v_by, v_st;

  perform pg_temp.assert78(v_st = 'open', 'a sessão nasce aberta');
  perform pg_temp.assert78(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ opened_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from cashregister.sessions;
  perform pg_temp.assert78(v_n = 0, 'o Beta não vê a sessão do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ UMA SESSÃO ABERTA POR CAIXA (a constraint)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: não há dois turnos abertos na mesma gaveta ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into cashregister.sessions (tenant_id, register_name, opening_amount_cents)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Caixa 1', 5000);  -- Caixa 1 já aberto
    perform pg_temp.assert78(false, 'DEVERIA TER FALHADO: dois turnos abertos na mesma gaveta');
  exception when unique_violation then
    perform pg_temp.assert78(true, '⭐⭐ uma sessão aberta por caixa (a física na constraint)');
  end;

  -- outra gaveta pode abrir normalmente.
  insert into cashregister.sessions (tenant_id, register_name, opening_amount_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Caixa 2', 20000);
  perform pg_temp.assert78(true, 'outra gaveta abre normalmente');
end $$;

-- =============================================================================
-- CENÁRIO 3 — FECHAR EXIGE A CONTAGEM; closed é TERMINAL; congela
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: fechar exige contagem; o turno encerrado não reabre; congela ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from cashregister.sessions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and register_name = 'Caixa 1';

  -- fechar sem contagem: recusado (Lei 7).
  begin
    update cashregister.sessions set status = 'closed' where id = v_id;
    perform pg_temp.assert78(false, 'DEVERIA TER FALHADO: fechar sem contagem física');
  exception when invalid_parameter_value then
    perform pg_temp.assert78(true, '⭐ fechar exige a contagem física da gaveta');
  end;

  -- fechar com contagem: carimba closed_at.
  update cashregister.sessions set status = 'closed', closing_amount_cents = 15000 where id = v_id;
  perform pg_temp.assert78(
    (select status = 'closed' and closed_at is not null from cashregister.sessions where id = v_id),
    'fechou e carimbou closed_at');

  -- closed é TERMINAL.
  begin
    update cashregister.sessions set status = 'open' where id = v_id;
    perform pg_temp.assert78(false, 'DEVERIA TER FALHADO: reabrir turno encerrado');
  exception when invalid_parameter_value then
    perform pg_temp.assert78(true, '⭐ closed é terminal — o turno não reabre');
  end;

  -- a abertura congela depois de fechar.
  begin
    update cashregister.sessions set opening_amount_cents = 1 where id = v_id;
    perform pg_temp.assert78(false, 'DEVERIA TER FALHADO: editar abertura de sessão fechada');
  exception when invalid_parameter_value then
    perform pg_temp.assert78(true, '⭐ a abertura congela depois do fechamento');
  end;

  -- ⭐ E como a gaveta 1 fechou, uma nova sessão pode abrir nela (o partial index libera).
  insert into cashregister.sessions (tenant_id, register_name, opening_amount_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Caixa 1', 15000);
  perform pg_temp.assert78(true, '⭐ fechada a anterior, a gaveta 1 abre um novo turno');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT, A CANETA, ANON, E OS FATOS NO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cross-tenant barrado; emit_event fechada; anon fora ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into cashregister.sessions (tenant_id, register_name, opening_amount_cents)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 0);
    perform pg_temp.assert78(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert78(true, '⭐ cross-tenant barrado');
  end;

  begin
    perform cashregister.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cashregister.session.opened', '{}'::jsonb);
    perform pg_temp.assert78(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert78(true, 'cashregister.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from cashregister.sessions limit 1;
    perform pg_temp.assert78(false, 'DEVERIA TER FALHADO: anon leu cashregister.sessions');
  exception when insufficient_privilege then
    perform pg_temp.assert78(true, '⭐ anon não encosta em cashregister.sessions');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'cashregister.session.opened';
  perform pg_temp.assert78(v_n >= 3, 'cada abertura emitiu cashregister.session.opened');
  select count(*) into v_n from core.event_outbox where event_type = 'cashregister.session.closed';
  perform pg_temp.assert78(v_n >= 1, 'o fechamento emitiu cashregister.session.closed');
end $$;

\echo ''
\echo '=== MÓDULO 73 OK: sessão isolada, uma aberta por caixa, fechar exige contagem, closed terminal, anon fora ==='
