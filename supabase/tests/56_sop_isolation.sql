-- =============================================================================
-- O MÓDULO 49 NO BANCO — a rodada de consenso que se isola, que CONGELA ao ser
-- aprovada, e o consenso: decisão de um papel SEPARADO, carimbada pelo servidor
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as rodadas de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta DESENHA (cadastra) mas não APROVA;
--   2. ⭐ **aprovar exige sop.round.approve** — permissão SEPARADA de quem
--      desenha: o Beta é barrado mesmo tendo o manage; e o consenso é carimbado
--      pelo servidor (o approved_by mentido é descartado);
--   3. ⭐ **APROVAR CONGELA** — depois de `approved`, mudar o título ou o vínculo
--      com o plano RAISES; e o terminal é terminal — a aprovada não anda mais;
--   4. **cancelar exige razão**;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert56(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: sop instalado; Alfa aprova, Beta só desenha ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sop', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'sop', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'sop.round.manage', 'sop'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ ASSIMETRIA: só o Alfa APROVA. O Beta cadastra e edita, não fecha o consenso.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'sop.round.approve', 'sop'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois desenham; só o Alfa aprova o consenso.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO EM RASCUNHO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua rodada; nasce draft; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT: diz que foi o Beta. O gatilho descarta.
  -- E vincula um plano por ID SOLTO (uuid fabricado, sem FK) + nome carimbado.
  insert into sop.rounds (tenant_id, period, title, plan_id, plan_name, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Q1 2027', 'Consenso do trimestre',
          '99999999-9999-4999-8999-999999999999', 'Plano de demanda Q1 2027',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert56(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  begin
    insert into sop.rounds (tenant_id, period, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'approved');
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: nasceu aprovada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert56(v_erro like '%nasce em rascunho%', 'a rodada nasce em rascunho');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into sop.rounds (tenant_id, period)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Ciclo Março/2027')
  returning id into v_id;

  select count(*) into v_n from sop.rounds;
  perform pg_temp.assert56(v_n = 1, 'o Beta enxerga só a rodada dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ APROVAR: exige approve (SEPARADA), carimba pelo servidor
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: aprovar é decisão de um papel separado (approve) ==='

do $$
declare
  v_id_a uuid; v_id_b uuid; v_status text; v_by uuid; v_at timestamptz; v_erro text; v_n int;
begin
  set local role authenticated;

  -- Beta TENTA aprovar a sua rodada — barrado (tem manage, não tem approve).
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_id_b from sop.rounds
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and period = 'Ciclo Março/2027';

  begin
    update sop.rounds set status = 'approved' where id = v_id_b;
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: o Beta aprovou sem approve');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert56(v_erro like '%sop.round.approve%', '⭐ aprovar exige sop.round.approve, permissão SEPARADA de quem desenha');
  end;

  -- Alfa aprova a sua rodada — e MENTE o approved_by. O servidor carimba.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id_a from sop.rounds
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and period = 'Q1 2027';

  update sop.rounds
     set status = 'approved',
         approved_by = '22222222-2222-4222-8222-222222222222'
   where id = v_id_a;

  select status, approved_by, approved_at into v_status, v_by, v_at
    from sop.rounds where id = v_id_a;
  perform pg_temp.assert56(v_status = 'approved', 'a rodada foi aprovada');
  perform pg_temp.assert56(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ approved_by é quem aprovou — o autor mentido foi descartado');
  perform pg_temp.assert56(v_at is not null, 'approved_at foi carimbado pelo servidor');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'sop.round.approved';
  perform pg_temp.assert56(v_n = 1, 'o fato do consenso saiu');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ APROVAR CONGELA; O TERMINAL É TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a rodada aprovada congela e não anda mais ==='

do $$
declare
  v_id_a uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id_a from sop.rounds
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and period = 'Q1 2027';

  -- Mudar o título depois de aprovar: congelado.
  begin
    update sop.rounds set title = 'Outro título' where id = v_id_a;
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: mudou o título depois de aprovar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert56(v_erro like '%não mudam mais%', '⭐ o conteúdo congela depois da aprovação');
  end;

  -- Mudar o vínculo com o plano depois de aprovar: congelado.
  begin
    update sop.rounds set plan_name = 'Outro plano' where id = v_id_a;
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: mudou o plano vinculado depois de aprovar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert56(v_erro like '%não mudam mais%', '⭐ o vínculo com o plano congela depois da aprovação');
  end;

  -- A aprovada é terminal: não anda mais (nem para cancelada).
  begin
    update sop.rounds set status = 'cancelled', cancel_reason = 'tentando reabrir'
     where id = v_id_a;
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: moveu a rodada aprovada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert56(v_erro like '%não existe%', '⭐ a aprovada é terminal — a próxima rodada é rodada nova');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CANCELAR EXIGE RAZÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: cancelar exige razão ==='

do $$
declare
  v_id uuid; v_status text; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into sop.rounds (tenant_id, period)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ciclo Abril/2027')
  returning id into v_id;

  begin
    update sop.rounds set status = 'cancelled' where id = v_id;
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: cancelou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert56(v_erro like '%razão%', 'cancelar exige uma razão');
  end;

  update sop.rounds set status = 'cancelled', cancel_reason = 'consenso não fechou'
   where id = v_id;
  select status into v_status from sop.rounds where id = v_id;
  perform pg_temp.assert56(v_status = 'cancelled', 'cancelou com razão');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'sop.round.cancelled';
  perform pg_temp.assert56(v_n = 1, 'o fato do cancelamento saiu');
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON E CROSS-TENANT FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida; anon e cross-tenant barrados ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from sop.rounds
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from sop.rounds where id = v_id;
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: apagou rodada');
  exception when insufficient_privilege then
    perform pg_temp.assert56(true, 'apagar não existe — rodada decidida é história');
  end;

  begin
    perform sop.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sop.round.registered', '{}'::jsonb);
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert56(true, 'sop.emit_event não é concedida ao cliente');
  end;

  -- Cross-tenant: o Alfa não escreve no tenant do Beta (barrado pela RLS).
  begin
    insert into sop.rounds (tenant_id, period)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasora');
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert56(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from sop.rounds limit 1;
    perform pg_temp.assert56(false, 'DEVERIA TER FALHADO: anon leu sop.rounds');
  exception when insufficient_privilege then
    perform pg_temp.assert56(true, '⭐ anon não encosta em sop.rounds');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 49 OK: rodada isolada, congela ao aprovar, consenso de papel separado carimbado, anon fora ==='
