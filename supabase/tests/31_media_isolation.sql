-- =============================================================================
-- O MÓDULO 26 NO BANCO — o catálogo que diz onde a obra vive, o acervo que
-- volta do arquivo e o livro de uso que não se rasura
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o acervo de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta registra uso, mas NÃO cataloga;
--   2. ⭐ **a obra entra no acervo** (não nasce guardada) e **o catálogo
--      exige o onde-vive** — contra as constraints reais;
--   3. ⭐ **a etiqueta é dado do tenant** (única no ativo, N:N sem dobro) e
--      tem a ÚNICA porta de DELETE — desfazer etiqueta não apaga história;
--   4. ⭐ **o uso é ato carimbado pelo servidor** (o used_by mandado é
--      descartado), recusado fora do acervo, e ETERNO — nem o dono rasura;
--   5. ⭐ **a obra VOLTA do arquivo** (o DIVERGE assinado do pat) com o
--      livro INTEIRO — e volta a receber uso;
--   6. apagar obra não existe; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert31(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Biblioteca de Mídia nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'media', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'media', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) cuida do catálogo E do livro;
-- `user-b` (Beta) só escreve no livro — não cataloga.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'media.usage.record', 'media'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'media.asset.manage', 'media'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois escrevem no livro; só o Alfa cataloga.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A MÃO QUE NÃO CATALOGA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: entra no acervo com o onde-vive; o Beta não cataloga; cada um na sua prateleira ==='

do $$
declare
  v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into media.assets (tenant_id, title, location, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasceu guardada', 'drive', 'archived');
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: nasceu guardada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert31(v_erro like '%entra no acervo%', 'a obra entra no acervo — guardar é ato posterior');
  end;

  -- Catálogo sem endereço não cataloga nada.
  begin
    insert into media.assets (tenant_id, title, location)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Obra sem morada', '   ');
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: obra sem morada');
  exception when check_violation then
    perform pg_temp.assert31(true, '⭐ o onde-vive é obrigatório — catálogo aponta, não finge');
  end;

  insert into media.assets (tenant_id, title, asset_type, location) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Logo dourado', 'vetor', 'drive da agência / pasta marca'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ensaio da fachada', '', 'HD externo da sala 2');
  perform pg_temp.assert31(true, 'duas obras no acervo — o tipo vazio é permitido e honesto');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  begin
    insert into media.assets (tenant_id, title, location)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Tentativa do leitor', 'drive');
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: o Beta catalogou');
  exception when insufficient_privilege then
    perform pg_temp.assert31(true, '⭐ catalogar é mão própria (media.asset.manage)');
  end;

  select count(*) into v_n from media.assets;
  perform pg_temp.assert31(v_n = 0, 'o Beta enxerga só a prateleira dele — e a dele está vazia');
end $$;

-- =============================================================================
-- CENÁRIO 2 — AS ETIQUETAS: dado do tenant, N:N, e a única porta de DELETE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: etiqueta única, vínculo sem dobro, desfazer não apaga história ==='

