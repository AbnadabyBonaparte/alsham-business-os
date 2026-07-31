-- =============================================================================
-- O MÓDULO 55 NO BANCO — o quadro Kanban do projeto que se isola, nasce com o
-- autor carimbado pelo servidor, e cujo cartão anda LIVRE entre as colunas
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. colunas e cartões de um tenant não aparecem no outro;
--   2. ⭐ **o autor é carimbado pelo servidor** (o mentido no INSERT é descartado);
--   3. ⭐ **o cartão anda LIVRE entre as colunas** — UPDATE simples do stage_id,
--      sem porteiro (a liberdade do `ops`), e o fato `kanban.card.moved` sai;
--   4. ⭐ **as regras de apagar** (a física do `ops`): a coluna com cartão em
--      cima NÃO se apaga (FK restrict); a coluna vazia sim; o cartão NÃO tem
--      porta de DELETE — ele anda, não some;
--   5. cross-tenant é barrado; a caneta de emitir evento não é do cliente; o
--      `anon` não encosta na tabela.
--
-- Dado 100% fabricado. Zero nome de cliente. O `project_id` é solto e fabricado
-- (nenhum join com o schema Projetos). Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert60(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: kanban instalado nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'kanban', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'kanban', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'kanban.board.manage', 'kanban'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO E O AUTOR CARIMBADO PELO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu quadro; autor do servidor ==='

do $$
declare
  v_todo uuid; v_doing uuid; v_card uuid; v_by uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Duas colunas do quadro do projeto fabricado.
  insert into kanban.stages (tenant_id, project_id, project_name, name, position, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'Obra da sede', 'A Fazer', 0, '22222222-2222-4222-8222-222222222222')  -- autor mentido
  returning id, created_by into v_todo, v_by;

  perform pg_temp.assert60(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by da coluna é quem está autenticado — o autor mentido foi descartado');

  insert into kanban.stages (tenant_id, project_id, project_name, name, position)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'Obra da sede', 'Fazendo', 1)
  returning id into v_doing;

  -- Um cartão na primeira coluna, com autor mentido.
  insert into kanban.cards (tenant_id, project_id, project_name, stage_id, title, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'Obra da sede', v_todo, 'Comprar cimento', '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_card, v_by;

  perform pg_temp.assert60(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by do cartão é quem está autenticado');

  -- Beta cria o quadro dele.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into kanban.stages (tenant_id, project_id, project_name, name, position)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'Projeto do Beta', 'Backlog', 0);

  select count(*) into v_n from kanban.stages;
  perform pg_temp.assert60(v_n = 1, 'o Beta enxerga só a coluna dele');
  select count(*) into v_n from kanban.cards;
  perform pg_temp.assert60(v_n = 0, 'o Beta não enxerga cartão nenhum do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O CARTÃO ANDA LIVRE (UPDATE SIMPLES, SEM PORTEIRO)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: mover o cartão é UPDATE do stage_id; o fato card.moved sai ==='

do $$
declare
  v_todo uuid; v_doing uuid; v_card uuid; v_stage uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_todo  from kanban.stages where name = 'A Fazer';
  select id into v_doing from kanban.stages where name = 'Fazendo';
  select id into v_card  from kanban.cards  where title = 'Comprar cimento';

  -- Mover: nenhum gate, nenhuma aprovação. Só trocar a coluna.
  update kanban.cards set stage_id = v_doing where id = v_card;
  select stage_id into v_stage from kanban.cards where id = v_card;
  perform pg_temp.assert60(v_stage = v_doing, '⭐ o cartão andou para "Fazendo" por UPDATE simples');

  -- E pode voltar — livre nos dois sentidos (a liberdade do ops).
  update kanban.cards set stage_id = v_todo where id = v_card;
  select stage_id into v_stage from kanban.cards where id = v_card;
  perform pg_temp.assert60(v_stage = v_todo, '⭐ o cartão voltou para "A Fazer" — movimento livre nos dois sentidos');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'kanban.card.moved';
  perform pg_temp.assert60(v_n = 2, 'os dois fatos de movimento saíram (ida e volta)');

  select count(*) into v_n from core.event_outbox where event_type = 'kanban.card.registered';
  perform pg_temp.assert60(v_n = 1, 'o fato do nascimento do cartão saiu uma vez');
  select count(*) into v_n from core.event_outbox where event_type = 'kanban.stage.registered';
  perform pg_temp.assert60(v_n = 3, 'os fatos de nascimento das colunas saíram (2 Alfa + 1 Beta)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — CROSS-TENANT: O ALFA NÃO ESCREVE NO QUADRO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  begin
    insert into kanban.stages (tenant_id, project_id, name, position)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Invasora', 9);
    perform pg_temp.assert60(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert60(true, '⭐ cross-tenant barrado: o Alfa não escreve no quadro do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ AS REGRAS DE APAGAR (a física do `ops`)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: coluna ocupada não se apaga; vazia sim; o cartão não tem DELETE ==='

do $$
declare
  v_todo uuid; v_doing uuid; v_card uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_todo  from kanban.stages where name = 'A Fazer';
  select id into v_doing from kanban.stages where name = 'Fazendo';
  select id into v_card  from kanban.cards  where title = 'Comprar cimento';

  -- O cartão está em "A Fazer" (voltou no cenário 2). Apagar essa coluna é barrado.
  begin
    delete from kanban.stages where id = v_todo;
    perform pg_temp.assert60(false, 'DEVERIA TER FALHADO: apagou coluna com cartão em cima');
  exception when foreign_key_violation then
    perform pg_temp.assert60(true, '⭐ coluna ocupada não se apaga (FK restrict) — recusa clara');
  end;

  -- A coluna "Fazendo" está vazia: apagar é permitido (desenhar é tentativa e erro).
  delete from kanban.stages where id = v_doing;
  perform pg_temp.assert60(
    not exists (select 1 from kanban.stages where id = v_doing),
    '⭐ a coluna VAZIA se apaga — desenhar o quadro é tentativa e erro');

  -- ⛔ O cartão não tem porta de DELETE: ele anda, não some.
  begin
    delete from kanban.cards where id = v_card;
    perform pg_temp.assert60(false, 'DEVERIA TER FALHADO: apagou cartão');
  exception when insufficient_privilege then
    perform pg_temp.assert60(true, '⛔ o cartão não se apaga — ele anda entre colunas (a física da OS do ops)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: emit_event não é concedida; anon barrado ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform kanban.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'kanban.card.moved', '{}'::jsonb);
    perform pg_temp.assert60(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert60(true, 'kanban.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from kanban.stages limit 1;
    perform pg_temp.assert60(false, 'DEVERIA TER FALHADO: anon leu kanban.stages');
  exception when insufficient_privilege then
    perform pg_temp.assert60(true, '⭐ anon não encosta em kanban.stages');
  end;
  begin
    perform 1 from kanban.cards limit 1;
    perform pg_temp.assert60(false, 'DEVERIA TER FALHADO: anon leu kanban.cards');
  exception when insufficient_privilege then
    perform pg_temp.assert60(true, '⭐ anon não encosta em kanban.cards');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 55 OK: quadro isolado, autor do servidor, cartão que anda livre, anon fora ==='
