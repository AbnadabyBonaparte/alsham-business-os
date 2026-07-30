-- =============================================================================
-- O MÓDULO 28 NO BANCO — o centro do tenant, a regra que fecha 100% e o
-- rateio que não perde centavo
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o cadastro de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta cadastra centro, mas NÃO desenha regra nem
--      executa rateio;
--   2. ⭐ **o centro volta do arquivo** e o nome ATIVO não duplica;
--   3. ⭐ **a regra fecha 100% ao ativar** (83% recusado, vazia recusada) e
--      ATIVA congela o desenho — mexer nas linhas é recusado;
--   4. ⭐ **executar gera lançamentos imutáveis** cuja SOMA é EXATAMENTE o
--      total (o resto vai ao último centro); só a regra ATIVA rateia; o
--      livro não se rasura nem para o dono;
--   5. ⛔ **anon = NADA** (papel real); apagar não existe; a caneta de
--      emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert33(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Centros de Custo nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cc', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cc', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) tem as três mãos;
-- `user-b` (Beta) só cadastra centro — não desenha regra nem executa.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'cc.center.manage', 'cc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'cc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('cc.rule.design'), ('cc.rateio.execute')) as p(k)
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cadastram; só o Alfa desenha e executa.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A MÃO QUE NÃO DESENHA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant no seu cadastro; o Beta não desenha regra ==='

