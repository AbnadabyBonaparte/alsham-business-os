-- =============================================================================
-- O MÓDULO 98 NO BANCO — o roster de profissionais que se isola, o profissional
-- que volta do arquivo, o autor carimbado pelo servidor e o hr_employee_id SOLTO
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os profissionais de um tenant não aparecem no outro;
--   2. ⭐ **active ↔ archived** — o profissional VOLTA do arquivo (o DIVERGE do hr);
--   3. ⭐ **quem NÃO tem professional.professional.manage é barrado** — o user-c,
--      membro do Alfa sem a permissão, não cadastra;
--   4. ⭐ **o autor é carimbado pelo servidor** — o created_by mentido é descartado;
--   5. ⭐ **hr_employee_id é ID SOLTO** — um id inexistente insere sem erro (a
--      integridade daquele dado é do hr, não daqui);
--   6. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta na tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert103(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: professional instalado; Alfa e Beta gerenciam; user-c sem a permissão ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'professional', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'professional', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- Alfa (user-a) e Beta (user-b) recebem manage no papel admin do seu tenant.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'professional.professional.manage', 'professional'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ user-c é membro do Alfa (papel `conciliador`), e NÃO ganha manage — é ele
-- quem prova que a permissão é exigida.

\echo 'montagem concluída: Alfa e Beta gerenciam o roster; user-c não.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ATIVO, O AUTOR E O hr_employee_id SOLTO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu roster; nasce ativo; autor do servidor; hr solto ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid; v_hr uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT e amarra um hr_employee_id que NÃO existe em hr
  -- nenhum — o gatilho descarta o autor; o vínculo solto insere sem erro.
  insert into professional.professionals (tenant_id, name, specialty, hr_employee_id, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ana Corte', 'cabeleireiro',
          '99999999-9999-4999-8999-999999999999',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by, hr_employee_id into v_id, v_created_by, v_hr;

  perform pg_temp.assert103(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  perform pg_temp.assert103(
    v_hr = '99999999-9999-4999-8999-999999999999',
    '⭐ hr_employee_id é id SOLTO — um id inexistente insere sem erro');

  begin
    insert into professional.professionals (tenant_id, name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'archived');
    perform pg_temp.assert103(false, 'DEVERIA TER FALHADO: nasceu arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert103(v_erro like '%nasce ativo%', 'o profissional nasce ativo');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into professional.professionals (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Profissional Solo B');

  select count(*) into v_n from professional.professionals;
  perform pg_temp.assert103(v_n = 1, 'o Beta enxerga só o roster dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ active ↔ archived: O PROFISSIONAL VOLTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: arquivar e reativar — o mesmo registro (o DIVERGE do hr) ==='

do $$
declare
  v_id uuid; v_status text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from professional.professionals
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Ana Corte';

  -- ⭐ Arquivar NÃO exige razão (o DIVERGE do hr, cujo terminated exige motivo).
  update professional.professionals set status = 'archived' where id = v_id;
  select status into v_status from professional.professionals where id = v_id;
  perform pg_temp.assert103(v_status = 'archived', 'arquivou, sem exigir razão');

  update professional.professionals set status = 'active' where id = v_id;
  select status into v_status from professional.professionals where id = v_id;
  perform pg_temp.assert103(v_status = 'active', '⭐ o profissional VOLTA do arquivo — a mesma pessoa');

  -- Transição inexistente é barrada.
  begin
    update professional.professionals set status = 'terminated' where id = v_id;
    perform pg_temp.assert103(false, 'DEVERIA TER FALHADO: status fora do ciclo');
  exception when others then
    perform pg_temp.assert103(true, 'status fora de (active,archived) é recusado pelo check');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'professional.professional.archived';
  perform pg_temp.assert103(v_n = 1, 'o fato de arquivar saiu');
  select count(*) into v_n from core.event_outbox where event_type = 'professional.professional.reactivated';
  perform pg_temp.assert103(v_n = 1, 'o fato de reativar saiu');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ SEM professional.professional.manage: O user-c É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: user-c (membro do Alfa, sem a permissão) não cadastra ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- user-c

  begin
    insert into professional.professionals (tenant_id, name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Cadastro Proibido');
    perform pg_temp.assert103(false, 'DEVERIA TER FALHADO: user-c cadastrou sem a permissão');
  exception when insufficient_privilege then
    perform pg_temp.assert103(true, '⭐ registrar exige professional.professional.manage — o user-c é barrado');
  end;

  -- E sem a permissão nem enxerga o roster.
  perform pg_temp.assert103(
    (select count(*) from professional.professionals) = 0,
    'sem a permissão, o user-c não enxerga o roster');
end $$;

-- =============================================================================
-- CENÁRIO 4 — CROSS-TENANT: O ALFA NÃO ESCREVE NO ROSTER DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into professional.professionals (tenant_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor');
    perform pg_temp.assert103(false, 'DEVERIA TER FALHADO: o Alfa escreveu no roster do Beta');
  exception when others then
    perform pg_temp.assert103(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
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

  select id into v_id from professional.professionals
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from professional.professionals where id = v_id;
    perform pg_temp.assert103(false, 'DEVERIA TER FALHADO: apagou profissional');
  exception when insufficient_privilege then
    perform pg_temp.assert103(true, 'apagar não existe — arquivar é status');
  end;

  begin
    perform professional.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'professional.professional.registered', '{}'::jsonb);
    perform pg_temp.assert103(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert103(true, 'professional.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from professional.professionals limit 1;
    perform pg_temp.assert103(false, 'DEVERIA TER FALHADO: anon leu professional.professionals');
  exception when insufficient_privilege then
    perform pg_temp.assert103(true, '⭐ anon não encosta em professional.professionals');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 98 OK: roster isolado, profissional que volta, autor do servidor, hr solto, anon fora ==='
