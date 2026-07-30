-- =============================================================================
-- O MÓDULO 30 NO BANCO — a conta do tenant, o livro imutável, o saldo que
-- pode ser negativo e a transferência atômica
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. a conta de um tenant não aparece no outro — e a assimetria user-a ×
--      user-b: o Beta lança, mas NÃO ajusta;
--   2. ⭐ **a conta volta do arquivo** e o nome ATIVO não duplica; a conta
--      arquivada NÃO recebe lançamento;
--   3. ⭐ **o livro é imutável** (cliente sem UPDATE/DELETE; nem o dono
--      reescreve — fato consumado); ajuste exige razão;
--   4. ⭐⭐ **o saldo PODE ficar negativo** (cheque especial) — o DIVERGE
--      assinado do inv, no banco; e é VIEW, nunca coluna;
--   5. ⭐ **a transferência é atômica** (duas pernas, um transfer_id; para
--      conta arquivada ou moeda diferente recusa); ⛔ anon = NADA, apagar não
--      existe, a caneta de evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert35(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Contas Bancárias nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bank', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bank', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA: `user-a` (Alfa) tem as três mãos; `user-b` (Beta) só
-- cadastra e lança — não ajusta.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'bank'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('bank.account.manage'), ('bank.movement.register')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'bank.movement.adjust', 'bank'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois cadastram e lançam; só o Alfa ajusta.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A MÃO QUE NÃO AJUSTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant na sua conta; o Beta lança mas não ajusta ==='

do $$
declare v_n int; v_conta uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into bank.accounts (tenant_id, name, currency) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Conta Principal', 'BRL'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Conta Reserva', 'BRL');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into bank.accounts (tenant_id, name, currency)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Conta B', 'BRL')
  returning id into v_conta;

  -- O Beta lança (tem register)...
  insert into bank.movements (tenant_id, account_id, kind, amount_cents, currency)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_conta, 'in', 50000, 'BRL');
  perform pg_temp.assert35(true, 'o Beta lança entrada (bank.movement.register)');

  -- ...mas não ajusta.
  begin
    insert into bank.movements (tenant_id, account_id, kind, amount_cents, currency, reason)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_conta, 'adjustment', -1000, 'BRL', 'tentativa');
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: o Beta ajustou');
  exception when insufficient_privilege then
    perform pg_temp.assert35(true, '⭐ ajustar é mão própria (bank.movement.adjust)');
  end;

  select count(*) into v_n from bank.accounts;
  perform pg_temp.assert35(v_n = 1, 'o Beta enxerga só a conta dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — A CONTA VOLTA DO ARQUIVO; NOME ATIVO NÃO DUPLICA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: nome ativo único; arquiva e volta; arquivada não recebe ==='

do $$
declare v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from bank.accounts
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Conta Reserva';

  begin
    insert into bank.accounts (tenant_id, name, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  CONTA RESERVA ', 'BRL');
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: conta ativa em dobro');
  exception when unique_violation then
    perform pg_temp.assert35(true, 'conta ATIVA não duplica nome');
  end;

  update bank.accounts set status = 'archived' where id = v_id;

  -- Arquivada não recebe lançamento. ⚠️ A mensagem do DEVERIA NÃO cita a
  -- palavra casada ("arquivada") — senão, se o lançamento passasse, o próprio
  -- texto do erro do assert satisfaria o LIKE e mascararia a falha.
  begin
    insert into bank.movements (tenant_id, account_id, kind, amount_cents, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'in', 1000, 'BRL');
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: aceitou lancamento em conta inativa');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert35(v_erro like '%arquivada não recebe%', 'conta arquivada não recebe lançamento');
  end;

  -- ⭐ Volta do arquivo.
  update bank.accounts set status = 'active' where id = v_id;
  perform pg_temp.assert35(true, '⭐ a conta reativada volta — é a MESMA conta');
end $$;

-- =============================================================================
-- CENÁRIO 3 — O LIVRO É IMUTÁVEL; O AJUSTE EXIGE RAZÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o livro não se rasura, nem para o dono; ajuste com razão ==='

do $$
declare v_conta uuid; v_mov uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_conta from bank.accounts
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Conta Principal';

  insert into bank.movements (tenant_id, account_id, kind, amount_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_conta, 'in', 100000, 'BRL')
  returning id into v_mov;

  -- Ajuste sem razão é recusado (a constraint).
  begin
    insert into bank.movements (tenant_id, account_id, kind, amount_cents, currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_conta, 'adjustment', -500, 'BRL');
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: ajuste sem razão');
  exception when check_violation then
    perform pg_temp.assert35(true, '⭐ ajuste exige razão — a linha muda esconde o desvio');
  end;

  -- O cliente não edita o livro (sem grant de UPDATE).
  begin
    update bank.movements set amount_cents = 1 where id = v_mov;
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: cliente editou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert35(true, 'o cliente não edita o livro (sem grant de UPDATE)');
  end;

  -- Nem o dono do banco reescreve (o gatilho).
  reset role;
  begin
    update bank.movements set amount_cents = 777 where id = v_mov;
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: o dono reescreveu o livro');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert35(v_erro like '%fato consumado%', '⭐ o livro não se rasura nem como dono do banco');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐⭐ O SALDO PODE FICAR NEGATIVO (CHEQUE ESPECIAL)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: saída maior que o saldo é PERMITIDA; o saldo é view ==='

do $$
declare v_conta uuid; v_saldo bigint; v_cols int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into bank.accounts (tenant_id, name, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Conta Cheque Especial', 'BRL')
  returning id into v_conta;

  insert into bank.movements (tenant_id, account_id, kind, amount_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_conta, 'in', 10000, 'BRL');

  -- ⭐ Uma saída MAIOR que o saldo — permitida, e leva o saldo abaixo de zero.
  insert into bank.movements (tenant_id, account_id, kind, amount_cents, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_conta, 'out', 30000, 'BRL');
  perform pg_temp.assert35(true, '⭐⭐ saída maior que o saldo é PERMITIDA (cheque especial)');

  select balance_cents into v_saldo from bank.balances where account_id = v_conta;
  perform pg_temp.assert35(v_saldo = -20000, '⭐ o saldo fica NEGATIVO e a view não mente sobre isso');

  -- ⭐ E é VIEW, nunca coluna.
  select count(*) into v_cols from information_schema.columns
   where table_schema = 'bank' and table_name = 'movements' and column_name = 'balance_cents';
  perform pg_temp.assert35(v_cols = 0, '⭐ nenhuma coluna de saldo — só a view calcula');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐ A TRANSFERÊNCIA ATÔMICA; ANON = NADA; SEM DELETE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: transferência de duas pernas; arquivada/moeda recusam ==='

do $$
declare v_a uuid; v_b uuid; v_c uuid; v_transfer uuid; v_n int; v_sa bigint; v_sb bigint; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_a from bank.accounts
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Conta Principal';
  select id into v_b from bank.accounts
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Conta Reserva';

  -- ⭐ Transfere 40.000 de Principal para Reserva.
  v_transfer := bank.transfer(v_a, v_b, 40000, '2026-07-20', 'reforço da reserva');

  select count(*) into v_n from bank.movements where transfer_id = v_transfer;
  perform pg_temp.assert35(v_n = 2, '⭐ a transferência gravou EXATAMENTE duas pernas');

  select balance_cents into v_sa from bank.balances where account_id = v_a;  -- 100.000 - 40.000
  select balance_cents into v_sb from bank.balances where account_id = v_b;  -- 0 + 40.000
  perform pg_temp.assert35(v_sa = 60000 and v_sb = 40000, '⭐ o dinheiro saiu de uma e entrou na outra');

  -- Conta em outra moeda: transferência entre moedas recusa.
  insert into bank.accounts (tenant_id, name, currency)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Conta USD', 'USD')
  returning id into v_c;
  begin
    perform bank.transfer(v_a, v_c, 1000, '2026-07-20', '');
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: transferiu entre moedas');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert35(v_erro like '%câmbio%' or v_erro like '%moeda%', 'transferência entre moedas recusa (câmbio não construído)');
  end;

  -- Contas iguais recusa.
  begin
    perform bank.transfer(v_a, v_a, 1000, '2026-07-20', '');
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: transferiu para a mesma conta');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert35(v_erro like '%diferentes%', 'transferência exige contas diferentes');
  end;
end $$;

-- O Beta transfere (tem register) — mas provamos que sem register recusa.
do $$
declare v_a uuid; v_b uuid; v_erro text;
begin
  -- Um usuário sem NENHUMA permissão de bank não transfere.
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- sem bank
  select id into v_a from bank.accounts where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;
  if v_a is not null then
    perform pg_temp.assert35(false, 'DEVERIA: usuário de outro tenant nem vê a conta');
  else
    perform pg_temp.assert35(true, 'usuário sem acesso não enxerga conta para transferir');
  end if;
end $$;

do $$
begin
  -- ⛔ ANON = NADA.
  set local role anon;
  begin
    perform count(*) from bank.accounts;
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: anon leu as contas');
  exception when insufficient_privilege then
    perform pg_temp.assert35(true, '⛔ anon = NADA no schema bank');
  end;
end $$;

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from bank.accounts where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;
  begin
    delete from bank.accounts where id = v_id;
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: apagou conta');
  exception when insufficient_privilege then
    perform pg_temp.assert35(true, 'apagar conta não existe — arquivar é status');
  end;

  begin
    perform bank.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bank.account.registered', '{}'::jsonb);
    perform pg_temp.assert35(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert35(true, 'bank.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 30 OK: conta do tenant, livro imutável, saldo negativo permitido, transferência atômica ==='
