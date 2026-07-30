-- =============================================================================
-- O MÓDULO 42 NO BANCO — o posto que volta do arquivo, a ronda carimbada
-- pelo servidor e IMUTÁVEL, e a assimetria: quem ronda não desenha o mapa
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os postos e as rondas de um tenant não aparecem no outro — e a
--      assimetria user-a × user-b: o Beta RONDA (patrol.record) mas NÃO
--      desenha nem arquiva posto (checkpoint.manage) — precisa do posto
--      que o Alfa (ou a montagem) já colocou no mapa;
--   2. ⭐ **o carimbo da ronda é do SERVIDOR** — a hora que o cliente
--      mandar de `passed_at` é descartada, e `passed_by` é sempre quem
--      está autenticado, nunca o que vier no INSERT;
--   3. ⭐⭐ **a ronda é IMUTÁVEL** — update e delete mordidos, mesmo com
--      grant nenhum concedido e mesmo tentando via função;
--   4. ⭐ **o posto (checkpoint) volta do arquivo** — `active ↔ archived`;
--   5. ⛔ arquivar/reabrir posto exige `sec.checkpoint.manage` — o Beta é
--      barrado mesmo tendo `patrol.record`;
--   6. apagar posto não existe; a caneta de emitir evento não é do
--      cliente; e o `anon` não encosta em nenhuma das duas tabelas.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert47(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: sec (a última peça) instalado; Alfa desenha E ronda; Beta só ronda ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sec', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'sec', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'sec.checkpoint.manage', 'sec'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'sec.patrol.record', 'sec'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⚠️ O Beta NUNCA recebe `sec.checkpoint.manage`. Para ele poder rondar,
-- alguém precisa desenhar o posto do TENANT DELE primeiro — e como o Beta
-- não pode, isto é feito aqui, como o dono do banco (superuser: bypassa
-- RLS mesmo com FORCE ROW LEVEL SECURITY ligada), simulando o posto que a
-- operação da praça já desenhou antes de o vigia da madrugada assumir.
insert into sec.checkpoints (tenant_id, name, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Portaria Sul (Beta)', 'active');

\echo 'montagem concluída: só o Alfa desenha o mapa; os dois rondam.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ATIVO E A ASSIMETRIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu mapa; o Beta ronda mas não desenha ==='

do $$
declare
  v_checkpoint_a uuid; v_checkpoint_b uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into sec.checkpoints (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Portaria Norte')
  returning id into v_checkpoint_a;

  begin
    insert into sec.checkpoints (tenant_id, name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'archived');
    perform pg_temp.assert47(false, 'DEVERIA TER FALHADO: posto nasceu arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert47(v_erro like '%nasce ativo%', 'o posto nasce ativo');
  end;

  insert into sec.patrols (tenant_id, checkpoint_id, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_checkpoint_a, 'tudo normal');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- ⛔ Beta tenta desenhar um posto no PRÓPRIO tenant — barrado.
  begin
    insert into sec.checkpoints (tenant_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Posto do Beta');
    perform pg_temp.assert47(false, 'DEVERIA TER FALHADO: Beta desenhou posto sem checkpoint.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert47(true, '⭐ desenhar posto exige sec.checkpoint.manage — Beta barrado');
  end;

  -- ✅ Beta RONDA o posto que já estava no mapa (montado como superuser).
  select id into v_checkpoint_b from sec.checkpoints
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'Portaria Sul (Beta)';

  insert into sec.patrols (tenant_id, checkpoint_id, note)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_checkpoint_b, 'ronda das 6h');
  perform pg_temp.assert47(true, '⭐ o Beta registra a ronda com só patrol.record');

  select count(*) into v_n from sec.checkpoints;
  perform pg_temp.assert47(v_n = 1, 'o Beta enxerga só o mapa dele');

  select count(*) into v_n from sec.patrols;
  perform pg_temp.assert47(v_n = 1, 'o Beta enxerga só o livro de rondas dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O CARIMBO DA RONDA É DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: a hora e o autor mentidos no INSERT são descartados ==='

do $$
declare
  v_checkpoint uuid; v_id uuid; v_passed_at timestamptz; v_passed_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_checkpoint from sec.checkpoints
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Portaria Norte';

  -- Tenta mentir a hora E o autor da ronda.
  insert into sec.patrols (tenant_id, checkpoint_id, passed_at, passed_by, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_checkpoint,
          '1999-01-01 00:00+00', '22222222-2222-4222-8222-222222222222', 'mentira')
  returning id, passed_at, passed_by into v_id, v_passed_at, v_passed_by;

  perform pg_temp.assert47(v_passed_at > now() - interval '1 minute', '⭐ passed_at é do servidor — a hora mentida foi descartada');
  perform pg_temp.assert47(v_passed_by = '11111111-1111-4111-8111-111111111111', '⭐ passed_by é quem está autenticado — não o que o INSERT mandou');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ A RONDA É IMUTÁVEL: UPDATE E DELETE MORDIDOS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a ronda registrada não se edita nem se apaga ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from sec.patrols
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    update sec.patrols set note = 'reescrita' where id = v_id;
    perform pg_temp.assert47(false, 'DEVERIA TER FALHADO: ronda editada');
  exception
    when insufficient_privilege then
      perform pg_temp.assert47(true, '⭐⭐ update na ronda: sem grant — barrado antes do gatilho');
    when others then
      get stacked diagnostics v_erro = message_text;
      perform pg_temp.assert47(v_erro like '%não se edita%', '⭐⭐ update na ronda: o gatilho recusou');
  end;

  begin
    delete from sec.patrols where id = v_id;
    perform pg_temp.assert47(false, 'DEVERIA TER FALHADO: ronda apagada');
  exception
    when insufficient_privilege then
      perform pg_temp.assert47(true, '⭐⭐ delete na ronda: sem grant — barrado antes do gatilho');
    when others then
      get stacked diagnostics v_erro = message_text;
      perform pg_temp.assert47(v_erro like '%não se edita%', '⭐⭐ delete na ronda: o gatilho recusou');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O POSTO VOLTA DO ARQUIVO (active ↔ archived)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: arquivar e reabrir o posto — o mesmo registro ==='

do $$
declare
  v_id uuid; v_status text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from sec.checkpoints
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Portaria Norte';

  update sec.checkpoints set status = 'archived' where id = v_id;
  select status into v_status from sec.checkpoints where id = v_id;
  perform pg_temp.assert47(v_status = 'archived', 'arquivou o posto');

  update sec.checkpoints set status = 'active' where id = v_id;
  select status into v_status from sec.checkpoints where id = v_id;
  perform pg_temp.assert47(v_status = 'active', '⭐ o posto VOLTA do arquivo — o mesmo lugar');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'sec.patrol.recorded';
  perform pg_temp.assert47(v_n = 3, 'as três rondas do cenário emitiram o fato');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⛔ ARQUIVAR/REABRIR EXIGE sec.checkpoint.manage: O BETA É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o Beta ronda mas não arquiva o posto ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select id into v_id from sec.checkpoints
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'Portaria Sul (Beta)';

  begin
    update sec.checkpoints set status = 'archived' where id = v_id;
    perform pg_temp.assert47(false, 'DEVERIA TER FALHADO: o Beta arquivou o posto sem checkpoint.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert47(true, '⛔ arquivar/reabrir posto exige sec.checkpoint.manage — Beta barrado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — APAGAR POSTO NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: apagar posto não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from sec.checkpoints limit 1;

  begin
    delete from sec.checkpoints where id = v_id;
    perform pg_temp.assert47(false, 'DEVERIA TER FALHADO: apagou posto');
  exception when insufficient_privilege then
    perform pg_temp.assert47(true, 'apagar posto não existe — arquivar é status');
  end;

  begin
    perform sec.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sec.patrol.recorded', '{}'::jsonb);
    perform pg_temp.assert47(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert47(true, 'sec.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;

  begin
    perform 1 from sec.checkpoints limit 1;
    perform pg_temp.assert47(false, 'DEVERIA TER FALHADO: anon leu sec.checkpoints');
  exception when insufficient_privilege then
    perform pg_temp.assert47(true, '⭐ anon não encosta em sec.checkpoints');
  end;

  begin
    perform 1 from sec.patrols limit 1;
    perform pg_temp.assert47(false, 'DEVERIA TER FALHADO: anon leu sec.patrols');
  exception when insufficient_privilege then
    perform pg_temp.assert47(true, '⭐ anon não encosta em sec.patrols');
  end;

  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 42 OK: a última peça — mapa isolado, ronda carimbada e imutável, anon fora ==='
\echo '=== 🎉 42/42 — A CAMPANHA DAS 6 ONDAS ESTÁ COMPLETA NO DISCO ==='
