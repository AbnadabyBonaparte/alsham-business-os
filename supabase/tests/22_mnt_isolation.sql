-- =============================================================================
-- O MÓDULO 17 NO BANCO — a ordem que volta da conclusão, o relato obrigatório
-- e a próxima devida calculada
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as ordens e as réguas de um tenant não aparecem no outro;
--   2. ⭐ **concluir exige o RELATO e a permissão própria** (assimetria
--      user-a × user-b), com carimbo do servidor;
--   3. ⭐ **done → in_progress volta e LIMPA o carimbo** (o ops mantido);
--      `cancelled` é terminal de verdade, contra o gatilho real;
--   4. ⭐ **recorrência só na preventiva** (constraint) e a **próxima
--      devida sai da view calculada** — sob a RLS de quem lê;
--   5. a trilha é escrita pelo GATILHO (o cliente não escreve nela) e é
--      imutável até para o dono do banco;
--   6. apagar não existe; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert22(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Manutenção nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'mnt', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'mnt', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as TRÊS permissões;
-- `user-b` (Beta) abre e move — mas NÃO conclui.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'mnt'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('mnt.order.manage'), ('mnt.setup.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'mnt.order.complete', 'mnt'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois abrem e movem; só o Alfa conclui.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A RECORRÊNCIA SÓ NA PREVENTIVA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu quadro; corretiva não tem calendário ==='

do $$
declare
  v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into mnt.priorities (tenant_id, name, position) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'parada de produção', 0),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rotina', 1);

  insert into mnt.orders (tenant_id, title, kind, target)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Reparo no portão da doca', 'corrective', 'portão da doca');

  begin
    insert into mnt.orders (tenant_id, title, kind, target, recurrence_days)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Errada', 'corrective', 'x', 30);
    perform pg_temp.assert22(false, 'DEVERIA TER FALHADO: corretiva com recorrência');
  exception when check_violation then
    perform pg_temp.assert22(true, '⭐ recorrência é da preventiva — a corretiva responde à falha');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into mnt.orders (tenant_id, title, kind, target)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Troca de fechadura', 'corrective', 'sala 2');

  select count(*) into v_n from mnt.orders;
  perform pg_temp.assert22(v_n = 1, 'o Beta enxerga só as ordens dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ CONCLUIR: RELATO OBRIGATÓRIO, PERMISSÃO, CARIMBO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: sem relato não conclui; o Beta não conclui; o carimbo é do servidor ==='

do $$
declare
  v_id uuid; v_beta uuid; v_erro text; v_by uuid; v_n int;
begin
  set local role authenticated;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_beta from mnt.orders
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  begin
    update mnt.orders set status = 'done', completion_note = 'feito' where id = v_beta;
    perform pg_temp.assert22(false, 'DEVERIA TER FALHADO: concluiu sem complete');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert22(
      v_erro like '%mnt.order.complete%',
      '⭐ sem complete não se conclui — com o nome da permissão no erro');
  end;

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id from mnt.orders
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    update mnt.orders set status = 'done' where id = v_id;
    perform pg_temp.assert22(false, 'DEVERIA TER FALHADO: concluiu sem relato');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert22(v_erro like '%relato%', '⭐ concluir exige o relato do que foi feito');
  end;

  -- open → done direto: o pequeno reparo se registra depois de feito.
  update mnt.orders
     set status = 'done', completion_note = 'dobradiça trocada e portão testado',
         cost_cents = 18000, currency = 'BRL'
   where id = v_id;

  select completed_by into v_by from mnt.orders where id = v_id;
  perform pg_temp.assert22(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ a conclusão carimbou QUEM — pelo servidor');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'mnt.order.completed';
  perform pg_temp.assert22(v_n = 1, 'mnt.order.completed saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A VOLTA DE DONE E O CANCELADO TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a vistoria reprova — o MESMO serviço volta; cancelada não ==='

do $$
declare
  v_id uuid; v_erro text; v_at timestamptz; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from mnt.orders
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status = 'done' limit 1;

  -- ⭐ done → in_progress: o carimbo limpa; o fato reopened sai.
  update mnt.orders set status = 'in_progress' where id = v_id;

  select completed_at into v_at from mnt.orders where id = v_id;
  perform pg_temp.assert22(v_at is null, '⭐ a volta limpou o carimbo — o serviço está vivo de novo');

  -- Conclui de novo e a história inteira fica na trilha.
  update mnt.orders set status = 'done', completion_note = 'ajuste refeito; vistoria aprovou' where id = v_id;

  -- Cancelada é terminal.
  insert into mnt.orders (tenant_id, title, kind, target)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ordem enganada', 'corrective', 'nada')
  returning id into v_id;
  update mnt.orders set status = 'cancelled' where id = v_id;

  begin
    update mnt.orders set status = 'in_progress' where id = v_id;
    perform pg_temp.assert22(false, 'DEVERIA TER FALHADO: cancelada voltou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert22(v_erro like '%ordem nova%', '⭐ cancelada é terminal — a falha nova é ordem nova');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'mnt.order.reopened';
  perform pg_temp.assert22(v_n = 1, 'mnt.order.reopened saiu uma vez');
  select count(*) into v_n from core.event_outbox where event_type = 'mnt.order.completed';
  perform pg_temp.assert22(v_n = 2, 'o segundo completed também saiu — a história está na trilha');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ A PRÓXIMA DEVIDA, CALCULADA E SOB RLS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: a preventiva concluída aparece na fila com a data certa ==='

do $$
declare
  v_id uuid; v_due date; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into mnt.orders (tenant_id, title, kind, target, recurrence_days)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Troca de filtro', 'preventive', 'ar da sala 5', 90)
  returning id into v_id;
  update mnt.orders set status = 'done', completion_note = 'filtro trocado' where id = v_id;

  select next_due_on into v_due from mnt.preventive_queue where id = v_id;
  perform pg_temp.assert22(
    v_due = current_date + 90,
    '⭐ a próxima devida é concluída + N dias — calculada, nunca coluna');

  -- E a fila é só do tenant que lê.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from mnt.preventive_queue;
  perform pg_temp.assert22(v_n = 0, 'o Beta não vê a fila do Alfa — RLS dentro da view');
end $$;

-- =============================================================================
-- CENÁRIO 5 — A TRILHA É DO GATILHO, E É ETERNA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o cliente não escreve a trilha; ninguém a edita ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from mnt.orders
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and title = 'Reparo no portão da doca';

  select count(*) into v_n from mnt.order_events where order_id = v_id;
  perform pg_temp.assert22(v_n >= 3, 'a trilha registrou abertura e cada movimento — escrita pelo gatilho');

  begin
    insert into mnt.order_events (tenant_id, order_id, from_status, to_status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'open', 'done');
    perform pg_temp.assert22(false, 'DEVERIA TER FALHADO: cliente escreveu na trilha');
  exception when insufficient_privilege then
    perform pg_temp.assert22(true, 'a trilha é do gatilho — o cliente não escreve nela');
  end;

  reset role;
  begin
    delete from mnt.order_events where order_id = v_id;
    perform pg_temp.assert22(false, 'DEVERIA TER FALHADO: apagou a trilha como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert22(v_erro like '%fato consumado%', '⭐ a trilha não se apaga nem como dono do banco');
  end;
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

  select id into v_id from mnt.orders
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  begin
    delete from mnt.orders where id = v_id;
    perform pg_temp.assert22(false, 'DEVERIA TER FALHADO: apagou ordem');
  exception when insufficient_privilege then
    perform pg_temp.assert22(true, 'apagar ordem não existe — cancelar é status');
  end;

  begin
    perform mnt.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'mnt.order.opened', '{}'::jsonb);
    perform pg_temp.assert22(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert22(true, 'mnt.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 17 OK: relato obrigatório, done volta, próxima devida calculada, tenants isolados ==='
