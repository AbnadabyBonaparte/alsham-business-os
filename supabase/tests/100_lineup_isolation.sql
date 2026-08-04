-- =============================================================================
-- O MÓDULO 95 NO BANCO — a grade isolada por tenant, o autor carimbado pelo
-- servidor, e ⭐⭐ a PROVA DE QUE A AGENDA É PLANO MUTÁVEL: o item se edita e
-- se APAGA (o DIVERGE assinado dos livros imutáveis do império).
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. a grade de um tenant não aparece no outro, e um tenant não escreve na
--      grade do outro (o gate de permissão + tenant);
--   2. ⭐ **o autor é do SERVIDOR** — o `created_by` que o cliente mandar é
--      descartado, e vale sempre quem está autenticado;
--   3. ⭐⭐ **a agenda é PLANO MUTÁVEL** — editar o item FUNCIONA (título,
--      palco, horário, ordem) e APAGAR o item FUNCIONA (tirar a atração da
--      grade é redesenhar o plano, não rasurar um fato) — o DIVERGE dos livros
--      imutáveis (recv/pcost/sec), que não têm porta de update nem de delete;
--   4. ⛔ **o evento CONGELA** — mudar de evento é recusado pelo gatilho;
--   5. física do intervalo: fim sem início e fim antes do início são recusados
--      pela constraint;
--   6. a caneta de emitir evento não é do cliente; o `anon` não encosta na
--      grade; e os fatos (registered/updated) saem no correio.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert100(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: lineup instalado nos dois; Alfa e Beta gerenciam a própria grade ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lineup', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'lineup', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'lineup.slot.manage', 'lineup'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois gerenciam a grade do próprio tenant.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O GATE DE PERMISSÃO+TENANT, E O AUTOR DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua grade; ninguém escreve na grade alheia ==='

do $$
declare
  v_slot_a uuid; v_n int; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Tenta MENTIR o created_by — tem de ser descartado (autor do servidor).
  insert into lineup.slots (tenant_id, event_id, event_name, title, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '10000000-0000-4000-8000-000000000001', 'Congresso Alfa', 'Abertura',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_slot_a, v_created_by;

  perform pg_temp.assert100(v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o do INSERT foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into lineup.slots (tenant_id, event_id, title)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          '20000000-0000-4000-8000-000000000002', 'Keynote Beta');

  -- ⛔ Beta tenta escrever na grade do tenant do Alfa — barrado (sem permissão lá).
  begin
    insert into lineup.slots (tenant_id, event_id, title)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '10000000-0000-4000-8000-000000000001', 'Invasão');
    perform pg_temp.assert100(false, 'DEVERIA TER FALHADO: Beta escreveu na grade do Alfa');
  exception when insufficient_privilege then
    perform pg_temp.assert100(true, '⛔ escrever na grade de outro tenant é barrado');
  end;

  select count(*) into v_n from lineup.slots;
  perform pg_temp.assert100(v_n = 1, 'o Beta enxerga só a grade dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐⭐ A AGENDA É PLANO MUTÁVEL: EDITAR E APAGAR FUNCIONAM
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o item se edita (título/palco/horário/ordem) e se APAGA ==='

do $$
declare
  v_id uuid; v_title text; v_stage text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from lineup.slots
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Abertura';

  -- ⭐ Editar é LIVRE — a agenda é plano.
  update lineup.slots
     set title = 'Cerimônia de Abertura', stage = 'Palco Principal',
         starts_at = '2027-05-10 09:00+00', position = 2
   where id = v_id;

  select title, stage into v_title, v_stage from lineup.slots where id = v_id;
  perform pg_temp.assert100(v_title = 'Cerimônia de Abertura', '⭐ o título mudou — o item é editável');
  perform pg_temp.assert100(v_stage = 'Palco Principal', '⭐ o palco mudou — o item é editável');

  -- ⭐⭐ Apagar FUNCIONA — tirar a atração da grade é redesenhar o plano.
  delete from lineup.slots where id = v_id;
  select count(*) into v_n from lineup.slots
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert100(v_n = 0, '⭐⭐ o item se APAGA — a agenda é plano, não livro imutável');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⛔ O EVENTO CONGELA: MUDAR DE EVENTO É RECUSADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: editar tudo é livre, mas o vínculo com o evento não muda ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into lineup.slots (tenant_id, event_id, title)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '10000000-0000-4000-8000-000000000001', 'Painel')
  returning id into v_id;

  begin
    update lineup.slots set event_id = '99999999-0000-4000-8000-000000000009' where id = v_id;
    perform pg_temp.assert100(false, 'DEVERIA TER FALHADO: mudou o item de evento');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert100(v_erro like '%pertence ao evento%', '⛔ o vínculo com o evento congela — mudar de evento é outra atração');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — FÍSICA DO INTERVALO: FIM SEM INÍCIO E FIM ANTES DO INÍCIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: não há fim sem início; o fim não antecede o início ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into lineup.slots (tenant_id, event_id, title, ends_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '10000000-0000-4000-8000-000000000001', 'Fim solto', '2027-05-10 10:00+00');
    perform pg_temp.assert100(false, 'DEVERIA TER FALHADO: fim sem início');
  exception when check_violation then
    perform pg_temp.assert100(true, 'não há fim sem início — a constraint recusa');
  end;

  begin
    insert into lineup.slots (tenant_id, event_id, title, starts_at, ends_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '10000000-0000-4000-8000-000000000001', 'Invertido',
            '2027-05-10 10:00+00', '2027-05-10 09:00+00');
    perform pg_temp.assert100(false, 'DEVERIA TER FALHADO: fim antes do início');
  exception when check_violation then
    perform pg_temp.assert100(true, 'o fim não antecede o início — a constraint recusa');
  end;

  -- ✅ Os dois nulos (TBD) são permitidos: o programa pode nascer a definir.
  insert into lineup.slots (tenant_id, event_id, title)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '10000000-0000-4000-8000-000000000001', 'Atração a definir');
  perform pg_temp.assert100(true, '⭐ o programa pode nascer TBD — sem horário é permitido');
end $$;

-- =============================================================================
-- CENÁRIO 5 — A CANETA NÃO É DO CLIENTE; ANON FORA; OS FATOS SAÍRAM
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: emit_event não é concedida; anon barrado; os fatos no correio ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    perform lineup.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lineup.slot.registered', '{}'::jsonb);
    perform pg_temp.assert100(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert100(true, 'lineup.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;

  begin
    perform 1 from lineup.slots limit 1;
    perform pg_temp.assert100(false, 'DEVERIA TER FALHADO: anon leu lineup.slots');
  exception when insufficient_privilege then
    perform pg_temp.assert100(true, '⭐ anon não encosta em lineup.slots');
  end;

  reset role;
end $$;

do $$
declare
  v_reg int; v_upd int;
begin
  reset role;
  select count(*) into v_reg from core.event_outbox where event_type = 'lineup.slot.registered';
  select count(*) into v_upd from core.event_outbox where event_type = 'lineup.slot.updated';
  perform pg_temp.assert100(v_reg >= 1, 'o fato lineup.slot.registered saiu no correio ao criar');
  perform pg_temp.assert100(v_upd >= 1, 'o fato lineup.slot.updated saiu no correio ao editar');
end $$;

\echo ''
\echo '=== MÓDULO 95 OK: grade isolada, autor do servidor, agenda plano (edita e apaga), evento congela ==='
