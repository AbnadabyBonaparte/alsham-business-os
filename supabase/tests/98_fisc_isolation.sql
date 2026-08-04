-- =============================================================================
-- O MÓDULO 85 NO BANCO — o alvo que volta do arquivo, a vistoria carimbada
-- pelo servidor e IMUTÁVEL, e a assimetria: quem vistoria não mantém o rol
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os alvos e as vistorias de um tenant não aparecem no outro — e a
--      assimetria user-a × user-b: o Beta VISTORIA (inspection.record) mas NÃO
--      mantém nem arquiva alvo (target.manage) — precisa do alvo que o Alfa
--      (ou a montagem) já colocou no rol;
--   2. ⭐ **o carimbo da vistoria é do SERVIDOR** — a hora que o cliente
--      mandar de `inspected_at` é descartada, e `inspected_by` é sempre quem
--      está autenticado, nunca o que vier no INSERT;
--   3. ⭐⭐ **a vistoria é IMUTÁVEL** — update e delete mordidos, mesmo com
--      grant nenhum concedido e mesmo tentando via função;
--   4. ⭐ **o alvo (target) volta do arquivo** — `active ↔ archived`;
--   5. ⛔ arquivar/reativar alvo exige `fisc.target.manage` — o Beta é
--      barrado mesmo tendo `inspection.record`;
--   6. apagar alvo não existe; a caneta de emitir evento não é do cliente; e
--      o `anon` não encosta em nenhuma das duas tabelas.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert98(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: fisc instalado; Alfa mantém o rol E vistoria; Beta só vistoria ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fisc', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'fisc', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'fisc.target.manage', 'fisc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'fisc.inspection.record', 'fisc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⚠️ O Beta NUNCA recebe `fisc.target.manage`. Para ele poder vistoriar,
-- alguém precisa manter o alvo do TENANT DELE primeiro — e como o Beta não
-- pode, isto é feito aqui, como o dono do banco (superuser: bypassa RLS mesmo
-- com FORCE ROW LEVEL SECURITY ligada), simulando o alvo que a fiscalização
-- do órgão já cadastrou antes de o fiscal de plantão assumir.
insert into fisc.targets (tenant_id, name, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Mercado do Beta', 'active');

\echo 'montagem concluída: só o Alfa mantém o rol; os dois vistoriam.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ATIVO E A ASSIMETRIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu rol; o Beta vistoria mas não mantém ==='

do $$
declare
  v_target_a uuid; v_target_b uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into fisc.targets (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Padaria da Praça')
  returning id into v_target_a;

  begin
    insert into fisc.targets (tenant_id, name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'archived');
    perform pg_temp.assert98(false, 'DEVERIA TER FALHADO: alvo nasceu arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert98(v_erro like '%nasce ativo%', 'o alvo nasce ativo');
  end;

  insert into fisc.inspections (tenant_id, target_id, finding)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_target_a, 'dentro das normas');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- ⛔ Beta tenta manter um alvo no PRÓPRIO tenant — barrado.
  begin
    insert into fisc.targets (tenant_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Alvo do Beta');
    perform pg_temp.assert98(false, 'DEVERIA TER FALHADO: Beta cadastrou alvo sem target.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert98(true, '⭐ manter alvo exige fisc.target.manage — Beta barrado');
  end;

  -- ✅ Beta VISTORIA o alvo que já estava no rol (montado como superuser).
  select id into v_target_b from fisc.targets
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'Mercado do Beta';

  insert into fisc.inspections (tenant_id, target_id, finding)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_target_b, 'vistoria matinal');
  perform pg_temp.assert98(true, '⭐ o Beta registra a vistoria com só inspection.record');

  select count(*) into v_n from fisc.targets;
  perform pg_temp.assert98(v_n = 1, 'o Beta enxerga só o rol dele');

  select count(*) into v_n from fisc.inspections;
  perform pg_temp.assert98(v_n = 1, 'o Beta enxerga só o livro de vistorias dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O CARIMBO DA VISTORIA É DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: a hora e o autor mentidos no INSERT são descartados ==='

do $$
declare
  v_target uuid; v_id uuid; v_inspected_at timestamptz; v_inspected_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_target from fisc.targets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Padaria da Praça';

  -- Tenta mentir a hora E o autor da vistoria.
  insert into fisc.inspections (tenant_id, target_id, inspected_at, inspected_by, finding)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_target,
          '1999-01-01 00:00+00', '22222222-2222-4222-8222-222222222222', 'mentira')
  returning id, inspected_at, inspected_by into v_id, v_inspected_at, v_inspected_by;

  perform pg_temp.assert98(v_inspected_at > now() - interval '1 minute', '⭐ inspected_at é do servidor — a hora mentida foi descartada');
  perform pg_temp.assert98(v_inspected_by = '11111111-1111-4111-8111-111111111111', '⭐ inspected_by é quem está autenticado — não o que o INSERT mandou');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ A VISTORIA É IMUTÁVEL: UPDATE E DELETE MORDIDOS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a vistoria registrada não se edita nem se apaga ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from fisc.inspections
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    update fisc.inspections set finding = 'reescrita' where id = v_id;
    perform pg_temp.assert98(false, 'DEVERIA TER FALHADO: vistoria editada');
  exception
    when insufficient_privilege then
      perform pg_temp.assert98(true, '⭐⭐ update na vistoria: sem grant — barrado antes do gatilho');
    when others then
      get stacked diagnostics v_erro = message_text;
      perform pg_temp.assert98(v_erro like '%não se edita%', '⭐⭐ update na vistoria: o gatilho recusou');
  end;

  begin
    delete from fisc.inspections where id = v_id;
    perform pg_temp.assert98(false, 'DEVERIA TER FALHADO: vistoria apagada');
  exception
    when insufficient_privilege then
      perform pg_temp.assert98(true, '⭐⭐ delete na vistoria: sem grant — barrado antes do gatilho');
    when others then
      get stacked diagnostics v_erro = message_text;
      perform pg_temp.assert98(v_erro like '%não se edita%', '⭐⭐ delete na vistoria: o gatilho recusou');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O ALVO VOLTA DO ARQUIVO (active ↔ archived)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: arquivar e reativar o alvo — o mesmo registro ==='

do $$
declare
  v_id uuid; v_status text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from fisc.targets
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Padaria da Praça';

  update fisc.targets set status = 'archived' where id = v_id;
  select status into v_status from fisc.targets where id = v_id;
  perform pg_temp.assert98(v_status = 'archived', 'arquivou o alvo');

  update fisc.targets set status = 'active' where id = v_id;
  select status into v_status from fisc.targets where id = v_id;
  perform pg_temp.assert98(v_status = 'active', '⭐ o alvo VOLTA do arquivo — o mesmo estabelecimento');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'fisc.inspection.recorded';
  perform pg_temp.assert98(v_n = 3, 'as três vistorias do cenário emitiram o fato');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⛔ ARQUIVAR/REATIVAR EXIGE fisc.target.manage: O BETA É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o Beta vistoria mas não arquiva o alvo ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select id into v_id from fisc.targets
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'Mercado do Beta';

  begin
    update fisc.targets set status = 'archived' where id = v_id;
    perform pg_temp.assert98(false, 'DEVERIA TER FALHADO: o Beta arquivou o alvo sem target.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert98(true, '⛔ arquivar/reativar alvo exige fisc.target.manage — Beta barrado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — APAGAR ALVO NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: apagar alvo não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from fisc.targets limit 1;

  begin
    delete from fisc.targets where id = v_id;
    perform pg_temp.assert98(false, 'DEVERIA TER FALHADO: apagou alvo');
  exception when insufficient_privilege then
    perform pg_temp.assert98(true, 'apagar alvo não existe — arquivar é status');
  end;

  begin
    perform fisc.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fisc.inspection.recorded', '{}'::jsonb);
    perform pg_temp.assert98(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert98(true, 'fisc.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;

  begin
    perform 1 from fisc.targets limit 1;
    perform pg_temp.assert98(false, 'DEVERIA TER FALHADO: anon leu fisc.targets');
  exception when insufficient_privilege then
    perform pg_temp.assert98(true, '⭐ anon não encosta em fisc.targets');
  end;

  begin
    perform 1 from fisc.inspections limit 1;
    perform pg_temp.assert98(false, 'DEVERIA TER FALHADO: anon leu fisc.inspections');
  exception when insufficient_privilege then
    perform pg_temp.assert98(true, '⭐ anon não encosta em fisc.inspections');
  end;

  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 85 OK: rol isolado, vistoria carimbada e imutável, anon fora ==='
