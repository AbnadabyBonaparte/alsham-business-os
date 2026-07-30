-- =============================================================================
-- O MÓDULO 20 NO BANCO — a exclusion que recusa o conflito, a cancelada que
-- libera sozinha e o passado permitido
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os espaços e reservas de um tenant não aparecem no outro — e a
--      assimetria user-a × user-b: o Beta DESENHA mas não RESERVA;
--   2. ⭐ **o conflito é recusado pela CONSTRAINT** (23P01), não por `if`:
--      o período que cruza cai; o meio-aberto convive; outro espaço convive;
--   3. ⭐ **a cancelada LIBERA o período SOZINHA** — o mesmo horário se
--      reserva de novo, sem job e sem flag;
--   4. ⭐ **o passado é permitido** — registrar o uso que já aconteceu é
--      fato consumado;
--   5. cancelar exige razão e carimbo do servidor; cancelada é terminal e
--      congela; espaço arquivado não recebe reserva nova — e VOLTA;
--   6. apagar não existe; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert25(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Espaços nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'spc', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spc', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) desenha E reserva;
-- `user-b` (Beta) só DESENHA.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'spc.setup.manage', 'spc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'spc.reservation.manage', 'spc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois desenham; só o Alfa reserva.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A MÃO QUE NÃO RESERVA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com os seus espaços; o Beta desenha mas não reserva ==='

do $$
declare
  v_sala uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into spc.spaces (tenant_id, name, capacity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Sala de reunião 1', 8);
  insert into spc.spaces (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Auditório');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into spc.spaces (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Quadra 1')
  returning id into v_sala;

  select count(*) into v_n from spc.spaces;
  perform pg_temp.assert25(v_n = 1, 'o Beta enxerga só os espaços dele');

  begin
    insert into spc.reservations (tenant_id, space_id, starts_at, ends_at)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_sala,
            '2026-08-01 10:00+00', '2026-08-01 12:00+00');
    perform pg_temp.assert25(false, 'DEVERIA TER FALHADO: o Beta reservou sem manage');
  exception when insufficient_privilege then
    perform pg_temp.assert25(true, '⭐ quem desenha não reserva — a mão da agenda é própria');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A FÍSICA: O CONFLITO É DA CONSTRAINT
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o período que cruza cai; o meio-aberto convive; outro espaço convive ==='

do $$
declare
  v_sala uuid; v_aud uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_sala from spc.spaces
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Sala de reunião 1';
  select id into v_aud from spc.spaces
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Auditório';

  insert into spc.reservations (tenant_id, space_id, purpose, starts_at, ends_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_sala, 'reunião de diretoria',
          '2026-08-01 10:00+00', '2026-08-01 12:00+00');

  begin
    insert into spc.reservations (tenant_id, space_id, purpose, starts_at, ends_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_sala, 'invasão',
            '2026-08-01 11:00+00', '2026-08-01 13:00+00');
    perform pg_temp.assert25(false, 'DEVERIA TER FALHADO: dois usos no mesmo espaço e hora');
  exception when exclusion_violation then
    perform pg_temp.assert25(true, '⭐ o conflito caiu na CONSTRAINT — 23P01, não if de aplicação');
  end;

  -- ⭐ MEIO-ABERTO: terminar às 12h e começar às 12h convivem.
  insert into spc.reservations (tenant_id, space_id, purpose, starts_at, ends_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_sala, 'treinamento',
          '2026-08-01 12:00+00', '2026-08-01 14:00+00');
  perform pg_temp.assert25(true, '⭐ meio-aberto: 12h→14h convive com 10h→12h');

  -- O MESMO horário em OUTRO espaço convive.
  insert into spc.reservations (tenant_id, space_id, purpose, starts_at, ends_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_aud, 'palestra',
          '2026-08-01 10:00+00', '2026-08-01 12:00+00');
  perform pg_temp.assert25(true, 'o mesmo horário em outro espaço convive');

  -- ⭐ O PASSADO é permitido: o uso que já aconteceu entra no livro.
  insert into spc.reservations (tenant_id, space_id, purpose, starts_at, ends_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_sala, 'uso registrado depois',
          '2020-01-06 09:00+00', '2020-01-06 10:00+00');
  perform pg_temp.assert25(true, '⭐ o passado entra — fato consumado, agenda honesta');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'spc.reservation.booked';
  perform pg_temp.assert25(v_n = 4, 'spc.reservation.booked saiu quatro vezes');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A CANCELADA LIBERA SOZINHA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: cancelar com razão libera o período — e o mesmo horário reserva de novo ==='

do $$
declare
  v_id uuid; v_sala uuid; v_by uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_sala from spc.spaces
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Sala de reunião 1';
  select id into v_id from spc.reservations
   where space_id = v_sala and purpose = 'reunião de diretoria';

  begin
    update spc.reservations set status = 'cancelled' where id = v_id;
    perform pg_temp.assert25(false, 'DEVERIA TER FALHADO: cancelou sem escrever o porquê');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert25(v_erro like '%razão%', 'cancelar exige a razão escrita');
  end;

  update spc.reservations
     set status = 'cancelled', cancel_reason = 'a diretoria desmarcou'
   where id = v_id;

  select cancelled_by into v_by from spc.reservations where id = v_id;
  perform pg_temp.assert25(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ o cancelamento carimbou QUEM — pelo servidor');

  -- ⭐ O período LIBEROU SOZINHO: o mesmo horário entra de novo.
  insert into spc.reservations (tenant_id, space_id, purpose, starts_at, ends_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_sala, 'a vaga foi ocupada',
          '2026-08-01 10:00+00', '2026-08-01 12:00+00');
  perform pg_temp.assert25(true, '⭐ a cancelada liberou o período sozinha — constraint parcial');

  -- Terminal e congelada.
  begin
    update spc.reservations set status = 'booked' where id = v_id;
    perform pg_temp.assert25(false, 'DEVERIA TER FALHADO: a cancelada voltou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert25(v_erro like '%terminal%', '⭐ cancelar é terminal — o horário livre se reserva de novo');
  end;

  begin
    update spc.reservations set purpose = 'rasura' where id = v_id;
    perform pg_temp.assert25(false, 'DEVERIA TER FALHADO: editou reserva cancelada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert25(v_erro like '%não se edita%', 'cancelada congela inteira');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — O ESPAÇO ARQUIVADO: SEM RESERVA NOVA, MAS ELE VOLTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: arquivado não recebe reserva nova — e reaberto é a MESMA sala ==='

do $$
declare
  v_aud uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_aud from spc.spaces
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Auditório';

  update spc.spaces set status = 'archived' where id = v_aud;

  begin
    insert into spc.reservations (tenant_id, space_id, starts_at, ends_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_aud,
            '2026-09-01 10:00+00', '2026-09-01 12:00+00');
    perform pg_temp.assert25(false, 'DEVERIA TER FALHADO: reservou espaço arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert25(v_erro like '%fora de uso%', 'espaço arquivado não recebe reserva nova');
  end;

  -- ⭐ archived → active EXISTE: a sala reformada que reabre é a MESMA sala.
  update spc.spaces set status = 'active' where id = v_aud;
  insert into spc.reservations (tenant_id, space_id, starts_at, ends_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_aud,
          '2026-09-01 10:00+00', '2026-09-01 12:00+00');
  perform pg_temp.assert25(true, '⭐ o espaço reaberto é a MESMA sala — o histórico não partiu');
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from spc.reservations limit 1;

  begin
    delete from spc.reservations where id = v_id;
    perform pg_temp.assert25(false, 'DEVERIA TER FALHADO: apagou reserva');
  exception when insufficient_privilege then
    perform pg_temp.assert25(true, 'apagar reserva não existe — cancelar é status com razão');
  end;

  begin
    perform spc.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'spc.reservation.booked', '{}'::jsonb);
    perform pg_temp.assert25(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert25(true, 'spc.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 20 OK: conflito na constraint, cancelada libera sozinha, passado permitido, tenants isolados ==='