do $$
declare
  v_obra uuid; v_tag uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_obra from media.assets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Logo dourado';

  insert into media.tags (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'marca')
  returning id into v_tag;

  begin
    insert into media.tags (tenant_id, name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  MARCA ');
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: etiqueta em dobro');
  exception when unique_violation then
    perform pg_temp.assert31(true, 'etiqueta não duplica no tenant — maiúscula não disfarça');
  end;

  insert into media.asset_tags (tenant_id, asset_id, tag_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_obra, v_tag);

  begin
    insert into media.asset_tags (tenant_id, asset_id, tag_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_obra, v_tag);
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: o mesmo vínculo duas vezes');
  exception when unique_violation then
    perform pg_temp.assert31(true, 'a classificação não se repete');
  end;

  -- ⭐ A ÚNICA porta de DELETE: apagar a etiqueta desfaz a classificação
  -- em cascata — metadado vivo, nenhuma história apagada.
  delete from media.tags where id = v_tag;
  select count(*) into v_n from media.asset_tags where asset_id = v_obra;
  perform pg_temp.assert31(v_n = 0, '⭐ etiqueta é metadado vivo: sai, e leva só a classificação');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O LIVRO DE USO: carimbo do servidor, eterno
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o used_by mandado é descartado; o livro não se rasura ==='

do $$
declare
  v_obra uuid; v_who uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_obra from media.assets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Logo dourado';

  -- ⭐ Mandando o used_by do OUTRO: o gatilho descarta e assina o próprio.
  insert into media.usages (tenant_id, asset_id, used_in, used_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_obra, 'campanha de inauguração',
          '22222222-2222-4222-8222-222222222222');

  select used_by into v_who from media.usages where asset_id = v_obra;
  perform pg_temp.assert31(
    v_who = '11111111-1111-4111-8111-111111111111',
    '⭐ o uso é assinado pelo servidor — o used_by mandado foi descartado');

  -- O cliente não rasura (nem tem grant).
  begin
    update media.usages set used_in = 'outra campanha' where asset_id = v_obra;
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: o cliente rasurou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert31(true, 'o cliente não rasura o livro');
  end;

  reset role;
  begin
    delete from media.usages where asset_id = v_obra;
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: apagou o livro como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert31(v_erro like '%fato consumado%', '⭐ o livro não se apaga nem como dono do banco');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'media.usage.recorded';
  perform pg_temp.assert31(v_n = 1, 'media.usage.recorded saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ A OBRA VOLTA DO ARQUIVO — o DIVERGE do pat, com o livro inteiro
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: guardada recusa uso novo; devolvida, é a MESMA obra — e o livro está inteiro ==='

do $$
declare
  v_obra uuid; v_erro text; v_n int; v_payload jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_obra from media.assets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Logo dourado';

  update media.assets set status = 'archived' where id = v_obra;

  -- ⭐ Fora do acervo não se usa.
  begin
    insert into media.usages (tenant_id, asset_id, used_in)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_obra, 'campanha retrô');
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: uso em obra guardada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert31(v_erro like '%devolva%', '⭐ fora do acervo não se usa — a recusa aponta o caminho');
  end;

  -- ⭐ E VOLTA — a MESMA obra (o DIVERGE do pat: lá, a baixa é terminal).
  update media.assets set status = 'active' where id = v_obra;
  select count(*) into v_n from media.usages where asset_id = v_obra;
  perform pg_temp.assert31(v_n = 1, '⭐ a obra voltou com o livro INTEIRO — renascer partiria a história');

  insert into media.usages (tenant_id, asset_id, used_in, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_obra, 'campanha retrô', 'a volta do dourado');
  perform pg_temp.assert31(true, 'devolvida ao acervo, volta a ser usada');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'media.asset.restored';
  perform pg_temp.assert31(v_n = 1, 'media.asset.restored saiu uma vez');

  -- O envelope do uso leva o TÍTULO carimbado — autossuficiente.
  select payload into v_payload from core.event_outbox
   where event_type = 'media.usage.recorded'
     and payload->>'usedIn' = 'campanha retrô';
  perform pg_temp.assert31(
    v_payload is not null and v_payload->>'assetTitle' = 'Logo dourado',
    'o envelope do uso é autossuficiente — o título vai carimbado');
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR OBRA NÃO EXISTE; A CANETA NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar obra não existe; emit_event não é concedida ==='

do $$
declare
  v_obra uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_obra from media.assets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from media.assets where id = v_obra;
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: apagou obra');
  exception when insufficient_privilege then
    perform pg_temp.assert31(true, 'apagar obra não existe — guardar é status, e o livro fica');
  end;

  begin
    perform media.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'media.asset.cataloged', '{}'::jsonb);
    perform pg_temp.assert31(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert31(true, 'media.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 26 OK: catálogo honesto, etiqueta viva, livro eterno, a obra que volta, tenants isolados ==='
