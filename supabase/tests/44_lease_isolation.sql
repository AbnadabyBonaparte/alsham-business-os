-- =============================================================================
-- O MÓDULO 39 NO BANCO — o mapa de locações que se isola, a assimetria entre
-- quem registra a locação e quem só relata as vendas, o encerramento
-- terminal e frozen, e o relatório imutável
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as locações de um tenant não aparecem no outro;
--   2. ⭐ **assimetria**: Alfa tem `lease.agreement.manage` E
--      `lease.report.manage`; Beta só tem `lease.report.manage` — registra
--      vendas mas não cria/encerra locação;
--   3. ⭐ **active → ended é TERMINAL e FROZEN** — exige razão, carimba o
--      servidor, e depois nada na linha muda mais;
--   4. ⭐ **o relatório de vendas é IMUTÁVEL** — update e delete mordidos;
--   5. `contract_id`/`store_id` são IDs SOLTOS — nenhuma FK ao ctr/mall,
--      um id inexistente insere sem erro;
--   6. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta em nenhuma das duas tabelas.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert44(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: lease instalado; Alfa tem as duas permissões, Beta só relata vendas ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lease', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'lease', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'lease.report.manage', 'lease'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ Só o Alfa ganha agreement.manage — o Beta fica só com report.manage.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'lease.agreement.manage', 'lease'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois relatam vendas; só o Alfa registra/encerra locação.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ATIVO E O ID SOLTO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu mapa; a locação nasce ativa; ids soltos ==='

do $$
declare
  v_id uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ O contract_id NÃO existe em ctr nenhum — e insere sem erro: o vínculo
  -- é solto, a integridade daquele dado é do ctr, não daqui.
  insert into lease.agreements (tenant_id, contract_id, contract_ref, store_id, store_name, revenue_share)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'cc000000-0000-4000-8000-000000000099', 'Contrato 042 — Piso L1',
          'ee000000-0000-4000-8000-000000000001', 'Ateliê da Praça',
          '8% sobre vendas')
  returning id into v_id;

  begin
    insert into lease.agreements (tenant_id, contract_id, store_id, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cc000000-0000-4000-8000-000000000098',
            'ee000000-0000-4000-8000-000000000002', 'ended');
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: nasceu encerrada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert44(v_erro like '%nasce ativa%', 'a locação nasce ativa');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select count(*) into v_n from lease.agreements;
  perform pg_temp.assert44(v_n = 0, 'o Beta não enxerga o mapa do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ ASSIMETRIA: O BETA RELATA VENDAS MAS NÃO CRIA/ENCERRA LOCAÇÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o Beta só tem report.manage — cria a própria locação e falha ==='

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  begin
    insert into lease.agreements (tenant_id, contract_id, store_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'cc000000-0000-4000-8000-000000000097',
            'ee000000-0000-4000-8000-000000000003');
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: o Beta registrou locação sem agreement.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert44(true, '⭐ registrar locação exige lease.agreement.manage — o Beta é barrado');
  end;
end $$;

-- Uma locação do tenant do Beta, criada por dono do banco só para o teste
-- seguinte (contorna a RLS deliberadamente — é montagem, não é o Beta agindo).
insert into lease.agreements (tenant_id, contract_id, store_id, store_name)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'cc000000-0000-4000-8000-000000000096',
        'ee000000-0000-4000-8000-000000000004', 'Praça de Alimentação B');

do $$
declare
  v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select id into v_id from lease.agreements
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and store_name = 'Praça de Alimentação B';

  begin
    update lease.agreements set status = 'ended', end_reason = 'teste' where id = v_id;
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: o Beta encerrou sem agreement.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert44(true, '⭐ encerrar exige lease.agreement.manage — o Beta é barrado');
  end;

  -- Mas o Beta REGISTRA relatório de vendas — é a permissão dele.
  insert into lease.sales_reports (tenant_id, agreement_id, competency, reported_amount_cents, currency)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_id, '2026-07-01', 150000, 'BRL');
  perform pg_temp.assert44(true, 'o Beta relata vendas — report.manage basta');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ ENCERRAR É TERMINAL, EXIGE RAZÃO, E FICA FROZEN
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: encerrar exige razão, carimba o servidor, e a linha congela ==='

do $$
declare
  v_id uuid; v_status text; v_ended_at timestamptz; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from lease.agreements
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and store_name = 'Ateliê da Praça';

  begin
    update lease.agreements set status = 'ended' where id = v_id;
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: encerrou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert44(v_erro like '%razão%', '⭐ encerrar exige a razão');
  end;

  update lease.agreements set status = 'ended', end_reason = 'contrato do ctr venceu' where id = v_id;
  select status, ended_at into v_status, v_ended_at from lease.agreements where id = v_id;
  perform pg_temp.assert44(v_status = 'ended' and v_ended_at is not null, 'encerrou, e o servidor carimbou ended_at');

  -- ⭐ Agora a linha inteira está FROZEN — nem editar a anotação funciona.
  begin
    update lease.agreements set revenue_share = 'tentando mudar' where id = v_id;
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: editou locação encerrada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert44(v_erro like '%terminal%', '⭐ locação encerrada é FROZEN — nada nela muda');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'lease.agreement.ended';
  perform pg_temp.assert44(v_n = 1, 'o fato de encerrar saiu');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O RELATÓRIO DE VENDAS É IMUTÁVEL (três camadas)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o relatório de vendas não se edita nem se apaga ==='

do $$
declare
  v_id uuid; v_report uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from lease.agreements
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and store_name = 'Ateliê da Praça';

  insert into lease.sales_reports (tenant_id, agreement_id, competency, reported_amount_cents, currency, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, '2026-06-01', 320000, 'BRL', 'relatado a mão')
  returning id into v_report;

  begin
    update lease.sales_reports set reported_amount_cents = 999999 where id = v_report;
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: editou relatório de vendas');
  exception when insufficient_privilege then
    -- ⭐ Livro imutável: sem grant de UPDATE, a caneta do cliente para na porta
    -- (o gatilho `fato consumado` é a segunda tranca, para o dono do banco).
    perform pg_temp.assert44(true, '⭐ o relatório não se edita — só INSERT,SELECT');
  end;

  begin
    delete from lease.sales_reports where id = v_report;
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: apagou relatório de vendas');
  exception when insufficient_privilege then
    perform pg_temp.assert44(true, '⭐ o relatório não se apaga — só INSERT,SELECT');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'lease.report.recorded';
  perform pg_temp.assert44(v_n >= 1, 'o fato do relatório saiu');
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR LOCAÇÃO NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar locação não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from lease.agreements limit 1;

  begin
    delete from lease.agreements where id = v_id;
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: apagou locação');
  exception when insufficient_privilege then
    perform pg_temp.assert44(true, 'apagar locação não existe — encerrar é status');
  end;

  begin
    perform lease.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lease.agreement.registered', '{}'::jsonb);
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert44(true, 'lease.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from lease.agreements limit 1;
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: anon leu lease.agreements');
  exception when insufficient_privilege then
    perform pg_temp.assert44(true, '⭐ anon não encosta em lease.agreements');
  end;

  begin
    perform 1 from lease.sales_reports limit 1;
    perform pg_temp.assert44(false, 'DEVERIA TER FALHADO: anon leu lease.sales_reports');
  exception when insufficient_privilege then
    perform pg_temp.assert44(true, '⭐ anon não encosta em lease.sales_reports');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 39 OK: camada fina sobre ctr/mall, assimetria, encerrar terminal e frozen, relatório imutável, anon fora ==='
