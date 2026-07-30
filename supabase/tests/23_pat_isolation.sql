-- =============================================================================
-- O MÓDULO 18 NO BANCO — a vigente calculada, o "de onde" do servidor e a
-- baixa terminal
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os bens e as categorias de um tenant não aparecem no outro — e a
--      etiqueta é única DENTRO do tenant, não entre tenants;
--   2. ⭐ **a baixa exige razão e permissão própria** (assimetria
--      user-a × user-b), com carimbo do servidor — e é TERMINAL: nem volta,
--      nem edita, contra o gatilho real;
--   3. ⭐ **o "de onde" da transferência é do SERVIDOR** — o que o cliente
--      digitar é descartado; a vigente sai da view calculada, sob RLS;
--   4. bem baixado não se transfere;
--   5. o livro de transferências é imutável até para o dono do banco;
--   6. aquisição não mora no futuro (constraint); apagar não existe; a
--      caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert23(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Patrimônio nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pat', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pat', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as TRÊS permissões;
-- `user-b` (Beta) cadastra e move — mas NÃO baixa.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'pat'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('pat.asset.manage'), ('pat.setup.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'pat.asset.decide', 'pat'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cadastram e movem; só o Alfa baixa.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, ETIQUETA ÚNICA E O FUTURO RECUSADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu livro; a etiqueta não repete; aquisição sem futuro ==='

do $$
declare
  v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into pat.categories (tenant_id, name) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'máquina');

  insert into pat.assets (tenant_id, name, code, original_location)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Empilhadeira 03', 'ETQ-0031', 'galpão 1');

  begin
    insert into pat.assets (tenant_id, name, code, original_location)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Outra', 'etq-0031', 'galpão 2');
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: etiqueta repetida no tenant');
  exception when unique_violation then
    perform pg_temp.assert23(true, '⭐ a etiqueta é única por tenant — até mudando a caixa');
  end;

  begin
    insert into pat.assets (tenant_id, name, code, original_location, acquired_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Do futuro', 'ETQ-9999', 'x', current_date + 1);
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: aquisição no futuro');
  exception when check_violation then
    perform pg_temp.assert23(true, '⭐ aquisição é fato consumado — não mora no futuro');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- A MESMA etiqueta em OUTRO tenant é legítima: o livro é de cada casa.
  insert into pat.assets (tenant_id, name, code, original_location)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Betoneira', 'ETQ-0031', 'obra 2');

  select count(*) into v_n from pat.assets;
  perform pg_temp.assert23(v_n = 1, 'o Beta enxerga só os bens dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O "DE ONDE" É DO SERVIDOR; A VIGENTE É CALCULADA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o cliente diz só PARA ONDE; a view diz onde o bem está ==='

do $$
declare
  v_id uuid; v_from text; v_atual text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from pat.assets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and code = 'ETQ-0031';

  -- O cliente tenta MENTIR o "de onde": o gatilho descarta e carimba a vigente.
  insert into pat.transfers (tenant_id, asset_id, from_location, to_location)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'MENTIRA', 'obra da av. central');

  select from_location into v_from from pat.transfers
   where asset_id = v_id order by seq desc limit 1;
  perform pg_temp.assert23(
    v_from = 'galpão 1',
    '⭐ o "de onde" veio do servidor — a mentira do formulário foi descartada');

  -- Segundo ato: a vigente agora é o destino do primeiro.
  insert into pat.transfers (tenant_id, asset_id, to_location)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'galpão 2');

  select from_location into v_from from pat.transfers
   where asset_id = v_id order by seq desc limit 1;
  perform pg_temp.assert23(v_from = 'obra da av. central', 'o segundo ato saiu de onde o primeiro chegou');

  select current_location into v_atual from pat.asset_locations where asset_id = v_id;
  perform pg_temp.assert23(v_atual = 'galpão 2', '⭐ a vigente é o último ato — calculada, nunca coluna');

  -- E a fila é só do tenant que lê.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from pat.asset_locations
   where current_location = 'galpão 2';
  perform pg_temp.assert23(v_n = 0, 'o Beta não vê o livro do Alfa — RLS dentro da view');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'pat.asset.transferred';
  perform pg_temp.assert23(v_n = 2, 'pat.asset.transferred saiu duas vezes');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A BAIXA: RAZÃO, PERMISSÃO, CARIMBO — E TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: sem razão não baixa; o Beta não baixa; baixado congela ==='

do $$
declare
  v_id uuid; v_beta uuid; v_erro text; v_by uuid; v_n int;
begin
  set local role authenticated;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_beta from pat.assets
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  begin
    update pat.assets set status = 'written_off', write_off_reason = 'sucata' where id = v_beta;
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: baixou sem decide');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert23(
      v_erro like '%pat.asset.decide%',
      '⭐ sem decide não se baixa — com o nome da permissão no erro');
  end;

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id from pat.assets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and code = 'ETQ-0031';

  begin
    update pat.assets set status = 'written_off' where id = v_id;
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: baixou sem escrever o porquê');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert23(v_erro like '%razão%', '⭐ a baixa exige a razão escrita');
  end;

  update pat.assets
     set status = 'written_off', write_off_reason = 'vendida no leilão de julho'
   where id = v_id;

  select written_off_by into v_by from pat.assets where id = v_id;
  perform pg_temp.assert23(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ a baixa carimbou QUEM — pelo servidor');

  -- ⭐ Terminal: não volta.
  begin
    update pat.assets set status = 'active' where id = v_id;
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: a baixa voltou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert23(v_erro like '%aquisição nova%', '⭐ a baixa é terminal — o que volta é aquisição nova');
  end;

  -- ⭐ Congelado: nem o nome se edita.
  begin
    update pat.assets set name = 'Outro nome' where id = v_id;
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: editou bem baixado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert23(v_erro like '%não se edita%', 'bem baixado congela inteiro');
  end;

  -- ⭐ E não se transfere.
  begin
    insert into pat.transfers (tenant_id, asset_id, to_location)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'qualquer lugar');
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: transferiu bem fora do livro');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert23(v_erro like '%baixado%', 'bem baixado não se transfere');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'pat.asset.retired';
  perform pg_temp.assert23(v_n = 1, 'pat.asset.retired saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 4 — O LIVRO DO LUGAR É ETERNO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: ninguém edita nem apaga o livro de transferências ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from pat.transfers limit 1;

  begin
    update pat.transfers set to_location = 'rasura' where id = v_id;
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: editou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert23(true, 'o cliente não edita o livro — sem grant, sem policy');
  end;

  reset role;
  begin
    delete from pat.transfers where id = v_id;
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: apagou o livro como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert23(v_erro like '%fato consumado%', '⭐ o livro não se apaga nem como dono do banco');
  end;
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
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from pat.assets
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  begin
    delete from pat.assets where id = v_id;
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: apagou bem');
  exception when insufficient_privilege then
    perform pg_temp.assert23(true, 'apagar bem não existe — baixar é status');
  end;

  begin
    perform pat.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pat.asset.registered', '{}'::jsonb);
    perform pg_temp.assert23(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert23(true, 'pat.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 18 OK: vigente calculada, "de onde" do servidor, baixa terminal, tenants isolados ==='
