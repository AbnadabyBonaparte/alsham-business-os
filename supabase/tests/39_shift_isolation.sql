-- =============================================================================
-- O MÓDULO 34 NO BANCO — a exclusion que recusa o conflito por COLABORADOR,
-- a cancelada que libera sozinha e o passado permitido
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as escalas de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta ESCALA (manage), mas NÃO CANCELA (decide);
--   2. ⭐ **o conflito é recusado pela CONSTRAINT** (23P01), não por `if`: o
--      período que cruza o MESMO colaborador cai; o meio-aberto convive;
--      o MESMO período em OUTRO colaborador convive; ⭐ o PASSADO entra;
--   3. ⭐ **a cancelada LIBERA o período SOZINHA** — o mesmo horário se
--      escala de novo, sem job e sem flag;
--   4. cancelar exige razão e carimbo do servidor; cancelada é terminal e
--      congela;
--   5. ⭐ **cancelar exige `shift.schedule.decide`** — o Beta é barrado;
--   6. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta na tabela.
--
-- Dado 100% fabricado: `employee_id`/`employee_name` são valores soltos,
-- sem vínculo real com `hr.employees` (o módulo não lê aquele schema).
-- Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert39(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: shift instalado nos dois tenants; Alfa decide, Beta só escala ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'shift', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'shift', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: os dois ESCALAM (manage); só o Alfa CANCELA (decide).
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'shift.schedule.manage', 'shift'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'shift.schedule.decide', 'shift'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois escalam; só o Alfa cancela.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A ASSIMETRIA (escalar não é cancelar)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua agenda; o Beta escala mas não cancela ==='

do $$
declare
  v_id uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into shift.schedules (tenant_id, employee_id, employee_name, shift_label, starts_at, ends_at)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'ee000000-0000-4000-8000-000000000001', 'Ana Vendedora', 'Manhã',
    '2026-08-03 08:00+00', '2026-08-03 12:00+00'
  )
  returning id into v_id;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into shift.schedules (tenant_id, employee_id, employee_name, shift_label, starts_at, ends_at)
  values (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'ee000000-0000-4000-8000-000000000009', 'Beto do Beta', 'Tarde',
    '2026-08-03 13:00+00', '2026-08-03 17:00+00'
  )
  returning id into v_id;

  select count(*) into v_n from shift.schedules;
  perform pg_temp.assert39(v_n = 1, 'o Beta enxerga só a agenda dele');

  -- O Beta ESCALA (manage basta), mas NÃO CANCELA (falta decide).
  begin
    update shift.schedules set status = 'cancelled', cancel_reason = 'tentativa' where id = v_id;
    perform pg_temp.assert39(false, 'DEVERIA TER FALHADO: o Beta cancelou sem decide');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert39(v_erro like '%shift.schedule.decide%', '⭐ cancelar exige shift.schedule.decide — o Beta é barrado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A FÍSICA: O CONFLITO É DA CONSTRAINT (por COLABORADOR)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o período que cruza o MESMO colaborador cai; meio-aberto e outro colaborador convivem; o passado entra ==='

do $$
declare
  v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into shift.schedules (tenant_id, employee_id, employee_name, shift_label, starts_at, ends_at)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'ee000000-0000-4000-8000-000000000001', 'Ana Vendedora', 'Turno invasor',
      '2026-08-03 10:00+00', '2026-08-03 14:00+00'
    );
    perform pg_temp.assert39(false, 'DEVERIA TER FALHADO: dois turnos no mesmo colaborador e hora');
  exception when exclusion_violation then
    perform pg_temp.assert39(true, '⭐ o conflito caiu na CONSTRAINT — 23P01, não if de aplicação');
  end;

  -- ⭐ MEIO-ABERTO: terminar às 12h e começar às 12h convivem.
  insert into shift.schedules (tenant_id, employee_id, employee_name, shift_label, starts_at, ends_at)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'ee000000-0000-4000-8000-000000000001', 'Ana Vendedora', 'Tarde',
    '2026-08-03 12:00+00', '2026-08-03 16:00+00'
  );
  perform pg_temp.assert39(true, '⭐ meio-aberto: 12h→16h convive com 08h→12h');

  -- O MESMO horário em OUTRO colaborador convive.
  insert into shift.schedules (tenant_id, employee_id, employee_name, shift_label, starts_at, ends_at)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'ee000000-0000-4000-8000-000000000002', 'Bruno Estoquista', 'Manhã',
    '2026-08-03 08:00+00', '2026-08-03 12:00+00'
  );
  perform pg_temp.assert39(true, 'o mesmo horário em OUTRO colaborador convive');

  -- ⭐ O PASSADO é permitido: o turno que já rodou entra no livro.
  insert into shift.schedules (tenant_id, employee_id, employee_name, shift_label, starts_at, ends_at)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'ee000000-0000-4000-8000-000000000001', 'Ana Vendedora', 'Turno registrado depois',
    '2020-01-06 08:00+00', '2020-01-06 12:00+00'
  );
  perform pg_temp.assert39(true, '⭐ o passado entra — fato consumado, agenda honesta');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'shift.schedule.scheduled';
  perform pg_temp.assert39(v_n = 5, 'shift.schedule.scheduled saiu cinco vezes (1 do cenário 1 + 4 daqui)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A CANCELADA LIBERA SOZINHA; TERMINAL; CONGELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: cancelar com razão libera o período — e o mesmo horário escala de novo ==='

do $$
declare
  v_id uuid; v_by uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from shift.schedules
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and employee_id = 'ee000000-0000-4000-8000-000000000001'
     and shift_label = 'Manhã';

  begin
    update shift.schedules set status = 'cancelled' where id = v_id;
    perform pg_temp.assert39(false, 'DEVERIA TER FALHADO: cancelou sem escrever o porquê');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert39(v_erro like '%razão%', 'cancelar exige a razão escrita');
  end;

  update shift.schedules
     set status = 'cancelled', cancel_reason = 'colaborador pediu troca de turno'
   where id = v_id;

  select cancelled_by into v_by from shift.schedules where id = v_id;
  perform pg_temp.assert39(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ o cancelamento carimbou QUEM — pelo servidor');

  -- ⭐ O período LIBEROU SOZINHO: o mesmo horário entra de novo.
  insert into shift.schedules (tenant_id, employee_id, employee_name, shift_label, starts_at, ends_at)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'ee000000-0000-4000-8000-000000000001', 'Ana Vendedora', 'a vaga foi ocupada',
    '2026-08-03 08:00+00', '2026-08-03 12:00+00'
  );
  perform pg_temp.assert39(true, '⭐ a cancelada liberou o período sozinha — constraint parcial');

  -- Terminal.
  begin
    update shift.schedules set status = 'scheduled' where id = v_id;
    perform pg_temp.assert39(false, 'DEVERIA TER FALHADO: a cancelada voltou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert39(v_erro like '%terminal%', '⭐ cancelar é terminal — o horário livre se escala de novo');
  end;

  -- Congela.
  begin
    update shift.schedules set shift_label = 'rasura' where id = v_id;
    perform pg_temp.assert39(false, 'DEVERIA TER FALHADO: editou escala cancelada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert39(v_erro like '%não se edita%', 'cancelada congela inteira');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ CANCELAR EXIGE shift.schedule.decide: O BETA É BARRADO (de novo, isolado)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: no tenant do próprio Beta, remarcar ele consegue; cancelar não ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from shift.schedules
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     and employee_id = 'ee000000-0000-4000-8000-000000000009';

  -- Remarcar (ainda escalada) ele consegue: manage basta.
  update shift.schedules set shift_label = 'Tarde estendida' where id = v_id;
  perform pg_temp.assert39(true, 'o Beta remarca — manage basta enquanto a escala está viva');

  -- Cancelar não (falta decide).
  begin
    update shift.schedules set status = 'cancelled', cancel_reason = 'tentativa' where id = v_id;
    perform pg_temp.assert39(false, 'DEVERIA TER FALHADO: o Beta cancelou sem decide');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert39(v_erro like '%shift.schedule.decide%', '⭐ cancelar exige shift.schedule.decide');
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

  select id into v_id from shift.schedules limit 1;

  begin
    delete from shift.schedules where id = v_id;
    perform pg_temp.assert39(false, 'DEVERIA TER FALHADO: apagou escala');
  exception when insufficient_privilege then
    perform pg_temp.assert39(true, 'apagar não existe — cancelar é status com razão');
  end;

  begin
    perform shift.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'shift.schedule.scheduled', '{}'::jsonb);
    perform pg_temp.assert39(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert39(true, 'shift.emit_event não é concedida ao cliente');
  end;
end $$;

-- ⭐ ANON NÃO ENCOSTA — com o papel real.
do $$
begin
  set local role anon;
  begin
    perform 1 from shift.schedules limit 1;
    perform pg_temp.assert39(false, 'DEVERIA TER FALHADO: anon leu shift.schedules');
  exception when insufficient_privilege then
    perform pg_temp.assert39(true, '⭐ anon não encosta em shift.schedules');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 34 OK: conflito na constraint por colaborador, cancelada libera sozinha, passado permitido, cancelar exige decide, anon fora ==='
