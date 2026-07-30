-- =============================================================================
-- O MÓDULO 19 NO BANCO — a prancheta congelada na abertura, a resposta-ato
-- e a conclusão que exige tudo respondido
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os modelos e execuções de um tenant não aparecem no outro — e a
--      assimetria user-a × user-b: o Beta DESENHA mas não EXECUTA;
--   2. ⭐ **a prancheta congela POR CÓPIA na abertura**: editar o modelo
--      depois NÃO reescreve a inspeção — provado editando de verdade;
--   3. ⭐ **a resposta é ato**: carimbo do servidor, uma vez — rasurar é
--      recusado pelo gatilho real; o texto do item idem;
--   4. ⭐ **concluir exige tudo respondido** (o gatilho conta) e os fins
--      são terminais; abandonar exige razão;
--   5. o cliente NÃO escreve a prancheta (sem grant de INSERT) e ninguém a
--      apaga; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert24(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Checklists nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'chk', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'chk', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) desenha E executa;
-- `user-b` (Beta) só DESENHA — quem desenha a inspeção não é quem a executa.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'chk.setup.manage', 'chk'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'chk.run.execute', 'chk'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois desenham; só o Alfa executa.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A MÃO QUE NÃO EXECUTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com os seus modelos; o Beta desenha mas não executa ==='

do $$
declare
  v_tpl uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into chk.templates (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Abertura da loja')
  returning id into v_tpl;

  insert into chk.template_items (tenant_id, template_id, position, item_text) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_tpl, 0, 'Portas destravadas'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_tpl, 1, 'Caixa conferido'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_tpl, 2, 'Luzes da vitrine acesas');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into chk.templates (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Ronda noturna')
  returning id into v_tpl;
  insert into chk.template_items (tenant_id, template_id, position, item_text)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_tpl, 0, 'Portões trancados');

  select count(*) into v_n from chk.templates;
  perform pg_temp.assert24(v_n = 1, 'o Beta enxerga só os modelos dele');

  begin
    insert into chk.runs (tenant_id, template_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_tpl);
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: o Beta executou sem chk.run.execute');
  exception when insufficient_privilege then
    perform pg_temp.assert24(true, '⭐ quem desenha não executa — a mão da inspeção é própria');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A PRANCHETA CONGELA NA ABERTURA, POR CÓPIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: editar o modelo depois NÃO reescreve a inspeção aberta ==='

do $$
declare
  v_tpl uuid; v_run uuid; v_run2 uuid; v_n int; v_texto text; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_tpl from chk.templates
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Abertura da loja';

  insert into chk.runs (tenant_id, template_id, subject)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_tpl, 'loja 3')
  returning id into v_run;

  select count(*) into v_n from chk.run_items where run_id = v_run;
  perform pg_temp.assert24(v_n = 3, '⭐ a prancheta nasceu copiada — 3 itens, pelo gatilho');

  -- Agora o REDESENHO: renomeia um item, arquiva outro, acrescenta um quarto.
  update chk.template_items set item_text = 'Portas E janelas destravadas'
   where template_id = v_tpl and position = 0;
  update chk.template_items set status = 'archived'
   where template_id = v_tpl and position = 2;
  insert into chk.template_items (tenant_id, template_id, position, item_text)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_tpl, 3, 'Ar-condicionado ligado');

  select item_text into v_texto from chk.run_items where run_id = v_run and position = 0;
  perform pg_temp.assert24(
    v_texto = 'Portas destravadas',
    '⭐ a inspeção aberta não mudou — o congelo é por CÓPIA, não por referência');
  select count(*) into v_n from chk.run_items where run_id = v_run;
  perform pg_temp.assert24(v_n = 3, 'o item novo do modelo não entrou na inspeção aberta');

  -- A PRÓXIMA execução vê o desenho novo: 3 ativos (0 renomeado, 1, 3).
  insert into chk.runs (tenant_id, template_id, subject)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_tpl, 'loja 4')
  returning id into v_run2;
  select count(*) into v_n from chk.run_items where run_id = v_run2;
  perform pg_temp.assert24(v_n = 3, 'a execução nova nasce do desenho novo (sem o arquivado, com o acrescido)');
  select item_text into v_texto from chk.run_items where run_id = v_run2 and position = 0;
  perform pg_temp.assert24(v_texto = 'Portas E janelas destravadas', 'a execução nova carimba o texto novo');

  -- Modelo arquivado não abre execução.
  update chk.templates set status = 'archived' where id = v_tpl;
  begin
    insert into chk.runs (tenant_id, template_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_tpl);
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: abriu execução de modelo fora de vigor');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert24(v_erro like '%arquivado%', 'modelo arquivado não abre execução');
  end;
  update chk.templates set status = 'active' where id = v_tpl;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A RESPOSTA É ATO; CONCLUIR EXIGE TUDO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: resposta carimbada uma vez; checklist pela metade não conclui ==='

