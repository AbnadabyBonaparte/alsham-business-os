-- =============================================================================
-- O MÓDULO 15 NO BANCO — o caso que reabre, o fechado terminal e a conversa
-- imutável
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. dois tenants desenham vocabulários DIFERENTES (categoria e
--      prioridade) na mesma tabela, sem se ver;
--   2. ⭐ **resolver exige `resolve`** (assimetria user-a × user-b) **e o
--      carimbo é do SERVIDOR**;
--   3. ⭐ **reabrir (`resolved → open`) LIMPA o carimbo e emite fato
--      próprio; `closed` é terminal de verdade, contra o gatilho real**;
--   4. caso resolvido congela o conteúdo; caso fechado não conversa;
--   5. a conversa é imutável até para o dono do banco;
--   6. apagar não existe; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert20(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Atendimento nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'care', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'care', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as TRÊS permissões;
-- `user-b` (Beta) recebe manage e setup — mas NÃO resolve.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'care'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('care.ticket.manage'), ('care.setup.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'care.ticket.resolve', 'care'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois atendem; só o Alfa resolve.'

-- =============================================================================
-- CENÁRIO 1 — DOIS VOCABULÁRIOS NA MESMA TABELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: a loja e a clínica desenham classificações diferentes ==='

do $$
declare
  v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into care.categories (tenant_id, name) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'troca e devolução'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'defeito');
  insert into care.priorities (tenant_id, name, position) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'urgente', 0),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'normal', 1);

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into care.categories (tenant_id, name) values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'remarcação de consulta');
  insert into care.priorities (tenant_id, name, position) values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'paciente em espera', 0);

  select count(*) into v_n from care.categories;
  perform pg_temp.assert20(v_n = 1, 'o Beta enxerga só o vocabulário dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ RESOLVER É ATO: PERMISSÃO PRÓPRIA E CARIMBO DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o Beta atende mas não resolve; o carimbo é do servidor ==='

do $$
declare
  v_id uuid; v_beta uuid; v_erro text; v_by uuid; v_n int;
begin
  set local role authenticated;

  -- O Beta abre e trabalha o caso dele — e não consegue resolvê-lo.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  insert into care.tickets (tenant_id, subject, requester_name, requester_contact)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Remarcar horário', 'Paciente Demo', 'balcão')
  returning id into v_beta;

  update care.tickets set status = 'in_progress' where id = v_beta;

  begin
    update care.tickets set status = 'resolved' where id = v_beta;
    perform pg_temp.assert20(false, 'DEVERIA TER FALHADO: resolveu sem resolve');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert20(
      v_erro like '%care.ticket.resolve%',
      '⭐ sem resolve não se resolve — com o nome da permissão no erro');
  end;

  -- O Alfa resolve o dele, com o carimbo do servidor.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  insert into care.tickets (tenant_id, subject, requester_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Produto avariado', 'Cliente Alfa')
  returning id into v_id;

  update care.tickets
     set status = 'resolved', resolution_note = 'produto trocado no balcão'
   where id = v_id;

  select resolved_by into v_by from care.tickets where id = v_id;
  perform pg_temp.assert20(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ a resolução carimbou QUEM — pelo servidor, não pela tela');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'care.ticket.resolved';
  perform pg_temp.assert20(v_n = 1, 'care.ticket.resolved saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ REABRIR É DO MESMO CASO; FECHADO É TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: resolved reabre e limpa o carimbo; closed não volta ==='

do $$
declare
  v_id uuid; v_erro text; v_at timestamptz; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from care.tickets
   where subject = 'Produto avariado'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  -- ⭐ Reabrir: o MESMO caso, carimbo limpo.
  update care.tickets set status = 'open' where id = v_id;

  select resolved_at into v_at from care.tickets where id = v_id;
  perform pg_temp.assert20(v_at is null, '⭐ reabrir limpou o carimbo — o caso voltou vivo');

  -- Resolve de novo e fecha — e o fechado é o fim.
  update care.tickets set status = 'resolved', resolution_note = 'reposição enviada' where id = v_id;
  update care.tickets set status = 'closed' where id = v_id;

  begin
    update care.tickets set status = 'open' where id = v_id;
    perform pg_temp.assert20(false, 'DEVERIA TER FALHADO: reabriu o fechado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert20(v_erro like '%caso novo%', '⭐ fechado não volta — quem volta é caso novo');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'care.ticket.reopened';
  perform pg_temp.assert20(v_n = 1, 'care.ticket.reopened saiu uma vez');
  select count(*) into v_n from core.event_outbox where event_type = 'care.ticket.resolved';
  perform pg_temp.assert20(v_n = 2, 'o segundo resolved também saiu — a história inteira está na trilha');
end $$;

-- =============================================================================
-- CENÁRIO 4 — O ENCERRADO CONGELA; O FECHADO NÃO CONVERSA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: resolvido não se edita; fechado não recebe interação ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from care.tickets
   where subject = 'Produto avariado'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  begin
    update care.tickets set subject = 'assunto reescrito' where id = v_id;
    perform pg_temp.assert20(false, 'DEVERIA TER FALHADO: editou caso fechado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert20(v_erro like '%não se edita%', 'caso encerrado não se edita');
  end;

  begin
    insert into care.interactions (tenant_id, ticket_id, body)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'tentativa tardia');
    perform pg_temp.assert20(false, 'DEVERIA TER FALHADO: conversou com o fechado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert20(v_erro like '%caso novo%', 'fechado não conversa — abra caso novo');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — A CONVERSA É IMUTÁVEL ATÉ PARA O DONO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: a interação não se edita nem se apaga ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from care.tickets
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  insert into care.interactions (tenant_id, ticket_id, body, channel)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_id, 'paciente prefere quinta às 14h', 'telefone');

  begin
    update care.interactions set body = 'reescrito' where ticket_id = v_id;
    perform pg_temp.assert20(false, 'DEVERIA TER FALHADO: editou interação');
  exception when insufficient_privilege then
    perform pg_temp.assert20(true, 'a conversa não se edita pelo cliente');
  end;

  reset role;
  begin
    delete from care.interactions where ticket_id = v_id;
    perform pg_temp.assert20(false, 'DEVERIA TER FALHADO: apagou como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert20(v_erro like '%fato consumado%', '⭐ a conversa não se apaga nem como dono do banco');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'care.interaction.recorded';
  perform pg_temp.assert20(v_n = 1, 'care.interaction.recorded saiu uma vez');
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
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from care.tickets
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  begin
    delete from care.tickets where id = v_id;
    perform pg_temp.assert20(false, 'DEVERIA TER FALHADO: apagou caso');
  exception when insufficient_privilege then
    perform pg_temp.assert20(true, 'apagar caso não existe — fechar é status');
  end;

  begin
    perform care.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'care.ticket.opened', '{}'::jsonb);
    perform pg_temp.assert20(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert20(true, 'care.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 15 OK: reabre do resolvido, fecha de vez, conversa eterna, tenants isolados ==='
