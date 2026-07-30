-- =============================================================================
-- O MÓDULO 23 NO BANCO — a trave que congela, o livro do andamento e a
-- época que fecha com número na mesa
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o placar de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta gerencia mas NÃO reporta nem decide;
--   2. ⭐ **a meta nasce no rascunho** e o **check-in só corre em meta
--      ATIVA** (o rascunho não corre; a cancelada não recebe número);
--   3. ⭐ **a trave congela na ativação** — alvo, métrica e período não
--      mudam com a meta correndo, contra o gatilho real;
--   4. ⭐ **fechar sem check-in é achismo** (o gatilho conta) e o desfecho
--      carimba pelo servidor; os fins são terminais;
--   5. o livro de check-ins é imutável até para o dono do banco, e o
--      progresso sai da VIEW calculada, sob RLS;
--   6. apagar não existe; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert28(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Metas nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'goal', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'goal', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) tem as TRÊS mãos;
-- `user-b` (Beta) só GERENCIA — não põe número na mesa nem fecha época.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'goal.goal.manage', 'goal'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'goal'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('goal.goal.report'), ('goal.goal.decide')) as p(k)
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois gerenciam; só o Alfa reporta e decide.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O RASCUNHO E O CHECK-IN QUE ESPERA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce no rascunho; o rascunho não corre; cada tenant no seu placar ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into goal.goals (tenant_id, title, metric, starts_on, ends_on, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasceu correndo', 'x',
            '2026-07-01', '2026-09-30', 'active');
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: nasceu ativa');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert28(v_erro like '%nasce no rascunho%', 'a meta nasce no rascunho');
  end;

  insert into goal.goals (tenant_id, title, metric, target_value, currency, starts_on, ends_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Faturamento do trimestre', 'faturamento',
          300000, 'BRL', '2026-07-01', '2026-09-30')
  returning id into v_id;

  -- ⭐ O rascunho não corre: check-in recusado.
  begin
    insert into goal.checkins (tenant_id, goal_id, reported_value)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 100);
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: check-in no rascunho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert28(v_erro like '%não corre%', '⭐ o rascunho ainda não corre');
  end;

  -- Moeda sem valor é promessa: a constraint recusa.
  begin
    insert into goal.goals (tenant_id, title, metric, currency, starts_on, ends_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Promessa', 'faturamento', 'BRL',
            '2026-07-01', '2026-09-30');
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: moeda sem valor');
  exception when check_violation then
    perform pg_temp.assert28(true, 'moeda declarada exige o valor — dinheiro sem número é promessa');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into goal.goals (tenant_id, title, metric, starts_on, ends_on)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Ocupação do prédio', 'lojas ocupadas',
          '2026-01-01', '2026-12-31');

  select count(*) into v_n from goal.goals;
  perform pg_temp.assert28(v_n = 1, 'o Beta enxerga só o placar dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A TRAVE CONGELA NA ATIVAÇÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: ativa não muda de alvo, métrica nem período ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from goal.goals
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Faturamento do trimestre';

  -- No rascunho a trave ainda se move.
  update goal.goals set target_value = 320000 where id = v_id;
  perform pg_temp.assert28(true, 'no rascunho a trave ainda se move');

  update goal.goals set status = 'active' where id = v_id;

  begin
    update goal.goals set target_value = 200000 where id = v_id;
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: mudou o alvo com a meta correndo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert28(v_erro like '%trave%', '⭐ a trave congela na ativação');
  end;

  -- O que segue vivo, segue vivo: a descrição muda.
  update goal.goals set description = 'sem imposto, líquido' where id = v_id;
  perform pg_temp.assert28(true, 'descrição e dono seguem vivos — gente muda');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O LIVRO: CARIMBO, IMUTABILIDADE E A VIEW
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o número na mesa é ato carimbado; o progresso sai da view ==='

do $$
declare
  v_id uuid; v_by uuid; v_last numeric; v_erro text; v_n int;
begin
  set local role authenticated;

  -- O Beta (só manage) não põe número na mesa.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  update goal.goals set status = 'active'
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  declare v_beta uuid;
  begin
    select id into v_beta from goal.goals
     where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;
    begin
      insert into goal.checkins (tenant_id, goal_id, reported_value)
      values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_beta, 30);
      perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: o Beta reportou');
    exception when insufficient_privilege then
      perform pg_temp.assert28(true, '⭐ o número na mesa é mão própria (goal.goal.report)');
    end;
  end;

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id from goal.goals
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Faturamento do trimestre';

  insert into goal.checkins (tenant_id, goal_id, reported_value, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 120000, 'fechamento de julho');
  insert into goal.checkins (tenant_id, goal_id, reported_value, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 185000, 'fechamento de agosto');

  select reported_by into v_by from goal.checkins
   where goal_id = v_id order by seq desc limit 1;
  perform pg_temp.assert28(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ o check-in carimbou QUEM — pelo servidor');

  -- ⭐ O progresso vigente sai da VIEW: o último do livro, pela sequência.
  select last_value into v_last from goal.goal_progress where goal_id = v_id;
  perform pg_temp.assert28(v_last = 185000, '⭐ o progresso é o último check-in — da view, nunca de coluna');

  -- O livro não se rasura — nem como dono do banco.
  begin
    update goal.checkins set reported_value = 999999 where goal_id = v_id;
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: rasurou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert28(true, 'o cliente não rasura o livro');
  end;

  reset role;
  begin
    delete from goal.checkins where goal_id = v_id;
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: apagou o livro como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert28(v_erro like '%fato consumado%', '⭐ o livro não se apaga nem como dono do banco');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'goal.goal.reported';
  perform pg_temp.assert28(v_n = 2, 'goal.goal.reported saiu duas vezes');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ FECHAR COM NÚMERO NA MESA; OS FINS SÃO TERMINAIS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: sem check-in é achismo; a época fechada não reabre; cancelada não recebe número ==='

do $$
declare
  v_id uuid; v_beta uuid; v_by uuid; v_erro text; v_n int;
begin
  set local role authenticated;

  -- O Beta (só manage) não fecha época.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_beta from goal.goals
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;
  begin
    update goal.goals set status = 'missed' where id = v_beta;
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: o Beta fechou época');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert28(
      v_erro like '%goal.goal.decide%',
      '⭐ fechar época é mão própria — com o nome da permissão no erro');
  end;

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Meta nova, ativa, SEM check-in: fechar é achismo.
  insert into goal.goals (tenant_id, title, metric, starts_on, ends_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Meta sem número', 'visitas', '2026-07-01', '2026-07-31')
  returning id into v_id;
  update goal.goals set status = 'active' where id = v_id;

  begin
    update goal.goals set status = 'achieved' where id = v_id;
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: fechou sem número na mesa');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert28(v_erro like '%achismo%', '⭐ fechar sem check-in é achismo');
  end;

  -- Cancela com razão (não exige número) — e cancelada não recebe número.
  update goal.goals set status = 'cancelled', cancel_reason = 'o projeto mudou de rumo'
   where id = v_id;
  begin
    insert into goal.checkins (tenant_id, goal_id, reported_value)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 10);
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: check-in em meta cancelada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert28(v_erro like '%época fechada%', '⭐ a cancelada não recebe número novo');
  end;

  -- A com números fecha batida, carimbada — e é terminal.
  select id into v_id from goal.goals
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Faturamento do trimestre';
  update goal.goals set status = 'achieved' where id = v_id;
  select decided_by into v_by from goal.goals where id = v_id;
  perform pg_temp.assert28(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ o desfecho carimbou QUEM — pelo servidor');

  begin
    update goal.goals set status = 'active' where id = v_id;
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: reabriu a época');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert28(v_erro like '%meta nova%', '⭐ a época fechada não reabre — a do próximo período é meta nova');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'goal.goal.achieved';
  perform pg_temp.assert28(v_n = 1, 'goal.goal.achieved saiu uma vez');
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

  select id into v_id from goal.goals
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from goal.goals where id = v_id;
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: apagou meta');
  exception when insufficient_privilege then
    perform pg_temp.assert28(true, 'apagar meta não existe — cancelar é status com razão');
  end;

  begin
    perform goal.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'goal.goal.opened', '{}'::jsonb);
    perform pg_temp.assert28(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert28(true, 'goal.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 23 OK: trave congelada, livro eterno, época com número na mesa, tenants isolados ==='
