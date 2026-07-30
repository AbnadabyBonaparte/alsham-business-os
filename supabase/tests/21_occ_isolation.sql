-- =============================================================================
-- O MÓDULO 16 NO BANCO — o registro que não se reescreve, a tratativa eterna
-- e o desfecho obrigatório
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o livro de um tenant não aparece no do outro;
--   2. ⭐ **o REGISTRO nasce imutável** — nem o cliente, NEM O DONO DO
--      BANCO reescrevem o relato; a correção é tratativa;
--   3. ⭐ **o futuro é recusado pela constraint** — fato consumado;
--   4. ⭐ **encerrar exige desfecho escrito e permissão própria**
--      (assimetria user-a × user-b), com carimbo do servidor — e depois de
--      encerrada NADA se edita, nem o desfecho;
--   5. tratativa é imutável e recusada em ocorrência encerrada;
--   6. apagar não existe nem para o dono; a caneta não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert21(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Ocorrências nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'occ', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'occ', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as QUATRO permissões;
-- `user-b` (Beta) registra e trata — mas NÃO encerra.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'occ'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('occ.occurrence.register'), ('occ.occurrence.treat'),
                     ('occ.setup.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'occ.occurrence.close', 'occ'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois registram e tratam; só o Alfa encerra.'

-- =============================================================================
-- CENÁRIO 1 — O REGISTRO NASCE IMUTÁVEL; O FUTURO É RECUSADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: o relato não se reescreve — nem pelo dono do banco ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into occ.severities (tenant_id, name, position) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grave', 0),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'leve', 1);

  insert into occ.occurrences (tenant_id, title, description, location, occurred_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vazamento na doca 3',
          'Água acumulada perto da entrada de carga.', 'doca 3', now() - interval '2 hours')
  returning id into v_id;

  begin
    insert into occ.occurrences (tenant_id, title, description, occurred_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Do futuro', 'ainda não aconteceu',
            now() + interval '1 day');
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: registrou o amanhã');
  exception when check_violation then
    perform pg_temp.assert21(true, '⭐ o futuro é recusado — fato consumado não mora no futuro');
  end;

  begin
    update occ.occurrences set description = 'relato reescrito' where id = v_id;
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: cliente editou o relato');
  exception when insufficient_privilege then
    perform pg_temp.assert21(true, 'o cliente não tem NENHUMA porta de UPDATE no registro');
  end;

  -- Nem o DONO DO BANCO reescreve.
  reset role;
  begin
    update occ.occurrences set description = 'relato reescrito pelo dono' where id = v_id;
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: dono editou o relato');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert21(v_erro like '%TRATATIVA%', '⭐ nem o dono reescreve — a correção é tratativa');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'occ.occurrence.registered';
  perform pg_temp.assert21(v_n = 1, 'occ.occurrence.registered saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ISOLAMENTO E A RÉGUA DO TENANT
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: cada tenant tem o seu livro e a sua régua ==='

do $$
declare
  v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into occ.severities (tenant_id, name, position)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aluno machucado', 0);

  insert into occ.occurrences (tenant_id, title, description)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Queda no pátio',
          'Aluno escorregou no piso molhado do pátio.');

  select count(*) into v_n from occ.occurrences;
  perform pg_temp.assert21(v_n = 1, 'o Beta enxerga só o livro dele');

  select count(*) into v_n from occ.severities;
  perform pg_temp.assert21(v_n = 1, 'a régua de gravidade também é só a dele');
end $$;

-- =============================================================================
-- CENÁRIO 3 — A TRATATIVA: ETERNA, E SÓ EM OCORRÊNCIA ABERTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a tratativa não se edita; encerrada não trata ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from occ.occurrences
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  insert into occ.treatments (tenant_id, occurrence_id, action_taken)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'área isolada; manutenção acionada');

  begin
    update occ.treatments set action_taken = 'reescrito' where occurrence_id = v_id;
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: editou tratativa');
  exception when insufficient_privilege then
    perform pg_temp.assert21(true, 'a tratativa não se edita pelo cliente');
  end;

  reset role;
  begin
    delete from occ.treatments where occurrence_id = v_id;
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: apagou tratativa como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert21(v_erro like '%fato consumado%', '⭐ a tratativa não se apaga nem como dono');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'occ.occurrence.treated';
  perform pg_temp.assert21(v_n = 1, 'occ.occurrence.treated saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ ENCERRAR: DESFECHO OBRIGATÓRIO, PERMISSÃO PRÓPRIA, TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o desfecho é obrigatório; o Beta não encerra; encerrada é história ==='

do $$
declare
  v_id uuid; v_beta uuid; v_erro text; v_by uuid; v_n int;
begin
  set local role authenticated;

  -- O Beta (sem close) não encerra a dele.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_beta from occ.occurrences
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  begin
    perform occ.close_occurrence(v_beta, 'tudo certo');
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: encerrou sem close');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert21(
      v_erro like '%occ.occurrence.close%',
      '⭐ sem close não se encerra — com o nome da permissão no erro');
  end;

  -- O Alfa: sem desfecho, não passa; com desfecho, carimba.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id from occ.occurrences
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    perform occ.close_occurrence(v_id, '   ');
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: encerrou sem desfecho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert21(v_erro like '%desfecho%', '⭐ encerrar exige o desfecho escrito');
  end;

  perform occ.close_occurrence(v_id, 'vazamento reparado; piso seco; laudo arquivado');

  select closed_by into v_by from occ.occurrences where id = v_id;
  perform pg_temp.assert21(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ o encerramento carimbou QUEM — pelo servidor');

  -- Encerrada: não trata, não reencerra, não se edita nem o desfecho.
  begin
    insert into occ.treatments (tenant_id, occurrence_id, action_taken)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'tratativa tardia');
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: tratou a encerrada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert21(v_erro like '%ocorrência nova%', 'encerrada não recebe tratativa');
  end;

  reset role;
  begin
    update occ.occurrences set outcome = 'desfecho reescrito' where id = v_id;
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: reescreveu o desfecho como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert21(v_erro like '%nem o desfecho%', '⭐ encerrada é história inteira — nem o desfecho se edita');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'occ.occurrence.closed';
  perform pg_temp.assert21(v_n = 1, 'occ.occurrence.closed saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE NEM PARA O DONO; A CANETA NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o livro é eterno; emit_event não é concedida ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  -- Nem o dono apaga do livro.
  begin
    delete from occ.occurrences where title = 'Queda no pátio';
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: dono apagou ocorrência');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert21(v_erro like '%eterno%', '⭐ ocorrência não se apaga nem como dono do banco');
  end;

  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from occ.occurrences
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  begin
    delete from occ.occurrences where id = v_id;
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: cliente apagou ocorrência');
  exception when insufficient_privilege then
    perform pg_temp.assert21(true, 'o cliente não tem porta de DELETE');
  end;

  begin
    perform occ.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'occ.occurrence.registered', '{}'::jsonb);
    perform pg_temp.assert21(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert21(true, 'occ.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 16 OK: registro eterno, tratativa eterna, desfecho obrigatório, tenants isolados ==='
