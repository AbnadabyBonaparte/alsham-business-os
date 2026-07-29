-- =============================================================================
-- O MÓDULO 11 NO BANCO — a lista honesta, a presença carimbada e a lotação
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. isolamento: o evento de um tenant não aparece na agenda do outro;
--   2. ⭐ publicar exige `decide` (assimetria user-a × user-b) e REALIZADO
--      antes de começar é recusado — honestidade de calendário no gatilho;
--   3. ⭐ inscrição só em evento PUBLICADO — rascunho não tem lista;
--   4. ⭐ a LOTAÇÃO recusa com erro claro, e cancelada libera a vaga;
--   5. ⭐ a presença carimba QUEM e QUANDO pelo servidor, e é terminal;
--   6. o contato é TEXTO LIVRE — "@fulano no instagram" entra como está;
--   7. sem DELETE nas duas tabelas; a caneta do correio não é da tela.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert16(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Eventos nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'evt', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'evt', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA: user-a (Alfa) com as TRÊS; user-b (Beta) com manage e
-- registration.manage, SEM decide.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'evt'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('evt.event.manage'), ('evt.registration.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'evt.event.decide', 'evt'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa decide.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E O CICLO COM HONESTIDADE DE CALENDÁRIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: publicar é decisão; realizado só depois de começar ==='

do $$
declare
  v_futuro uuid; v_passado uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Um evento no futuro e um que já começou.
  insert into evt.events (tenant_id, name, starts_at, location, capacity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Feira de inverno',
          now() + interval '30 days', 'salão 2 do shopping', 2)
  returning id into v_futuro;

  insert into evt.events (tenant_id, name, starts_at, location)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Inauguração da loja',
          now() - interval '2 hours', 'loja centro')
  returning id into v_passado;

  -- O Beta não vê nada disso.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from evt.events;
  perform pg_temp.assert16(v_n = 0, 'a agenda do Beta não tem o evento do Alfa');
end $$;

do $$
declare
  v_evento uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  insert into evt.events (tenant_id, name, starts_at)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Culto de domingo', now() + interval '5 days')
  returning id into v_evento;

  begin
    update evt.events set status = 'published' where id = v_evento;
    perform pg_temp.assert16(false, 'DEVERIA TER FALHADO: publicou sem decide');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert16(
      v_erro like '%evt.event.decide%',
      'publicar é decisão — com o nome da permissão no erro');
  end;

  -- O Alfa publica os dois dele; realizar o futuro é recusado.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  update evt.events set status = 'published' where name = 'Feira de inverno';
  update evt.events set status = 'published' where name = 'Inauguração da loja';

  begin
    update evt.events set status = 'held' where name = 'Feira de inverno';
    perform pg_temp.assert16(false, 'DEVERIA TER FALHADO: realizou evento futuro');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert16(
      v_erro like '%calendário%',
      '⭐ realizado antes de começar é recusado — calendário não se inventa');
  end;

  -- O que já começou, realiza.
  update evt.events set status = 'held' where name = 'Inauguração da loja';
  perform pg_temp.assert16(true, 'o que já começou se registra como realizado');

  -- E publicado não volta a rascunho.
  begin
    update evt.events set status = 'draft' where name = 'Feira de inverno';
    perform pg_temp.assert16(false, 'DEVERIA TER FALHADO: despublicou');
  exception when others then
    perform pg_temp.assert16(true, '⭐ publicado não volta a rascunho — compromisso é compromisso');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A LISTA SÓ ABRE PUBLICADA, E A LOTAÇÃO RECUSA CLARO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: rascunho não tem lista; lotado recusa; cancelada libera ==='

do $$
declare
  v_feira uuid; v_culto uuid; v_reg1 uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_feira from evt.events where name = 'Feira de inverno';

  -- Inscrição em rascunho (o do Beta está draft — mas é de outro tenant;
  -- cria-se um rascunho do Alfa para provar).
  insert into evt.events (tenant_id, name, starts_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ideia de workshop', now() + interval '60 days')
  returning id into v_culto;

  begin
    insert into evt.registrations (tenant_id, event_id, attendee_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_culto, 'Apressado');
    perform pg_temp.assert16(false, 'DEVERIA TER FALHADO: inscreveu em rascunho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert16(v_erro like '%PUBLICADO%', '⭐ rascunho não tem lista');
  end;

  -- A feira tem capacidade 2: entram dois, o terceiro é recusado CLARO.
  insert into evt.registrations (tenant_id, event_id, attendee_name, contact)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_feira, 'Pessoa Um', '@pessoa1 no instagram')
  returning id into v_reg1;

  insert into evt.registrations (tenant_id, event_id, attendee_name, contact)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_feira, 'Pessoa Dois', '(62) 99999-0000');

  begin
    insert into evt.registrations (tenant_id, event_id, attendee_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_feira, 'Pessoa Três');
    perform pg_temp.assert16(false, 'DEVERIA TER FALHADO: inscreveu além do teto');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert16(
      v_erro like '%LOTADO%2 de 2%',
      '⭐ a lotação recusa com o número na cara — nunca aceita calada');
  end;

  -- Cancelou, liberou.
  update evt.registrations set status = 'cancelled' where id = v_reg1;

  insert into evt.registrations (tenant_id, event_id, attendee_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_feira, 'Pessoa Três');
  perform pg_temp.assert16(true, '⭐ cancelada não ocupa vaga — a Pessoa Três entrou');

  select count(*) into v_n from evt.registrations where event_id = v_feira;
  perform pg_temp.assert16(v_n = 3, 'e a linha da desistência FICOU — a lista é história');

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type = 'evt.registration.registered';
  perform pg_temp.assert16(v_n = 3, 'cada inscrição contou o fato dela');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A PRESENÇA É ATO CARIMBADO, E É TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: quem veio, veio — com quem registrou e quando ==='

do $$
declare
  v_feira uuid; v_reg uuid; v_by uuid; v_at timestamptz; v_erro text; v_payload jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_feira from evt.events where name = 'Feira de inverno';
  select id into v_reg from evt.registrations
   where event_id = v_feira and attendee_name = 'Pessoa Dois';

  update evt.registrations set status = 'attended' where id = v_reg;

  select attended_by, attended_at into v_by, v_at from evt.registrations where id = v_reg;
  perform pg_temp.assert16(
    v_by = '11111111-1111-4111-8111-111111111111' and v_at is not null,
    '⭐ a presença carimbou QUEM e QUANDO — pelo servidor, não pela tela');

  begin
    update evt.registrations set status = 'registered' where id = v_reg;
    perform pg_temp.assert16(false, 'DEVERIA TER FALHADO: desfez a presença');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert16(v_erro like '%inscrição nova%', 'presença registrada não se desfaz');
  end;

  reset role;
  select payload into v_payload from core.event_outbox
   where event_type = 'evt.registration.attended';
  perform pg_temp.assert16(
    v_payload->>'eventName' = 'Feira de inverno'
      and v_payload->>'attendeeName' = 'Pessoa Dois',
    '⭐ o fato é autossuficiente: evento pelo NOME, pessoa pelo nome');
end $$;

-- =============================================================================
-- CENÁRIO 4 — SEM DELETE; A CANETA DO CORREIO NÃO É DA TELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: apagar não existe; emitir à mão não existe ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    delete from evt.events where true;
    perform pg_temp.assert16(false, 'DEVERIA TER FALHADO: apagou evento');
  exception when insufficient_privilege then
    perform pg_temp.assert16(true, 'evento não se apaga — cancelar é status');
  end;

  begin
    delete from evt.registrations where true;
    perform pg_temp.assert16(false, 'DEVERIA TER FALHADO: apagou inscrição');
  exception when insufficient_privilege then
    perform pg_temp.assert16(true, 'inscrição não se apaga — a desistência é história');
  end;

  begin
    perform evt.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'evt.event.published', '{}'::jsonb);
    perform pg_temp.assert16(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert16(true, 'evt.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 11 OK: lista honesta, lotação clara, presença carimbada, tenants isolados ==='