do $$
declare
  v_run uuid; v_item uuid; v_by uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_run from chk.runs
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and subject = 'loja 3';

  select id into v_item from chk.run_items where run_id = v_run and position = 0;
  update chk.run_items set answer = 'ok' where id = v_item;

  select answered_by into v_by from chk.run_items where id = v_item;
  perform pg_temp.assert24(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ a resposta carimbou QUEM — pelo servidor');

  begin
    update chk.run_items set answer = 'not_ok' where id = v_item;
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: rasurou resposta');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert24(v_erro like '%não se rasura%', '⭐ resposta dada não se rasura');
  end;

  begin
    update chk.run_items set item_text = 'Outro texto' where id = v_item;
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: reescreveu a prancheta');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert24(v_erro like '%não se reescreve%', 'a prancheta congelada não se reescreve');
  end;

  begin
    update chk.runs set status = 'completed' where id = v_run;
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: concluiu com itens pendentes');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert24(v_erro like '%pela metade%', '⭐ concluir exige tudo respondido — o gatilho conta');
  end;

  update chk.run_items set answer = 'not_ok', note = 'gaveta travada'
   where run_id = v_run and position = 1;
  update chk.run_items set answer = 'not_applicable'
   where run_id = v_run and position = 2;

  update chk.runs set status = 'completed' where id = v_run;
  select completed_by into v_by from chk.runs where id = v_run;
  perform pg_temp.assert24(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ a conclusão carimbou QUEM — pelo servidor');

  -- Terminal: não volta, não responde, não edita.
  begin
    update chk.runs set status = 'in_progress' where id = v_run;
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: reabriu execução concluída');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert24(v_erro like '%terminal%', '⭐ o fim é terminal — quem volta abre execução nova');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'chk.run.completed';
  perform pg_temp.assert24(v_n = 1, 'chk.run.completed saiu uma vez, com as contagens dentro');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ABANDONAR EXIGE A RAZÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: a interrompida também é história — com razão escrita ==='

do $$
declare
  v_run uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_run from chk.runs
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and subject = 'loja 4';

  begin
    update chk.runs set status = 'abandoned' where id = v_run;
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: abandonou sem escrever o porquê');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert24(v_erro like '%razão%', 'abandonar exige a razão escrita');
  end;

  update chk.runs set status = 'abandoned', abandon_reason = 'faltou luz na loja'
   where id = v_run;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'chk.run.abandoned';
  perform pg_temp.assert24(v_n = 1, 'chk.run.abandoned saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 5 — A PRANCHETA NÃO É DO CLIENTE; A CANETA TAMPOUCO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o cliente não escreve a prancheta; ninguém a apaga ==='

do $$
declare
  v_run uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_run from chk.runs
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    insert into chk.run_items (tenant_id, run_id, position, item_text)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_run, 99, 'Item forjado');
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: cliente escreveu na prancheta');
  exception when insufficient_privilege then
    perform pg_temp.assert24(true, 'a prancheta é do gatilho — o cliente não insere nela');
  end;

  begin
    perform chk.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'chk.run.started', '{}'::jsonb);
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert24(true, 'chk.emit_event não é concedida ao cliente');
  end;

  reset role;
  begin
    delete from chk.run_items where run_id = v_run;
    perform pg_temp.assert24(false, 'DEVERIA TER FALHADO: apagou a prancheta como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert24(v_erro like '%não se apaga%', '⭐ a prancheta não se apaga nem como dono do banco');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 19 OK: prancheta congelada por cópia, resposta-ato, conclusão inteira, tenants isolados ==='
