-- =============================================================================
-- O MÓDULO 13 NO BANCO — termos congelados, atos imutáveis, fim por calendário
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. dois tenants com a MESMA referência não se veem nem colidem;
--   2. ⭐ **entrar em vigor exige o essencial** — contraparte e início;
--   3. ⭐ **os termos CONGELAM em vigor**: valor não se edita na coluna —
--      muda por REAJUSTE, contra o gatilho real;
--   4. ⭐ **o reajuste é ato com permissão própria (`amend`, assimetria
--      user-a × user-b), livro imutável até para o dono do banco, e o
--      valor anterior é o VIGENTE** (original ou último reajuste);
--   5. ⭐ **a renovação ESTENDE o MESMO contrato** — encurtar é recusado,
--      e o encerramento por prazo passa a respeitar o fim RENOVADO;
--   6. ⭐ **encerrar é calendário; rescindir exige razão e `decide`** — e
--      os fins são terminais de verdade;
--   7. apagar não existe; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert18(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Contratos nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ctr', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ctr', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as TRÊS permissões;
-- `user-b` (Beta) recebe SÓ `manage` — nem `amend`, nem `decide`.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ctr.contract.manage', 'ctr'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'ctr'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('ctr.contract.amend'), ('ctr.contract.decide')) as p(k)
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa reajusta e decide.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, REFERÊNCIA E O ESSENCIAL DO VIGOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: referência do tenant; vigor exige contraparte e início ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into ctr.contracts (tenant_id, external_ref, title)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CTR-0001', 'Prestação de serviços')
  returning id into v_id;

  begin
    insert into ctr.contracts (tenant_id, external_ref, title)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CTR-0001', 'Outro');
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: referência duplicada no tenant');
  exception when unique_violation then
    perform pg_temp.assert18(true, 'referência duplicada no MESMO tenant é recusada');
  end;

  -- Sem contraparte e sem início, não entra em vigor.
  begin
    update ctr.contracts set status = 'active' where id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: entrou em vigor sem contraparte');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(v_erro like '%contraparte%', 'sem contraparte não há vigor');
  end;

  update ctr.contracts
     set counterparty_name = 'Contraparte Alfa', starts_on = current_date - 30,
         ends_on = current_date + 335, value_cents = 500000, currency = 'BRL'
   where id = v_id;
  update ctr.contracts set status = 'active' where id = v_id;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into ctr.contracts (tenant_id, external_ref, title, counterparty_name, starts_on)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'CTR-0001', 'Fornecimento', 'Contraparte Beta', current_date);

  select count(*) into v_n from ctr.contracts;
  perform pg_temp.assert18(v_n = 1, 'o Beta enxerga só o contrato dele');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'ctr.contract.activated';
  perform pg_temp.assert18(v_n = 1, 'ctr.contract.activated saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ OS TERMOS CONGELAM EM VIGOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: valor de contrato em vigor não se edita na coluna ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from ctr.contracts
   where external_ref = 'CTR-0001' and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  begin
    update ctr.contracts set value_cents = 999999 where id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: editou valor em vigor');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(v_erro like '%REAJUSTE%', '⭐ valor em vigor muda só por reajuste');
  end;

  begin
    update ctr.contracts set ends_on = current_date + 999 where id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: editou o fim em vigor');
  exception when others then
    perform pg_temp.assert18(true, '⭐ prazo em vigor muda só por renovação');
  end;

  -- Anotação não é termo: description continua editável.
  update ctr.contracts set description = 'reunião de alinhamento em 30/07' where id = v_id;
  perform pg_temp.assert18(true, 'a anotação continua editável — anotação não é termo');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O REAJUSTE: PERMISSÃO PRÓPRIA, LIVRO IMUTÁVEL, VALOR VIGENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: reajuste é ato com amend; o livro não se edita ==='

do $$
declare
  v_id uuid; v_beta uuid; v_erro text; v_prev bigint; v_n int; v_cur bigint;
begin
  set local role authenticated;

  -- O Beta (sem amend) não reajusta o contrato DELE.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_beta from ctr.contracts
   where external_ref = 'CTR-0001' and tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  update ctr.contracts set value_cents = 100000, currency = 'BRL' where id = v_beta;
  update ctr.contracts set status = 'active' where id = v_beta;

  begin
    perform ctr.register_adjustment(v_beta, current_date, 'IGP-M', 110000, '');
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: reajustou sem amend');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(
      v_erro like '%ctr.contract.amend%',
      '⭐ sem amend não se reajusta — com o nome da permissão no erro');
  end;

  -- O Alfa reajusta o dele duas vezes: o anterior do segundo é o VIGENTE.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id from ctr.contracts
   where external_ref = 'CTR-0001' and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  begin
    perform ctr.register_adjustment(v_id, current_date, '', 550000, '');
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: reajuste sem índice');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(v_erro like '%linha muda%', 'reajuste sem índice é a linha muda — recusado');
  end;

  perform ctr.register_adjustment(v_id, current_date - 10, 'IGP-M', 550000, 'reajuste anual');
  perform ctr.register_adjustment(v_id, current_date, 'acordo comercial', 525000, 'desconto negociado');

  select previous_value_cents into v_prev
    from ctr.adjustments
   where contract_id = v_id
   order by adjusted_on desc, registered_at desc limit 1;
  perform pg_temp.assert18(v_prev = 550000, '⭐ o valor anterior do 2º reajuste é o VIGENTE, não o original');

  select current_value_cents into v_cur from ctr.contract_terms where id = v_id;
  perform pg_temp.assert18(v_cur = 525000, '⭐ o termo vigente é consequência calculada — nunca coluna');

  -- O livro é imutável ATÉ PARA O DONO DO BANCO.
  reset role;
  begin
    update ctr.adjustments set new_value_cents = 1 where contract_id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: editou reajuste como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(v_erro like '%fato consumado%', '⭐ reajuste não se edita nem como dono do banco');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'ctr.contract.adjusted';
  perform pg_temp.assert18(v_n = 2, 'ctr.contract.adjusted saiu duas vezes');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ A RENOVAÇÃO ESTENDE O MESMO CONTRATO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: renovar estende; encurtar é recusado; o calendário respeita ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Um contrato VENCIDO há 10 dias, em vigor.
  insert into ctr.contracts (tenant_id, external_ref, title, counterparty_name, starts_on, ends_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CTR-VENCIDO', 'Locação de equipamento',
          'Contraparte Alfa', current_date - 375, current_date - 10)
  returning id into v_id;
  update ctr.contracts set status = 'active' where id = v_id;

  -- Encurtar não é renovação.
  begin
    perform ctr.renew_contract(v_id, current_date - 30, '');
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: renovação encurtou o prazo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(v_erro like '%ESTENDE%', 'renovar ESTENDE — encurtar é rescisão, não renovação');
  end;

  -- Renovado para o futuro: o encerramento por prazo passa a ser recusado.
  perform ctr.renew_contract(v_id, current_date + 355, 'renovação anual');

  begin
    update ctr.contracts set status = 'ended' where id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: encerrou contrato renovado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(
      v_erro like '%ainda não venceu%',
      '⭐ o encerramento respeita o fim RENOVADO — calendário, nunca vontade');
  end;

  -- A renovação é imutável até para o dono.
  reset role;
  begin
    delete from ctr.renewals where contract_id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: apagou renovação como dono');
  exception when others then
    perform pg_temp.assert18(true, '⭐ renovação não se apaga nem como dono do banco');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'ctr.contract.renewed';
  perform pg_temp.assert18(v_n = 1, 'ctr.contract.renewed saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐ ENCERRAR É CALENDÁRIO; RESCINDIR EXIGE RAZÃO E DECIDE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: fim natural com prazo vencido; rescisão com razão ==='

do $$
declare
  v_id uuid; v_erro text; v_by uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Vencido e sem renovação: encerra, com carimbo do servidor.
  insert into ctr.contracts (tenant_id, external_ref, title, counterparty_name, starts_on, ends_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CTR-FIM', 'Manutenção anual',
          'Contraparte Alfa', current_date - 400, current_date - 5)
  returning id into v_id;
  update ctr.contracts set status = 'active' where id = v_id;
  update ctr.contracts set status = 'ended' where id = v_id;

  select decided_by into v_by from ctr.contracts where id = v_id;
  perform pg_temp.assert18(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ o encerramento carimbou QUEM — pelo servidor');

  -- Terminal é terminal.
  begin
    update ctr.contracts set status = 'active' where id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: contrato encerrado voltou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(v_erro like '%documento novo%', '⭐ encerrado não volta: o que recomeça é documento novo');
  end;

  -- Contrato SEM FIM não se encerra por prazo — rescinde-se, com razão.
  insert into ctr.contracts (tenant_id, external_ref, title, counterparty_name, starts_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CTR-SEM-FIM', 'Assessoria contínua',
          'Contraparte Alfa', current_date - 100)
  returning id into v_id;
  update ctr.contracts set status = 'active' where id = v_id;

  begin
    update ctr.contracts set status = 'ended' where id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: encerrou contrato sem fim');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(v_erro like '%rescinda%', 'contrato sem fim não acaba por prazo — rescinde-se');
  end;

  begin
    update ctr.contracts set status = 'terminated' where id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: rescindiu sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert18(v_erro like '%razão%', '⭐ rescindir exige a razão');
  end;

  update ctr.contracts
     set status = 'terminated', outcome_reason = 'distrato consensual — mudança de sede'
   where id = v_id;
  perform pg_temp.assert18(true, 'com razão, a rescisão passa');

  -- O Beta (sem decide) não rescinde o dele.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_id from ctr.contracts
   where external_ref = 'CTR-0001' and tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  begin
    update ctr.contracts set status = 'terminated', outcome_reason = 'x' where id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: rescindiu sem decide');
  exception when insufficient_privilege then
    perform pg_temp.assert18(true, 'sem ctr.contract.decide não se rescinde');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'ctr.contract.terminated';
  perform pg_temp.assert18(v_n = 1, 'ctr.contract.terminated saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 6 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: apagar não existe; emit_event não é concedida ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  select id into v_id from ctr.contracts
   where external_ref = 'CTR-0001' and tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  begin
    delete from ctr.contracts where id = v_id;
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: apagou contrato');
  exception when insufficient_privilege then
    perform pg_temp.assert18(true, 'apagar contrato não existe — o desfecho é status');
  end;

  begin
    perform ctr.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ctr.contract.updated', '{}'::jsonb);
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert18(true, 'ctr.emit_event não é concedida ao cliente');
  end;

  begin
    insert into ctr.adjustments (tenant_id, contract_id, adjusted_on, index_name, previous_value_cents, new_value_cents)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_id, current_date, 'IPCA', 1, 2);
    perform pg_temp.assert18(false, 'DEVERIA TER FALHADO: escreveu no livro direto');
  exception when insufficient_privilege then
    perform pg_temp.assert18(true, 'o livro de reajustes só se escreve pelo ATO');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 13 OK: termos congelados, atos imutáveis, calendário honesto, tenants isolados ==='
