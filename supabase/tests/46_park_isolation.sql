-- =============================================================================
-- O MÓDULO 41 NO BANCO — o pátio que se isola, o carimbo do servidor e o
-- registro que congela depois da saída
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as entradas de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta REGISTRA a entrada mas não FECHA a saída;
--   2. ⭐ **entered_at é carimbado pelo SERVIDOR** — a hora que a tela mandar
--      é descartada, sempre `now()`;
--   3. ⭐ **registrar a saída carimba exited_at/exited_by pelo SERVIDOR**;
--   4. ⭐ **depois da saída, o registro CONGELA** — nova tentativa de mudar
--      qualquer coisa é mordida com "não se rasura";
--   5. a placa não muda depois de criada; apagar não existe; a caneta de
--      emitir evento não é do cliente; e o `anon` não encosta na tabela.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert46(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: park instalado; Alfa registra e fecha, Beta só registra ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'park', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'park', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'park.entry.manage', 'park'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'park.entry.close', 'park'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois registram entrada; só o Alfa fecha a saída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E O CARIMBO DE ENTRADA PELO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu pátio; entered_at é sempre now() ==='

do $$
declare
  v_id uuid; v_entered timestamptz; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Sabotagem: manda uma hora de entrada absurda (ano 2000) — deve ser
  -- descartada, e o valor gravado é now().
  insert into park.entries (tenant_id, vehicle_plate, entered_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ABC1D23', '2000-01-01T00:00:00Z')
  returning id, entered_at into v_id, v_entered;

  perform pg_temp.assert46(
    v_entered > now() - interval '1 minute',
    '⭐ entered_at é carimbado pelo SERVIDOR — a hora sabotada foi descartada');

  begin
    insert into park.entries (tenant_id, vehicle_plate, exited_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'NASCE-ERRADO', now());
    perform pg_temp.assert46(false, 'DEVERIA TER FALHADO: nasceu com saída junto');
  exception when others then
    perform pg_temp.assert46(true, 'a entrada nasce dentro — nunca com saída junto');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into park.entries (tenant_id, vehicle_plate)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'XYZ9Z99');

  select count(*) into v_n from park.entries;
  perform pg_temp.assert46(v_n = 1, 'o Beta enxerga só o pátio dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ REGISTRAR A SAÍDA: exited_at/exited_by CARIMBADOS PELO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: fechar a saída — o carimbo é do servidor, não da tela ==='

do $$
declare
  v_id uuid; v_exited timestamptz; v_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem close)

  select id into v_id from park.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and vehicle_plate = 'ABC1D23';

  -- ⭐ Sabotagem: a tela manda uma hora de saída absurda (ano 2999) — o
  -- gatilho descarta e grava now().
  update park.entries set exited_at = '2999-01-01T00:00:00Z' where id = v_id;

  select exited_at, exited_by into v_exited, v_by from park.entries where id = v_id;
  perform pg_temp.assert46(
    v_exited < now() + interval '1 minute' and v_exited > now() - interval '1 minute',
    '⭐ exited_at é carimbado pelo SERVIDOR — a hora sabotada (2999) foi descartada');
  perform pg_temp.assert46(v_by = '11111111-1111-4111-8111-111111111111', 'exited_by é o servidor, do auth.uid()');

  reset role;
  perform pg_temp.assert46(
    (select count(*) from core.event_outbox where event_type = 'park.entry.closed') = 1,
    'o fato de fechar a saída saiu');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ DEPOIS DA SAÍDA, O REGISTRO CONGELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: depois de fechado, nada mais muda — "não se rasura" ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from park.entries
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and vehicle_plate = 'ABC1D23';

  begin
    update park.entries set fee = '10' where id = v_id;
    perform pg_temp.assert46(false, 'DEVERIA TER FALHADO: editou registro já fechado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert46(v_erro like '%não se rasura%', '⭐ depois da saída, o registro CONGELA por completo');
  end;

  begin
    update park.entries set exited_at = now() where id = v_id;
    perform pg_temp.assert46(false, 'DEVERIA TER FALHADO: tentou fechar de novo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert46(v_erro like '%não se rasura%', '⭐ fechar de novo também é mordido — corrigir é registro novo');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ FECHAR A SAÍDA EXIGE park.entry.close: O BETA É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o Beta registra a entrada, mas não fecha a saída ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta (só manage)

  select id into v_id from park.entries
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and vehicle_plate = 'XYZ9Z99';

  begin
    update park.entries set exited_at = now() where id = v_id;
    perform pg_temp.assert46(false, 'DEVERIA TER FALHADO: o Beta fechou a saída sem close');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert46(v_erro like '%park.entry.close%', '⭐ fechar a saída exige park.entry.close — Beta barrado');
  end;

  -- ⭐ Sabotagem: a placa também não pode mudar, mesmo antes de fechar.
  begin
    update park.entries set vehicle_plate = 'OUTRA-PLACA' where id = v_id;
    perform pg_temp.assert46(false, 'DEVERIA TER FALHADO: mudou a placa carimbada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert46(v_erro like '%não se altera%', '⭐ a placa carimbada não muda, nem enquanto está dentro');
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

  select id into v_id from park.entries limit 1;

  begin
    delete from park.entries where id = v_id;
    perform pg_temp.assert46(false, 'DEVERIA TER FALHADO: apagou a entrada');
  exception when insufficient_privilege then
    perform pg_temp.assert46(true, 'apagar não existe — o livro do pátio não se apaga');
  end;

  begin
    perform park.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'park.entry.registered', '{}'::jsonb);
    perform pg_temp.assert46(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert46(true, 'park.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from park.entries limit 1;
    perform pg_temp.assert46(false, 'DEVERIA TER FALHADO: anon leu park.entries');
  exception when insufficient_privilege then
    perform pg_temp.assert46(true, '⭐ anon não encosta em park.entries');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 41 OK: pátio isolado, carimbo do servidor, registro que congela, anon fora ==='
