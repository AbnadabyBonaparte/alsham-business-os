-- =============================================================================
-- O MÓDULO 5 NO BANCO — isolamento, unicidade, transições e a DIVERGÊNCIA
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` (tenants Alfa e Beta, três usuários) e
-- de `04_install_module.sql` (que troca o papel do `user-a` — ver a MONTAGEM).
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:** os testes do
-- pacote provam a LÓGICA. Este prova o EFEITO no banco, inclusive:
--
--   1. o isolamento entre tenants, com a MESMA referência nos dois;
--   2. a unicidade da referência dentro do tenant;
--   3. as transições recusadas pelo gatilho — inclusive `received → cancelled`;
--   4. quem não tem `ar.receivable.cancel` não cancela, nem por SQL direto;
--   5. ⭐⭐ **RECEBER A MAIOR PASSA** — a divergência do módulo, provada contra
--      o `check` de verdade e não contra a intenção;
--   6. e, do outro lado do espelho, **PAGAR a maior continua sendo RECUSADO**
--      no `ap`. O contraste é o teste: as duas afirmações rodam no mesmo
--      arquivo, contra o mesmo banco.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert7(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: o módulo de Contas a Receber nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ar', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ar', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A concessão passa por `core.memberships`, e não por um papel escrito à
-- mão: o teste 04 troca o vínculo do `user-a`, e um fixture que escrevesse
-- `admin` concederia a um papel que o usuário não tem mais. Lição da Etapa 10.
--
-- ⚠️ `user-a` (Alfa) ganha as DUAS; `user-b` (Beta) ganha só `manage`. É a
-- assimetria que prova, no cenário 4, que registrar e cancelar são atos
-- separados de verdade.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ar.receivable.manage', 'ar'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ar.receivable.cancel', 'ar'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa pode cancelar.'

-- =============================================================================
-- CENÁRIO 1 — O TÍTULO NASCE E O FATO SAI, AUTOSSUFICIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: registrar emite o evento com payload completo ==='

do $$
declare v_payload jsonb; v_n int; v_produtor text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- user-a, Alfa

  insert into ar.receivables
    (tenant_id, external_ref, due_date, amount_cents, currency, payer_name, description)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-R-0001', '2026-09-10',
     150000, 'BRL', 'Contraparte Alfa', 'serviço prestado');

  reset role;

  select count(*) into v_n from core.event_outbox
   where event_type = 'ar.receivable.registered'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert7(v_n = 1, 'o insert emitiu exatamente um ar.receivable.registered');

  select payload, produced_by into v_payload, v_produtor from core.event_outbox
   where event_type = 'ar.receivable.registered'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  perform pg_temp.assert7(v_produtor = 'ar', 'o envelope carrega a procedência');
  perform pg_temp.assert7(v_payload ? 'externalRef',          'payload traz externalRef');
  perform pg_temp.assert7(v_payload ? 'dueDate',              'payload traz dueDate');
  perform pg_temp.assert7(v_payload ? 'amountCents',          'payload traz amountCents');
  perform pg_temp.assert7(v_payload ? 'receivedAmountCents',  'payload traz receivedAmountCents');
  perform pg_temp.assert7(v_payload ? 'currency',             'payload traz currency');
  perform pg_temp.assert7(v_payload ? 'payerName',            'payload traz payerName');
  perform pg_temp.assert7(
    v_payload ? 'counterpartyTaxId',
    'payload traz counterpartyTaxId — o MESMO nome do recon e do ap');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⛔ O ISOLAMENTO, COM A MESMA REFERÊNCIA NOS DOIS TENANTS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o mesmo DOC-R-0001 em dois tenants não se mistura ==='

do $$
declare v_alfa bigint; v_beta bigint; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- user-b, Beta

  -- ⚠️ A MESMA referência do Alfa, de propósito: referência é string escolhida
  -- pelo tenant. Se o isolamento dependesse de a string ser única no mundo, ele
  -- não seria isolamento.
  insert into ar.receivables
    (tenant_id, external_ref, due_date, amount_cents, currency, description)
  values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'DOC-R-0001', '2026-09-10',
     999000, 'BRL', 'título do vizinho');

  select amount_cents into v_beta from ar.receivables;
  select count(*) into v_n from ar.receivables;
  perform pg_temp.assert7(v_n = 1, 'user-b enxerga só o título do próprio tenant');
  perform pg_temp.assert7(v_beta = 999000, 'e é o dele mesmo');

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- user-a, Alfa
  select amount_cents into v_alfa from ar.receivables;
  select count(*) into v_n from ar.receivables;
  perform pg_temp.assert7(v_n = 1, 'o espelho vale: o Alfa só vê o Alfa');
  perform pg_temp.assert7(v_alfa = 150000, 'e o valor é o dele');
end $$;

-- =============================================================================
-- CENÁRIO 3 — A UNICIDADE DA REFERÊNCIA DENTRO DO TENANT
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o mesmo documento não entra duas vezes no tenant ==='

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into ar.receivables
      (tenant_id, external_ref, due_date, amount_cents, currency)
    values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-R-0001', '2026-10-01', 1000, 'BRL');
    v_erro := null;
  exception when unique_violation then v_erro := 'recusado'; end;

  perform pg_temp.assert7(v_erro = 'recusado', 'a referência repetida é recusada no tenant');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⛔ QUEM NÃO PODE CANCELAR, NÃO CANCELA — NEM POR SQL DIRETO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: registrar e cancelar são atos separados de verdade ==='

do $$
declare v_erro text; v_status text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- user-b, só manage

  -- Editar ele PODE — tem `ar.receivable.manage`.
  update ar.receivables set description = 'corrigido'
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  begin
    update ar.receivables set status = 'cancelled'
     where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    v_erro := null;
  exception when others then v_erro := SQLSTATE; end;

  perform pg_temp.assert7(
    v_erro = '42501',
    'cancelar sem ar.receivable.cancel é recusado (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');

  reset role;
  select status into v_status from ar.receivables
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  perform pg_temp.assert7(v_status = 'open', 'o título do Beta continua aberto');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐⭐ A DIVERGÊNCIA: RECEBER A MAIOR PASSA
-- -----------------------------------------------------------------------------
-- A decisão mais importante do módulo, provada contra o `check` de verdade.
-- Ver `0010_ar.sql` §2.1: o dinheiro já entrou, e recusar obrigaria o operador
-- a registrar menos do que recebeu.
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: receber a maior passa, e o estado continua "recebido" ==='

do $$
declare v_status text; v_recebido bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into ar.receivables
    (tenant_id, external_ref, due_date, amount_cents, received_amount_cents, currency, status)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-R-MAIOR', '2026-08-01',
     250000, 253000, 'BRL', 'received');

  reset role;

  select status, received_amount_cents into v_status, v_recebido
    from ar.receivables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-R-MAIOR';

  perform pg_temp.assert7(v_status = 'received', 'o estado continua "recebido"');
  perform pg_temp.assert7(v_recebido = 253000, '⭐ e o excedente foi gravado como entrou');
end $$;

-- ⭐⭐ E O OUTRO LADO DO ESPELHO, no mesmo banco e no mesmo arquivo.
--
-- Pagar a maior é erro de quem paga, e o sistema que paga recusa. Se algum dia
-- alguém "uniformizar" os dois módulos — tirando a constraint do `ap` ou pondo
-- uma no `ar` —, um destes dois cenários quebra.
\echo ''
\echo '=== CENÁRIO 5.1: e PAGAR a maior continua sendo recusado, no ap ==='

do $$
declare v_erro text;
begin
  -- Como dono do banco: aqui não é a RLS que tem de barrar, é a constraint.
  begin
    insert into ap.payables
      (tenant_id, external_ref, due_date, amount_cents, settled_amount_cents, currency, status)
    values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-P-MAIOR', '2026-08-01',
       250000, 253000, 'BRL', 'settled');
    v_erro := null;
  exception when check_violation then v_erro := 'recusado'; end;

  perform pg_temp.assert7(
    v_erro = 'recusado',
    '⛔ o ap recusa pagar a maior — o contraste que faz o espelho ser consciente');
end $$;

-- =============================================================================
-- CENÁRIO 6 — ⛔ AS TRANSIÇÕES QUE NÃO EXISTEM
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: recebido não se cancela; cancelado é terminal ==='

do $$
declare v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⛔ `received → cancelled` não existe: cancelar um título recebido apagaria
  -- a fronteira entre "não tínhamos a receber" e "recebemos o dinheiro".
  begin
    update ar.receivables set status = 'cancelled'
     where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-R-MAIOR';
    v_erro := null;
  exception when others then v_erro := SQLSTATE; end;

  perform pg_temp.assert7(
    v_erro = '22023',
    'cancelar título recebido é recusado (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');

  -- E o caminho honesto existe: estorna primeiro.
  update ar.receivables set status = 'open', received_amount_cents = 0
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-R-MAIOR';
  update ar.receivables set status = 'cancelled'
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-R-MAIOR';

  -- ⛔ E cancelado é terminal.
  begin
    update ar.receivables set status = 'open'
     where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-R-MAIOR';
    v_erro := null;
  exception when others then v_erro := SQLSTATE; end;

  perform pg_temp.assert7(
    v_erro = '22023',
    'ressuscitar título cancelado é recusado (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');

  reset role;
  select count(*) into v_n from ar.receivables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-R-MAIOR';
  perform pg_temp.assert7(v_n = 1, 'o título cancelado continua na tabela — cancelar é status');
end $$;

-- =============================================================================
-- CENÁRIO 7 — ⛔ NINGUÉM EMITE EVENTO À MÃO, E O CINTO SEGURA O TIPO ERRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: a porta de saída é do módulo, não do cliente ==='

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform ar.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ar.receivable.registered', '{}'::jsonb);
    v_erro := null;
  exception when insufficient_privilege then v_erro := 'negado'; end;

  perform pg_temp.assert7(
    v_erro = 'negado',
    'usuário autenticado não emite evento à mão (recebido: ' || coalesce(v_erro, 'emitiu!') || ')');

  reset role;

  -- E o cinto: nem o dono do banco emite um tipo que não é deste módulo.
  begin
    perform ar.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap.payable.registered', '{}'::jsonb);
    v_erro := null;
  exception when others then v_erro := SQLERRM; end;

  perform pg_temp.assert7(
    v_erro is not null,
    'o cinto recusa tipo de outro módulo: ' || coalesce(v_erro, 'PASSOU!'));
end $$;

\echo ''
\echo '✅ O MÓDULO 5 ESTÁ DE PÉ: dois tenants isolados, referência única,'
\echo '   transições guardadas — e a divergência provada contra o ap, no mesmo banco.'
