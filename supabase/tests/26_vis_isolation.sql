-- =============================================================================
-- O MÓDULO 21 NO BANCO — os dois carimbos do servidor, o registro que não se
-- rasura e a passagem que não volta
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o livro de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta AGENDA mas não opera a CANCELA;
--   2. ⭐ **o carimbo é do servidor**: a hora que o cliente mandar é
--      descartada, na entrada e na saída;
--   3. ⭐ **check-out sem check-in não existe** — e NENHUM fim volta: a
--      visita é o evento de presença;
--   4. ⭐ **depois do check-in o registro congela** — corrigir é registro
--      NOVO apontando o errado; enquanto agendada, edita-se;
--   5. ⭐ **o documento não passeia pelo correio** — conferido no payload
--      REAL da caixa de saída;
--   6. desmarcar exige razão e a mão certa; apagar não existe; a caneta de
--      emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert26(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Visitas nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vis', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'vis', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) agenda E opera a cancela;
-- `user-b` (Beta) só AGENDA — quem agenda não é quem carimba.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'vis.visit.schedule', 'vis'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'vis.visit.register', 'vis'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois agendam; só o Alfa opera a cancela.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO E O CARIMBO DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu livro; a hora mentida é descartada ==='

do $$
declare
  v_id uuid; v_in timestamptz; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Walk-in tentando MENTIR a hora: o gatilho descarta e carimba agora.
  insert into vis.visits (tenant_id, visitor_name, host, checked_in_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Entregador da manhã', 'almoxarifado',
          '1999-01-01 00:00+00')
  returning id into v_id;

  select checked_in_at into v_in from vis.visits where id = v_id;
  perform pg_temp.assert26(
    v_in > now() - interval '1 minute',
    '⭐ a hora mentida foi descartada — o carimbo de entrada é do servidor');

  -- Nascer já saído não existe: só agendada ou entrando agora.
  begin
    insert into vis.visits (tenant_id, visitor_name, host, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fantasma', 'x', 'checked_out');
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: nasceu já saído');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert26(v_erro like '%nasce agendada ou entrando%', 'a visita nasce agendada ou entrando agora');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- O Beta AGENDA (a mão dele)…
  insert into vis.visits (tenant_id, visitor_name, host, status, expected_at)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Consultora da tarde', 'diretoria',
          'scheduled', now() + interval '3 hours');

  -- …mas NÃO registra walk-in (a cancela não é dele).
  begin
    insert into vis.visits (tenant_id, visitor_name, host)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Walk-in indevido', 'x');
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: o Beta operou a cancela');
  exception when insufficient_privilege then
    perform pg_temp.assert26(true, '⭐ quem agenda não carimba — a cancela é mão própria');
  end;

  select count(*) into v_n from vis.visits;
  perform pg_temp.assert26(v_n = 1, 'o Beta enxerga só o livro dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ CHECK-OUT SEM CHECK-IN NÃO EXISTE; NENHUM FIM VOLTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: saída sem entrada é livro que mente; a passagem não volta ==='

do $$
declare
  v_id uuid; v_out timestamptz; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into vis.visits (tenant_id, visitor_name, host, status, expected_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Agendado da tarde', 'compras',
          'scheduled', now() + interval '1 hour')
  returning id into v_id;

  begin
    update vis.visits set status = 'checked_out' where id = v_id;
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: saiu sem ter entrado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert26(v_erro like '%visita nova%', '⭐ check-out sem check-in não existe');
  end;

  -- O caminho certo: chegou, carimbou; saiu, carimbou.
  update vis.visits set status = 'checked_in' where id = v_id;
  update vis.visits set status = 'checked_out' where id = v_id;

  select checked_out_at into v_out from vis.visits where id = v_id;
  perform pg_temp.assert26(v_out is not null, '⭐ a saída carimbou — pelo servidor');

  -- ⭐ NENHUM fim volta: a passagem é única.
  begin
    update vis.visits set status = 'checked_in' where id = v_id;
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: a passagem voltou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert26(v_erro like '%visita nova%', '⭐ quem volta amanhã é visita nova');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'vis.visit.departed';
  perform pg_temp.assert26(v_n = 1, 'vis.visit.departed saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O REGISTRO CONGELA NO CHECK-IN; CORRIGIR É REGISTRO NOVO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: agendada edita-se (é plano); entrada não se rasura (é fato) ==='

do $$
declare
  v_ag uuid; v_in uuid; v_novo uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Agendada: edita-se à vontade — agendamento é plano.
  insert into vis.visits (tenant_id, visitor_name, host, status, expected_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nome com erro', 'rh',
          'scheduled', now() + interval '2 hours')
  returning id into v_ag;
  update vis.visits set visitor_name = 'Nome corrigido no plano' where id = v_ag;
  perform pg_temp.assert26(true, 'agendada edita-se — agendamento é plano, não fato');

  -- Entrou: congela.
  select id into v_in from vis.visits
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and visitor_name = 'Entregador da manhã';

  begin
    update vis.visits set visitor_name = 'Outro nome' where id = v_in;
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: rasurou o fato');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert26(v_erro like '%não se rasura%', '⭐ o que a portaria viu não se rasura');
  end;

  -- ⭐ Corrigir é registro NOVO apontando o errado.
  insert into vis.visits (tenant_id, visitor_name, host, corrects_visit_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Entregador da manhã (grafia certa)',
          'almoxarifado', v_in)
  returning id into v_novo;
  perform pg_temp.assert26(v_novo is not null, '⭐ a correção é registro novo, apontando o errado');

  -- E a correção não atravessa tenant (FK composta).
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  begin
    insert into vis.visits (tenant_id, visitor_name, host, status, expected_at, corrects_visit_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor', 'x',
            'scheduled', now(), v_in);
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: corrigiu registro de outro tenant');
  exception when foreign_key_violation then
    perform pg_temp.assert26(true, 'a correção não atravessa a fronteira do tenant');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — DESMARCAR: A MÃO CERTA E A RAZÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: desmarcar exige razão — e o não-veio é observação da cancela ==='

do $$
declare
  v_id uuid; v_beta uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from vis.visits
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and visitor_name = 'Nome corrigido no plano';

  begin
    update vis.visits set status = 'cancelled' where id = v_id;
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: desmarcou em silêncio');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert26(v_erro like '%razão%', 'desmarcar exige a razão escrita');
  end;

  update vis.visits set status = 'cancelled', cancel_reason = 'o anfitrião viajou'
   where id = v_id;
  perform pg_temp.assert26(true, 'desmarcada com razão — a agenda não mente');

  -- O Beta (só agenda) não marca o não-veio: é observação da CANCELA.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_beta from vis.visits
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and status = 'scheduled' limit 1;

  begin
    update vis.visits set status = 'no_show' where id = v_beta;
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: o Beta marcou não-veio');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert26(
      v_erro like '%vis.visit.register%',
      '⭐ o não-veio é observação da cancela — com o nome da permissão no erro');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'vis.visit.cancelled';
  perform pg_temp.assert26(v_n = 1, 'vis.visit.cancelled saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐ O DOCUMENTO NÃO PASSEIA PELO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o envelope REAL leva nome e destino — nunca o documento ==='

do $$
declare
  v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into vis.visits (tenant_id, visitor_name, visitor_document, visitor_contact, host)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Visitante documentado',
          'RG-SECRETO-99', '(62) 9 SEGREDO', 'financeiro');

  reset role;
  select count(*) into v_n from core.event_outbox
   where payload::text like '%RG-SECRETO-99%' or payload::text like '%SEGREDO%';
  perform pg_temp.assert26(v_n = 0, '⭐ o documento e o contato NÃO saíram no envelope — dado pessoal fica na portaria');

  select count(*) into v_n from core.event_outbox
   where event_type = 'vis.visit.arrived'
     and payload->>'visitorName' = 'Visitante documentado';
  perform pg_temp.assert26(v_n = 1, 'o nome e o destino saíram — o correio entrega o fato, não a ficha');
end $$;

-- =============================================================================
-- CENÁRIO 6 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: apagar não existe; emit_event não é concedida ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from vis.visits
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from vis.visits where id = v_id;
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: apagou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert26(true, 'o livro da portaria não se apaga');
  end;

  begin
    perform vis.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vis.visit.arrived', '{}'::jsonb);
    perform pg_temp.assert26(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert26(true, 'vis.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 21 OK: carimbos do servidor, registro sem rasura, passagem única, documento em casa ==='