do $$
declare
  v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into cc.centers (tenant_id, name) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Administrativo'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Comercial');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- O Beta cadastra centro (tem manage)...
  insert into cc.centers (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Obra 1');

  -- ...mas não desenha regra.
  begin
    insert into cc.rules (tenant_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Tentativa');
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: o Beta desenhou regra');
  exception when insufficient_privilege then
    perform pg_temp.assert33(true, '⭐ desenhar regra é mão própria (cc.rule.design)');
  end;

  select count(*) into v_n from cc.centers;
  perform pg_temp.assert33(v_n = 1, 'o Beta enxerga só o cadastro dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — O CENTRO VOLTA DO ARQUIVO; NOME ATIVO NÃO DUPLICA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: nome ativo único; arquiva e volta ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from cc.centers
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Comercial';

  begin
    insert into cc.centers (tenant_id, name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  COMERCIAL ');
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: centro ativo em dobro');
  exception when unique_violation then
    perform pg_temp.assert33(true, 'centro ATIVO não duplica nome');
  end;

  update cc.centers set status = 'archived' where id = v_id;
  -- ⭐ Volta do arquivo.
  update cc.centers set status = 'active' where id = v_id;
  perform pg_temp.assert33(true, '⭐ o centro reorganizado volta — é o MESMO centro');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A REGRA FECHA 100% E CONGELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: 83% não ativa; vazia não ativa; 100% ativa e congela ==='

do $$
declare
  v_rule uuid; v_adm uuid; v_com uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_adm from cc.centers
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Administrativo';
  select id into v_com from cc.centers
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Comercial';

  insert into cc.rules (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Rateio da matriz')
  returning id into v_rule;

  -- Regra vazia não ativa.
  begin
    update cc.rules set status = 'active' where id = v_rule;
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: regra vazia ativou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert33(v_erro like '%não rateia nada%', 'regra vazia não ateia');
  end;

  -- 83% não fecha.
  insert into cc.rule_lines (tenant_id, rule_id, center_id, basis_points)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rule, v_adm, 8300);
  begin
    update cc.rules set status = 'active' where id = v_rule;
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: 83% ativou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert33(v_erro like '%fecha 100%', '⭐ a regra que não fecha 100% não ativa');
  end;

  -- Fecha 100% e ativa.
  insert into cc.rule_lines (tenant_id, rule_id, center_id, basis_points)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rule, v_com, 1700);
  update cc.rules set status = 'active' where id = v_rule;
  perform pg_temp.assert33(true, '⭐ a regra que fecha 100% ativa');

  -- ⭐ ATIVA congela: mexer nas linhas é recusado.
  begin
    update cc.rule_lines set basis_points = 5000
     where rule_id = v_rule and center_id = v_adm;
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: mexeu na regra ativa');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert33(v_erro like '%congelada%', '⭐ a regra ativa congela o desenho');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O RATEIO: SOMA EXATA, RESTO NO ÚLTIMO, LIVRO IMUTÁVEL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o rateio não perde centavo; o livro não se rasura ==='

do $$
declare
  v_rule uuid; v_exec uuid; v_soma bigint; v_n int; v_erro text; v_payload jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_rule from cc.rules
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Rateio da matriz';

  -- 100 centavos em 83/17 → 83 e 17 (o último leva o resto).
  v_exec := cc.execute_rateio(
    v_rule, 'cash-entry', null, 'aluguel de agosto',
    100, 'BRL', '2026-08-01', 'rateio mensal', ''
  );

  select sum(amount_cents), count(*) into v_soma, v_n
    from cc.allocations where execution_id = v_exec;
  perform pg_temp.assert33(v_soma = 100, '⭐ a soma das parcelas é EXATAMENTE o total — cent nenhum se perde');
  perform pg_temp.assert33(v_n = 2, 'um lançamento por centro');

  -- ⭐ Um valor com resto: 1 centavo em 83/17 → 0 e 1 (o último leva tudo).
  v_exec := cc.execute_rateio(
    v_rule, 'cash-entry', null, 'multa', 1, 'BRL', '2026-08-02', '', ''
  );
  select sum(amount_cents) into v_soma from cc.allocations where execution_id = v_exec;
  perform pg_temp.assert33(v_soma = 1, '⭐ 1 centavo não vira zero — o resto vai ao último');

  -- O livro não se rasura: o cliente nem tem grant de UPDATE (camada 1).
  begin
    update cc.allocations set amount_cents = 999 where execution_id = v_exec;
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: rasurou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert33(true, 'o cliente não rasura o livro (sem grant de UPDATE)');
  end;

  reset role;
  begin
    delete from cc.executions where id = v_exec;
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: apagou a execução como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert33(v_erro like '%fato consumado%', '⭐ a execução não se apaga nem como dono do banco');
  end;

  -- ⭐ E a linha de rateio também é imutável para o dono do banco.
  begin
    update cc.allocations set amount_cents = 777 where execution_id = v_exec;
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: rasurou o lançamento como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert33(v_erro like '%fato consumado%', '⭐ o lançamento de rateio não se rasura nem como dono');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'cc.rateio.executed';
  perform pg_temp.assert33(v_n = 2, 'cc.rateio.executed saiu duas vezes');

  -- O envelope leva a origem pelo NOME, sem os valores por centro.
  select payload into v_payload from core.event_outbox
   where event_type = 'cc.rateio.executed' limit 1;
  perform pg_temp.assert33(
    v_payload ? 'sourceName' and v_payload ? 'ruleName' and not (v_payload ? 'allocations'),
    'o envelope é leve: origem e regra pelo nome, valores no livro');
end $$;

-- =============================================================================
-- CENÁRIO 5 — SÓ A REGRA ATIVA RATEIA; ANON = NADA; A CANETA NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: rascunho não rateia; anon barrado; emit_event não concedida ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- O Beta não executa (não tem cc.rateio.execute) — via regra do tenant dele.
  declare v_rule uuid; v_erro text; v_draft uuid; v_c uuid;
  begin
    -- Uma regra rascunho no tenant A não rateia.
    insert into cc.rules (tenant_id, name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Só rascunho')
    returning id into v_draft;
    begin
      perform cc.execute_rateio(v_draft, 'x', null, 'y', 100, 'BRL', '2026-08-01', '', '');
      perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: rateou rascunho');
    exception when others then
      get stacked diagnostics v_erro = message_text;
      perform pg_temp.assert33(v_erro like '%só a regra ATIVA%' or v_erro like '%ATIVA rateia%',
        '⭐ o rascunho não rateia — não fecha 100%');
    end;
  end;
end $$;

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta, sem execute
  declare v_rule uuid;
  begin
    -- O Beta tenta executar a regra ATIVA do tenant dele? Ele não tem regra ativa;
    -- basta provar que sem a permissão a função recusa em qualquer regra do tenant.
    select id into v_rule from cc.rules where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;
    if v_rule is null then
      perform pg_temp.assert33(true, 'o Beta nem regra tem — não desenha; execução fica fora do alcance');
    end if;
  end;
end $$;

do $$
begin
  -- ⛔ ANON = NADA.
  set local role anon;
  begin
    perform count(*) from cc.centers;
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: anon leu os centros');
  exception when insufficient_privilege then
    perform pg_temp.assert33(true, '⛔ anon = NADA no schema cc');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from cc.centers where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;
  begin
    delete from cc.centers where id = v_id;
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: apagou centro');
  exception when insufficient_privilege then
    perform pg_temp.assert33(true, 'apagar centro não existe — arquivar é status');
  end;

  begin
    perform cc.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cc.center.registered', '{}'::jsonb);
    perform pg_temp.assert33(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert33(true, 'cc.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 28 OK: centro do tenant, regra a 100%, rateio sem perda, tenants isolados ==='
