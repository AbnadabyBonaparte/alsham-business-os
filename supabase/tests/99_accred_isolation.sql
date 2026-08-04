-- =============================================================================
-- O MÓDULO 94 NO BANCO — a credencial que nasce ativa e volta do bloqueio, o
-- check-in validado no portão contra a credencial ATIVA, carimbado pelo
-- servidor e IMUTÁVEL, e a assimetria: quem faz check-in não emite credencial
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as credenciais e os check-ins de um tenant não aparecem no outro — e a
--      assimetria user-a × user-b: o Beta FAZ CHECK-IN (checkin.record) mas NÃO
--      emite nem revoga credencial (credential.manage) — precisa da credencial
--      que o Alfa (ou a montagem) já emitiu;
--   2. ⭐ **o portão só deixa passar credencial ATIVA** — check-in contra
--      credencial revogada é recusado com erro claro;
--   3. ⭐ **o carimbo do check-in é do SERVIDOR** — a hora que o cliente mandar
--      de `checked_in_at` é descartada, e `checked_in_by` é sempre quem está
--      autenticado, nunca o que vier no INSERT;
--   4. ⭐⭐ **o check-in é IMUTÁVEL** — update e delete mordidos, mesmo com
--      grant nenhum concedido e mesmo tentando via função;
--   5. ⭐ **a credencial volta do bloqueio** — `active ↔ revoked`;
--   6. ⛔ revogar/reativar credencial exige `accred.credential.manage` — o Beta
--      é barrado mesmo tendo `checkin.record`;
--   7. apagar credencial não existe; a caneta de emitir evento não é do
--      cliente; e o `anon` não encosta em nenhuma das duas tabelas.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert99(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: accred instalado; Alfa emite credencial E faz check-in; Beta só check-in ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'accred', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'accred', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'accred.credential.manage', 'accred'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'accred.checkin.record', 'accred'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⚠️ O Beta NUNCA recebe `accred.credential.manage`. Para ele poder fazer
-- check-in, alguém precisa emitir a credencial do TENANT DELE primeiro — e como
-- o Beta não pode, isto é feito aqui, como o dono do banco (superuser: bypassa
-- RLS mesmo com FORCE ROW LEVEL SECURITY ligada), simulando a credencial que a
-- organização do evento já emitiu antes de o staff de portão assumir.
insert into accred.credentials (tenant_id, event_id, holder_name, credential_type, status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Portador do Beta', 'participante', 'active');

\echo 'montagem concluída: só o Alfa emite credencial; os dois fazem check-in.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ATIVO E A ASSIMETRIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com as suas credenciais; o Beta faz check-in mas não emite ==='

do $$
declare
  v_cred_a uuid; v_cred_b uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into accred.credentials (tenant_id, event_id, holder_name, credential_type)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Ana Palestrante', 'palestrante')
  returning id into v_cred_a;

  begin
    insert into accred.credentials (tenant_id, event_id, holder_name, credential_type, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Nasce Errado', 'staff', 'revoked');
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: credencial nasceu revogada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert99(v_erro like '%nasce ativa%', 'a credencial nasce ativa');
  end;

  insert into accred.checkins (tenant_id, credential_id, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_cred_a, 'chegou às 9h');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- ⛔ Beta tenta emitir credencial no PRÓPRIO tenant — barrado.
  begin
    insert into accred.credentials (tenant_id, event_id, holder_name, credential_type)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Credencial do Beta', 'participante');
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: Beta emitiu credencial sem credential.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert99(true, '⭐ emitir credencial exige accred.credential.manage — Beta barrado');
  end;

  -- ✅ Beta FAZ CHECK-IN contra a credencial que já estava emitida (montada).
  select id into v_cred_b from accred.credentials
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and holder_name = 'Portador do Beta';

  insert into accred.checkins (tenant_id, credential_id, note)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_cred_b, 'chegada matinal');
  perform pg_temp.assert99(true, '⭐ o Beta registra o check-in com só checkin.record');

  select count(*) into v_n from accred.credentials;
  perform pg_temp.assert99(v_n = 1, 'o Beta enxerga só as credenciais dele');

  select count(*) into v_n from accred.checkins;
  perform pg_temp.assert99(v_n = 1, 'o Beta enxerga só o livro de check-ins dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O CARIMBO DO CHECK-IN É DO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: a hora e o autor mentidos no INSERT são descartados ==='

do $$
declare
  v_cred uuid; v_id uuid; v_at timestamptz; v_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_cred from accred.credentials
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and holder_name = 'Ana Palestrante';

  -- Tenta mentir a hora E o autor do check-in.
  insert into accred.checkins (tenant_id, credential_id, checked_in_at, checked_in_by, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_cred,
          '1999-01-01 00:00+00', '22222222-2222-4222-8222-222222222222', 'mentira')
  returning id, checked_in_at, checked_in_by into v_id, v_at, v_by;

  perform pg_temp.assert99(v_at > now() - interval '1 minute', '⭐ checked_in_at é do servidor — a hora mentida foi descartada');
  perform pg_temp.assert99(v_by = '11111111-1111-4111-8111-111111111111', '⭐ checked_in_by é quem está autenticado — não o que o INSERT mandou');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ O CHECK-IN É IMUTÁVEL: UPDATE E DELETE MORDIDOS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o check-in registrado não se edita nem se apaga ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from accred.checkins
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    update accred.checkins set note = 'reescrita' where id = v_id;
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: check-in editado');
  exception
    when insufficient_privilege then
      perform pg_temp.assert99(true, '⭐⭐ update no check-in: sem grant — barrado antes do gatilho');
    when others then
      get stacked diagnostics v_erro = message_text;
      perform pg_temp.assert99(v_erro like '%não se edita%', '⭐⭐ update no check-in: o gatilho recusou');
  end;

  begin
    delete from accred.checkins where id = v_id;
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: check-in apagado');
  exception
    when insufficient_privilege then
      perform pg_temp.assert99(true, '⭐⭐ delete no check-in: sem grant — barrado antes do gatilho');
    when others then
      get stacked diagnostics v_erro = message_text;
      perform pg_temp.assert99(v_erro like '%não se edita%', '⭐⭐ delete no check-in: o gatilho recusou');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ A CREDENCIAL VOLTA DO BLOQUEIO (active ↔ revoked)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: revogar e reativar a credencial — o mesmo registro ==='

do $$
declare
  v_id uuid; v_status text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from accred.credentials
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and holder_name = 'Ana Palestrante';

  update accred.credentials set status = 'revoked' where id = v_id;
  select status into v_status from accred.credentials where id = v_id;
  perform pg_temp.assert99(v_status = 'revoked', 'revogou a credencial');

  update accred.credentials set status = 'active' where id = v_id;
  select status into v_status from accred.credentials where id = v_id;
  perform pg_temp.assert99(v_status = 'active', '⭐ a credencial VOLTA do bloqueio — o mesmo crachá');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'accred.checkin.recorded';
  perform pg_temp.assert99(v_n = 3, 'os três check-ins do cenário emitiram o fato');

  select count(*) into v_n from core.event_outbox where event_type = 'accred.credential.registered';
  perform pg_temp.assert99(v_n = 2, 'as duas credenciais emitidas até aqui (Ana do Alfa + a montada do Beta) emitiram o fato');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⛔ REVOGAR/REATIVAR EXIGE credential.manage: O BETA É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o Beta faz check-in mas não revoga a credencial ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select id into v_id from accred.credentials
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and holder_name = 'Portador do Beta';

  begin
    update accred.credentials set status = 'revoked' where id = v_id;
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: o Beta revogou a credencial sem credential.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert99(true, '⛔ revogar/reativar credencial exige accred.credential.manage — Beta barrado');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — ⭐ O PORTÃO: CHECK-IN CONTRA CREDENCIAL REVOGADA É RECUSADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: só credencial ativa passa no portão ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Emite uma credencial e a revoga.
  insert into accred.credentials (tenant_id, event_id, holder_name, credential_type)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Crachá Bloqueado', 'staff')
  returning id into v_id;

  update accred.credentials set status = 'revoked' where id = v_id;

  begin
    insert into accred.checkins (tenant_id, credential_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id);
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: check-in com credencial revogada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert99(v_erro like '%credencial ATIVA%', '⭐ o portão recusa credencial revogada');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 7 — APAGAR CREDENCIAL NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: apagar credencial não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from accred.credentials limit 1;

  begin
    delete from accred.credentials where id = v_id;
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: apagou credencial');
  exception when insufficient_privilege then
    perform pg_temp.assert99(true, 'apagar credencial não existe — revogar é status');
  end;

  begin
    perform accred.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'accred.checkin.recorded', '{}'::jsonb);
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert99(true, 'accred.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;

  begin
    perform 1 from accred.credentials limit 1;
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: anon leu accred.credentials');
  exception when insufficient_privilege then
    perform pg_temp.assert99(true, '⭐ anon não encosta em accred.credentials');
  end;

  begin
    perform 1 from accred.checkins limit 1;
    perform pg_temp.assert99(false, 'DEVERIA TER FALHADO: anon leu accred.checkins');
  exception when insufficient_privilege then
    perform pg_temp.assert99(true, '⭐ anon não encosta em accred.checkins');
  end;

  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 94 OK: credenciais isoladas, portão só com credencial ativa, check-in carimbado e imutável, anon fora ==='
