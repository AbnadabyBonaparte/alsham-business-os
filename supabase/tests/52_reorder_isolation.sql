-- =============================================================================
-- O MÓDULO 47 NO BANCO — a configuração de estoque mínimo que se isola, a regra
-- que volta do arquivo (com permissão própria), o autor carimbado pelo servidor
-- e o CHECK que recusa mínimo negativo
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as regras de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta CADASTRA mas não ARQUIVA;
--   2. ⭐ **active ↔ archived** — a regra VOLTA do arquivo (o DIVERGE do hr);
--   3. ⭐ **arquivar/reativar exige reorder.rule.decide** — o Beta é barrado;
--   4. ⭐ **o autor é carimbado pelo servidor** — o created_by mentido é descartado;
--   5. ⭐ **o CHECK recusa minimum_quantity negativa** — o mínimo não vira dívida;
--   6. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta na tabela. Cross-tenant também é barrado.
--
-- ⭐⭐ Note o que este teste NÃO faz: não toca no `inv`. A comparação com o
-- saldo é da tela — aqui só a CONFIGURAÇÃO se prova.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert52(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: reorder instalado; Alfa decide, Beta só cadastra ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'reorder', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'reorder', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'reorder.rule.manage', 'reorder'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ ASSIMETRIA: só o Alfa arquiva/reativa. O Beta cadastra e edita, não decide.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'reorder.rule.decide', 'reorder'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cadastram; só o Alfa arquiva/reativa.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ATIVO, O AUTOR CARIMBADO E O CHECK
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu cadastro; nasce ativa; autor do servidor; mínimo >= 0 ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT: diz que foi o Beta. O gatilho descarta.
  insert into reorder.rules (tenant_id, product, inv_item_id, inv_item_name, minimum_quantity, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Parafuso 8mm',
          '99999999-9999-4999-8999-999999999999', 'Parafuso sextavado 8mm', 5,
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert52(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  begin
    insert into reorder.rules (tenant_id, product, minimum_quantity, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errada', 5, 'archived');
    perform pg_temp.assert52(false, 'DEVERIA TER FALHADO: nasceu arquivada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert52(v_erro like '%nasce ativa%', 'a regra nasce ativa');
  end;

  -- ⭐ O CHECK da coluna recusa mínimo negativo — o ponto de pedido não vira dívida.
  begin
    insert into reorder.rules (tenant_id, product, minimum_quantity)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Mínimo Negativo', -1);
    perform pg_temp.assert52(false, 'DEVERIA TER FALHADO: minimum_quantity negativa');
  exception when check_violation then
    perform pg_temp.assert52(true, '⭐ o CHECK recusa minimum_quantity < 0');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into reorder.rules (tenant_id, product, minimum_quantity)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Caixa de papel B', 10);

  select count(*) into v_n from reorder.rules;
  perform pg_temp.assert52(v_n = 1, 'o Beta enxerga só o cadastro dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ active ↔ archived: A REGRA VOLTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: arquivar e reativar — o mesmo registro (o DIVERGE do hr) ==='

do $$
declare
  v_id uuid; v_status text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from reorder.rules
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and product = 'Parafuso 8mm';

  update reorder.rules set status = 'archived' where id = v_id;
  select status into v_status from reorder.rules where id = v_id;
  perform pg_temp.assert52(v_status = 'archived', 'arquivou');

  update reorder.rules set status = 'active' where id = v_id;
  select status into v_status from reorder.rules where id = v_id;
  perform pg_temp.assert52(v_status = 'active', '⭐ a regra VOLTA do arquivo — a mesma configuração');

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type in ('reorder.rule.archived','reorder.rule.reopened');
  perform pg_temp.assert52(v_n = 2, 'os fatos de arquivar e reativar saíram');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ ARQUIVAR/REATIVAR EXIGE reorder.rule.decide: O BETA É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o Beta cadastra e edita, mas não arquiva ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from reorder.rules
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and product = 'Caixa de papel B';

  -- Editar dados o Beta consegue (manage). A quantidade mínima é campo de domínio.
  update reorder.rules set minimum_quantity = 20 where id = v_id;
  perform pg_temp.assert52(true, 'o Beta edita — manage basta; ajusta a quantidade mínima');

  begin
    update reorder.rules set status = 'archived' where id = v_id;
    perform pg_temp.assert52(false, 'DEVERIA TER FALHADO: o Beta arquivou sem decide');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert52(v_erro like '%reorder.rule.decide%', '⭐ arquivar exige reorder.rule.decide');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO CADASTRO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
declare
  v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into reorder.rules (tenant_id, product, minimum_quantity)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasora', 1);
    perform pg_temp.assert52(false, 'DEVERIA TER FALHADO: o Alfa escreveu no cadastro do Beta');
  exception when others then
    perform pg_temp.assert52(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from reorder.rules limit 1;

  begin
    delete from reorder.rules where id = v_id;
    perform pg_temp.assert52(false, 'DEVERIA TER FALHADO: apagou regra');
  exception when insufficient_privilege then
    perform pg_temp.assert52(true, 'apagar não existe — arquivar é status');
  end;

  begin
    perform reorder.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'reorder.rule.registered', '{}'::jsonb);
    perform pg_temp.assert52(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert52(true, 'reorder.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from reorder.rules limit 1;
    perform pg_temp.assert52(false, 'DEVERIA TER FALHADO: anon leu reorder.rules');
  exception when insufficient_privilege then
    perform pg_temp.assert52(true, '⭐ anon não encosta em reorder.rules');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 47 OK: config isolada, regra que volta, autor do servidor, mínimo >= 0, anon fora ==='
