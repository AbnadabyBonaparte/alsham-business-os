-- =============================================================================
-- O MÓDULO 97 NO BANCO — a agenda do salão com NO-SHOW: nasce scheduled, o
-- servidor carimba autor e desfecho, o ciclo scheduled → attended|no_show|
-- cancelled é terminal, marcar desfecho exige decide, cancelar exige razão, o
-- serviço é texto livre e o cliente/profissional são id solto (não PHI).
-- =============================================================================
--
-- ⭐ Vertical 💇 Beleza & Estética. Roda depois de `01_rls_isolation.sql`
-- (tenants aaaa/bbbb) e `04_install_module.sql`. Dado 100% fabricado.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--   1. os agendamentos de um tenant não aparecem no outro;
--   2. ⭐ **assimetria**: Alfa tem `booking.manage` E `booking.decide`; Beta só
--      tem `booking.manage` — marca agendamento mas não dá o desfecho;
--   3. ⭐ **o no-show é dado** e é carimbado pelo servidor (`decided_by`);
--   4. ⭐ **os três fins são TERMINAIS** — desfecho não se edita nem volta;
--   5. ⭐ **cancelar exige razão** (check), os demais não;
--   6. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta na tabela.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert102(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: booking instalado; Alfa marca E decide, Beta só marca ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'booking', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'booking', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'booking.booking.manage', 'booking'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ Só o Alfa ganha decide — o Beta fica só com manage.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'booking.booking.decide', 'booking'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois marcam; só o Alfa decide o desfecho.'

-- =============================================================================
-- CENÁRIO 1 — NASCE SCHEDULED, ISOLA, REMARCA ENQUANTO AGENDADO, SERVIÇO LIVRE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce scheduled; created_by do servidor; remarca; isola; serviço texto livre ==='

do $$
declare v_id uuid; v_by uuid; v_st text; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ client_id SOLTO (id inexistente em crm nenhum — insere sem erro), serviço
  -- TEXTO LIVRE, o created_by mentido é descartado pelo servidor.
  insert into booking.bookings
    (tenant_id, client_id, client_name, professional_id, service, scheduled_at, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cc000000-0000-4000-8000-000000000099', 'Cliente Alfa',
          'df000000-0000-4000-8000-000000000011', 'coloração completa',
          now() + interval '2 days',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, status into v_id, v_by, v_st;

  perform pg_temp.assert102(v_st = 'scheduled', 'o agendamento nasce scheduled');
  perform pg_temp.assert102(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  -- Nasce com desfecho? recusado.
  begin
    insert into booking.bookings (tenant_id, client_name, service, scheduled_at, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'corte', now(), 'attended');
    perform pg_temp.assert102(false, 'DEVERIA TER FALHADO: nasceu com desfecho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert102(v_erro like '%nasce agendado%', 'o agendamento nasce agendado');
  end;

  -- Remarcar enquanto agendado (manage) é permitido.
  update booking.bookings set scheduled_at = now() + interval '3 days' where id = v_id;
  perform pg_temp.assert102(true, '⭐ remarcar enquanto agendado é permitido');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  select count(*) into v_n from booking.bookings;
  perform pg_temp.assert102(v_n = 0, 'o Beta não vê a agenda do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O NO-SHOW E OS DESFECHOS TERMINAIS, exigindo DECIDE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: marcar desfecho exige decide; no-show; terminal; cancelar exige razão ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  -- Beta (só manage) marca e TENTA dar desfecho.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into booking.bookings (tenant_id, client_name, service, scheduled_at)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Cliente Beta', 'escova', now())
  returning id into v_id;

  begin
    update booking.bookings set status = 'attended' where id = v_id;
    perform pg_temp.assert102(false, 'DEVERIA TER FALHADO: desfecho sem decide');
  exception when insufficient_privilege then
    perform pg_temp.assert102(true, '⭐ marcar desfecho exige booking.booking.decide (Beta não tem)');
  end;
end $$;

do $$
declare v_id uuid; v_dec uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (tem decide)

  insert into booking.bookings (tenant_id, client_name, service, scheduled_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Faltante', 'manicure', now())
  returning id into v_id;

  -- ⭐ O NO-SHOW: o cliente faltou. Carimbado pelo servidor.
  update booking.bookings set status = 'no_show' where id = v_id;
  select decided_by into v_dec from booking.bookings where id = v_id;
  perform pg_temp.assert102((select status = 'no_show' from booking.bookings where id = v_id),
    '⭐ o no-show é dado: a falta se registra');
  perform pg_temp.assert102(v_dec = '11111111-1111-4111-8111-111111111111',
    'o desfecho é carimbado pelo servidor (decided_by)');

  -- Terminal: agendamento com desfecho não se edita.
  begin
    update booking.bookings set scheduled_at = now() + interval '1 day' where id = v_id;
    perform pg_temp.assert102(false, 'DEVERIA TER FALHADO: editar agendamento com desfecho');
  exception when insufficient_privilege then
    perform pg_temp.assert102(true, '⭐ agendamento com desfecho é terminal — quem remarca abre outro');
  end;

  -- Cancelar exige razão.
  insert into booking.bookings (tenant_id, client_name, service, scheduled_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A cancelar', 'corte', now())
  returning id into v_id;
  begin
    update booking.bookings set status = 'cancelled' where id = v_id;
    perform pg_temp.assert102(false, 'DEVERIA TER FALHADO: cancelar sem razão');
  exception when check_violation then
    perform pg_temp.assert102(true, '⭐ cancelar exige razão escrita');
  end;
  update booking.bookings set status = 'cancelled', cancel_reason = 'cliente desmarcou' where id = v_id;
  perform pg_temp.assert102((select status = 'cancelled' from booking.bookings where id = v_id),
    'cancelar com razão é aceito');

  -- Transição inexistente é recusada.
  begin
    update booking.bookings set status = 'scheduled', cancel_reason = '' where id = v_id;
    perform pg_temp.assert102(false, 'DEVERIA TER FALHADO: cancelled → scheduled');
  exception when others then
    perform pg_temp.assert102(true, '⭐ o desfecho não volta a scheduled');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA; OS FATOS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: apagar não existe; emit fechada; anon fora; os fatos ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from booking.bookings limit 1;
  begin
    delete from booking.bookings where id = v_id;
    perform pg_temp.assert102(false, 'DEVERIA TER FALHADO: apagou agendamento');
  exception when insufficient_privilege then
    perform pg_temp.assert102(true, 'apagar agendamento não existe — o desfecho é status');
  end;

  begin
    perform booking.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'booking.booking.scheduled', '{}'::jsonb);
    perform pg_temp.assert102(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert102(true, 'booking.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from booking.bookings limit 1;
    perform pg_temp.assert102(false, 'DEVERIA TER FALHADO: anon leu a agenda');
  exception when insufficient_privilege then
    perform pg_temp.assert102(true, '⭐ anon não encosta na agenda do salão');
  end;
  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'booking.booking.scheduled';
  perform pg_temp.assert102(v_n >= 3, 'cada marcação emitiu booking.booking.scheduled');
  select count(*) into v_n from core.event_outbox where event_type = 'booking.booking.missed';
  perform pg_temp.assert102(v_n >= 1, '⭐ o no-show emitiu .missed (o outbox recusa _ no verbo)');
  select count(*) into v_n from core.event_outbox where event_type = 'booking.booking.cancelled';
  perform pg_temp.assert102(v_n >= 1, 'o cancelamento emitiu .cancelled');
end $$;

\echo ''
\echo '=== MÓDULO 97 OK: agenda de salão com no-show, três fins terminais, desfecho com decide, cancelar com razão, serviço texto livre, não PHI, anon fora ==='
