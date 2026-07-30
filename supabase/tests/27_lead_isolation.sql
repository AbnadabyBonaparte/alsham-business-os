-- =============================================================================
-- O MÓDULO 22 NO BANCO — a fila que anda e volta, os desfechos terminais e
-- os vínculos soltos carimbados pela tela
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. a fila de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta ATENDE mas não dá o DESFECHO;
--   2. ⭐ **a fila anda e VOLTA** (in_contact → new), mas os desfechos são
--      TERMINAIS — quem volta é lead novo, contra o gatilho real;
--   3. ⭐ **descartar exige razão** e o carimbo é do servidor;
--   4. ⭐ **os vínculos do qualificado são soltos** — carimbados na
--      transição, recusados pela constraint na fila viva, congelados depois;
--   5. ⭐ **o contato não passeia pelo correio** — no payload REAL;
--   6. o responsável vem de core.memberships; apagar não existe; a caneta
--      de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert27(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Leads nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lead', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'lead', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) atende E decide;
-- `user-b` (Beta) só ATENDE — quem atende a fila não fecha o destino dela.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'lead.lead.manage', 'lead'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'lead.lead.decide', 'lead'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois atendem; só o Alfa decide.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO NA FILA E O RESPONSÁVEL DA CASA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua fila; o lead nasce na fila; responsável é membro ==='

do $$
declare
  v_id uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into lead.leads (tenant_id, name, contact, source, interest)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Interessado do stand',
          '(62) 9 CONTATO-PRIVADO', 'stand da feira', 'orçamento de reforma')
  returning id into v_id;

  begin
    insert into lead.leads (tenant_id, name, status, decided_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasceu decidido', 'qualified', now());
    perform pg_temp.assert27(false, 'DEVERIA TER FALHADO: nasceu com desfecho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert27(v_erro like '%nasce na fila%', 'o lead nasce na fila — o resto é transição');
  end;

  -- O responsável vem de core.memberships — usuário de fora cai na FK.
  begin
    update lead.leads
       set assignee_user_id = '99999999-9999-4999-8999-999999999999'
     where id = v_id;
    perform pg_temp.assert27(false, 'DEVERIA TER FALHADO: responsável de fora da casa');
  exception when foreign_key_violation then
    perform pg_temp.assert27(true, 'o responsável vem de core.memberships — o padrão do ops');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into lead.leads (tenant_id, name, source)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Indicação da dona Maria', 'indicação');

  select count(*) into v_n from lead.leads;
  perform pg_temp.assert27(v_n = 1, 'o Beta enxerga só a fila dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A FILA ANDA E VOLTA; O DESFECHO É DE MÃO PRÓPRIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: atender e devolver não é desfecho; o Beta não decide ==='

do $$
declare
  v_beta uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_beta from lead.leads
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  -- A fila anda…
  update lead.leads set status = 'in_contact' where id = v_beta;
  -- …e VOLTA: atender e devolver não é desfecho.
  update lead.leads set status = 'new' where id = v_beta;
  perform pg_temp.assert27(true, '⭐ a fila anda e volta — devolver não é desfecho');

  begin
    update lead.leads set status = 'discarded', discard_reason = 'não era para nós' where id = v_beta;
    perform pg_temp.assert27(false, 'DEVERIA TER FALHADO: o Beta decidiu');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert27(
      v_erro like '%lead.lead.decide%',
      '⭐ o desfecho é de mão própria — com o nome da permissão no erro');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ QUALIFICAR: OS VÍNCULOS SOLTOS, CARIMBADOS NA TRANSIÇÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a fila viva não aponta para lugar nenhum; o qualificado carimba e congela ==='

do $$
declare
  v_id uuid; v_by uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from lead.leads
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Interessado do stand';

  -- A fila viva NÃO aponta para lugar nenhum (constraint).
  begin
    update lead.leads set party_id = gen_random_uuid(), party_name = 'Apressado Ltda'
     where id = v_id;
    perform pg_temp.assert27(false, 'DEVERIA TER FALHADO: vínculo na fila viva');
  exception when check_violation then
    perform pg_temp.assert27(true, '⭐ o vínculo é rastro do QUALIFICADO — a fila viva não aponta');
  end;

  -- Qualificar CARIMBA os vínculos soltos — id + nome, pela tela.
  update lead.leads
     set status = 'qualified',
         party_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
         party_name = 'Reformas do Stand Ltda',
         opportunity_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         opportunity_title = 'Reforma do galpão'
   where id = v_id;

  select decided_by into v_by from lead.leads where id = v_id;
  perform pg_temp.assert27(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ o desfecho carimbou QUEM — pelo servidor');

  -- ⭐ Terminal: não volta, não edita.
  begin
    update lead.leads set status = 'new' where id = v_id;
    perform pg_temp.assert27(false, 'DEVERIA TER FALHADO: o qualificado voltou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert27(v_erro like '%lead novo%', '⭐ o desfecho é terminal — quem volta é lead novo');
  end;

  begin
    update lead.leads set party_name = 'Rasura Ltda' where id = v_id;
    perform pg_temp.assert27(false, 'DEVERIA TER FALHADO: editou o carimbo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert27(v_erro like '%não se edita%', 'lead com desfecho congela — inclusive os vínculos');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type = 'lead.lead.qualified'
     and payload->>'partyName' = 'Reformas do Stand Ltda';
  perform pg_temp.assert27(v_n = 1, 'lead.lead.qualified saiu com o nome carimbado no envelope');
end $$;

-- =============================================================================
-- CENÁRIO 4 — DESCARTAR EXIGE A RAZÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: a fila que apaga em silêncio esconde o próprio funil ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into lead.leads (tenant_id, name, source)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Curioso de passagem', 'passou na porta')
  returning id into v_id;

  begin
    update lead.leads set status = 'discarded' where id = v_id;
    perform pg_temp.assert27(false, 'DEVERIA TER FALHADO: descartou em silêncio');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert27(v_erro like '%razão%', 'descartar exige a razão escrita');
  end;

  update lead.leads set status = 'discarded', discard_reason = 'procurava outro serviço'
   where id = v_id;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'lead.lead.discarded';
  perform pg_temp.assert27(v_n = 1, 'lead.lead.discarded saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐ O CONTATO NÃO PASSEIA; APAGAR NÃO EXISTE; A CANETA TAMPOUCO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o envelope REAL leva nome e origem — nunca o contato ==='

do $$
declare
  v_id uuid; v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox
   where payload::text like '%CONTATO-PRIVADO%';
  perform pg_temp.assert27(v_n = 0, '⭐ o contato NÃO saiu em envelope nenhum — dado pessoal fica na fila');

  select count(*) into v_n from core.event_outbox
   where event_type = 'lead.lead.created'
     and payload->>'source' = 'stand da feira';
  perform pg_temp.assert27(v_n = 1, 'a origem saiu no envelope — a leitura de funil viaja');

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from lead.leads
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from lead.leads where id = v_id;
    perform pg_temp.assert27(false, 'DEVERIA TER FALHADO: apagou a fila');
  exception when insufficient_privilege then
    perform pg_temp.assert27(true, 'apagar lead não existe — descartar é status com razão');
  end;

  begin
    perform lead.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lead.lead.created', '{}'::jsonb);
    perform pg_temp.assert27(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert27(true, 'lead.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 22 OK: fila que volta, desfechos terminais, vínculos soltos, contato em casa ==='
