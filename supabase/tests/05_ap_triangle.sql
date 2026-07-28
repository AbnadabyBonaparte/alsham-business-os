-- =============================================================================
-- ⭐ O TRIÂNGULO DO LEGO — o Módulo 3 emite, o Módulo 1 projeta
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` (tenants Alfa e Beta, três usuários) e
-- de `04_install_module.sql` (que deixou o Alfa com módulo instalado de
-- verdade, por `core.install_module`).
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript e os do
-- `apps/api`:** aqueles provam a LÓGICA e o CAMINHO. Este prova as coisas que
-- só o banco pode garantir:
--
--   1. o título registrado por um usuário REAL, sob RLS, emite o evento — e o
--      payload sai AUTOSSUFICIENTE, sem ninguém montar nada à mão;
--   2. a projeção aparece no tenant CERTO e não vaza para o vizinho, mesmo
--      quando os dois usam a MESMA referência de documento;
--   3. a origem gravada é a que veio no envelope, e não uma constante;
--   4. reprojetar o mesmo fato não duplica;
--   5. quem não tem `ap.payable.cancel` não cancela — nem por SQL direto;
--   6. cancelar NÃO apaga o título, e a transição proibida é recusada;
--   7. um usuário real **não consegue** escrever a projeção do outro módulo.
--
-- A sétima é a que dá pesadelo: `recon.record_external_payable` é SECURITY
-- DEFINER, e função SECURITY DEFINER escrita sem cuidado é exatamente como se
-- atravessa a RLS sem perceber.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert5(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: o módulo de Contas a Pagar nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ap', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- As permissões do módulo em papéis DE TENANT — como o instalador faria.
--
-- ⚠️ `user-a` (Alfa) ganha as DUAS; `user-b` (Beta) ganha só `manage`. A
-- assimetria é de propósito: é ela que prova, no cenário 5, que registrar e
-- cancelar são atos separados de verdade, e não só na documentação.
--
-- ⚠️ **A concessão passa por `core.memberships`, e não por um papel escrito à
-- mão** — a primeira versão deste fixture concedia ao papel `admin` de cada
-- tenant e falhou inteira: o teste 04 troca o vínculo do `user-a` para o papel
-- `dono-do-tenant` quando prova quem pode instalar. As permissões foram para um
-- papel que aquele usuário não tem mais, e o insert do cenário 1 morreu na RLS.
--
-- Escrever o papel à mão é presumir a montagem de outro arquivo. Perguntar ao
-- vínculo é ler o estado que existe — e continua valendo se um teste futuro
-- mexer nos papéis de novo.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ap.payable.manage', 'ap'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ap.payable.cancel', 'ap'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa pode cancelar.'

-- =============================================================================
-- CENÁRIO 1 — ⭐ O TÍTULO NASCE E O FATO SAI, AUTOSSUFICIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: registrar um título emite o evento com payload completo ==='

do $$
declare v_payload jsonb; v_produtor text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- user-a, Alfa

  insert into ap.payables
    (tenant_id, external_ref, due_date, amount_cents, currency, supplier_name, description)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-TRI-0001', '2026-09-10',
     150000, 'BRL', 'Fornecedor Alfa', 'serviço prestado');

  reset role;

  select count(*) into v_n
    from core.event_outbox
   where event_type = 'ap.payable.registered'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert5(v_n = 1, 'o insert emitiu exatamente um ap.payable.registered');

  select payload, produced_by into v_payload, v_produtor
    from core.event_outbox
   where event_type = 'ap.payable.registered'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  perform pg_temp.assert5(v_produtor = 'ap', 'o envelope carrega a procedência');

  -- ⭐ AUTOSSUFICIENTE. Quem escuta não pode fazer join: o schema deste módulo
  -- é invisível para ele. Se faltar um campo, o consumidor fica com um id que
  -- não sabe resolver, e a única saída seria ler a tabela alheia.
  perform pg_temp.assert5(v_payload ? 'externalRef',  'payload traz externalRef');
  perform pg_temp.assert5(v_payload ? 'dueDate',      'payload traz dueDate');
  perform pg_temp.assert5(v_payload ? 'amountCents',  'payload traz amountCents');
  perform pg_temp.assert5(v_payload ? 'currency',     'payload traz currency');
  perform pg_temp.assert5(v_payload ? 'status',       'payload traz status');
  perform pg_temp.assert5(v_payload ? 'supplierName', 'payload traz supplierName');
  perform pg_temp.assert5(
    v_payload ? 'counterpartyTaxId',
    'payload traz counterpartyTaxId — nome neutro de país, não "cnpj"');

  perform pg_temp.assert5(
    (v_payload->>'amountCents')::bigint = 150000,
    'o valor no envelope é o valor do título');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A PROJEÇÃO CHEGA NO TENANT CERTO, COM A ORIGEM DO ENVELOPE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o Módulo 1 recebe o título sem conhecer o Módulo 3 ==='

do $$
declare v_payload jsonb; v_efeito text; v_source text; v_origem text;
begin
  select payload into v_payload
    from core.event_outbox
   where event_type = 'ap.payable.registered'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  -- Como o correio faria: `service_role`, do servidor, com o conteúdo do
  -- payload e a procedência tirada do ENVELOPE (`produced_by`), nunca de
  -- constante.
  select recon.record_external_payable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (select produced_by from core.event_outbox
      where event_type = 'ap.payable.registered'
        and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    v_payload->>'externalRef',
    (v_payload->>'dueDate')::date,
    (v_payload->>'amountCents')::bigint,
    (v_payload->>'currency')::char(3),
    v_payload->>'status',
    (v_payload->>'settledAmountCents')::bigint,
    v_payload->>'supplierName',
    v_payload->>'counterpartyTaxId',
    v_payload->>'description'
  ) into v_efeito;

  perform pg_temp.assert5(v_efeito = 'created', 'a primeira projeção cria o título');

  select source, source_module_id into v_source, v_origem
    from recon.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-TRI-0001';

  perform pg_temp.assert5(v_source = 'event', 'a projeção é marcada como vinda de evento');
  perform pg_temp.assert5(v_origem = 'ap',    'a origem gravada é a do envelope');

  -- ⭐ NENHUMA LINHA DO `0002_recon.sql` MUDOU PARA ISTO FUNCIONAR. A tabela
  -- nasceu na Etapa 2 com `source in ('imported','event')` e `source_module_id`
  -- — construída esperando um módulo que ainda não existia.
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ UM SEGUNDO PRODUTOR DO MESMO FORMATO GRAVA A ORIGEM DELE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a procedência não está chumbada em lugar nenhum ==='

do $$
declare v_origem text;
begin
  -- Nenhum módulo chamado `erp-bridge` existe neste repositório, e é o ponto:
  -- se a origem estivesse chumbada no consumidor ou nesta função, esta linha
  -- entraria disfarçada de `ap` e a trilha mentiria sem nunca dar erro.
  perform recon.record_external_payable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'erp-bridge', 'DOC-ERP-0001',
    '2026-10-01', 42000, 'USD', 'open', 0, 'Fornecedor Beta', null, 'importado de fora');

  select source_module_id into v_origem
    from recon.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-ERP-0001';

  perform pg_temp.assert5(v_origem = 'erp-bridge', 'a origem é de quem produziu, não do primeiro');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⛔ O ISOLAMENTO, COM A MESMA REFERÊNCIA NOS DOIS TENANTS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o mesmo DOC-TRI-0001 em dois tenants não se mistura ==='

do $$
declare v_alfa bigint; v_beta bigint; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- user-b, Beta

  -- ⚠️ A MESMA referência do Alfa, de propósito. Referência é string escolhida
  -- pelo tenant: dois clientes podem ter um "DOC-TRI-0001" cada um. Se o
  -- isolamento dependesse de a string ser única no mundo, não seria isolamento.
  insert into ap.payables
    (tenant_id, external_ref, due_date, amount_cents, currency, description)
  values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'DOC-TRI-0001', '2026-09-10',
     999000, 'BRL', 'título do vizinho');

  reset role;

  perform recon.record_external_payable(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ap', 'DOC-TRI-0001',
    '2026-09-10', 999000, 'BRL', 'open', 0, null, null, 'título do vizinho');

  select amount_cents into v_alfa from recon.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-TRI-0001';
  select amount_cents into v_beta from recon.payables
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and external_ref = 'DOC-TRI-0001';

  perform pg_temp.assert5(v_alfa = 150000, 'a projeção do Alfa continua a do Alfa');
  perform pg_temp.assert5(v_beta = 999000, 'a projeção do Beta é a do Beta');

  -- E o usuário do Alfa não enxerga o título do vizinho, nem no schema do
  -- módulo produtor.
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select count(*) into v_n from ap.payables;
  perform pg_temp.assert5(v_n = 1, 'user-a enxerga só o título do próprio tenant');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⛔ QUEM NÃO PODE CANCELAR, NÃO CANCELA — NEM POR SQL DIRETO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: registrar e cancelar são atos separados de verdade ==='

do $$
declare v_erro text; v_status text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- user-b, só `manage`

  begin
    update ap.payables set status = 'cancelled'
     where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
       and external_ref = 'DOC-TRI-0001';
    v_erro := null;
  exception when others then
    v_erro := SQLSTATE;
  end;

  perform pg_temp.assert5(
    v_erro = '42501',
    'cancelar sem ap.payable.cancel é recusado pelo banco (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');

  reset role;
  select status into v_status from ap.payables
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and external_ref = 'DOC-TRI-0001';
  perform pg_temp.assert5(v_status = 'open', 'o título do Beta continua aberto');
end $$;

-- =============================================================================
-- CENÁRIO 6 — ⭐ CANCELAR É ESTADO, NUNCA DELETE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: cancelar não apaga, e o fato sai ==='

do $$
declare v_n int; v_payload jsonb; v_efeito text; v_status text; v_valor bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- user-a, pode cancelar

  update ap.payables set status = 'cancelled'
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and external_ref = 'DOC-TRI-0001';

  reset role;

  -- 1. O título CONTINUA no banco.
  select count(*) into v_n from ap.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-TRI-0001';
  perform pg_temp.assert5(v_n = 1, 'o título cancelado continua na tabela');

  -- 2. O fato saiu — e uma vez só, sem `updated` de carona.
  select count(*) into v_n from core.event_outbox
   where event_type = 'ap.payable.cancelled'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert5(v_n = 1, 'o cancelamento emitiu ap.payable.cancelled');

  select count(*) into v_n from core.event_outbox
   where event_type = 'ap.payable.updated'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert5(
    v_n = 0,
    'o cancelamento NÃO emitiu ap.payable.updated junto — dois eventos para um fato é ruído que o tenant paga');

  -- 3. A projeção acompanha o ESTADO, e o valor não some com ele.
  select payload into v_payload from core.event_outbox
   where event_type = 'ap.payable.cancelled'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select recon.record_external_payable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap', v_payload->>'externalRef',
    (v_payload->>'dueDate')::date, (v_payload->>'amountCents')::bigint,
    (v_payload->>'currency')::char(3), v_payload->>'status',
    (v_payload->>'settledAmountCents')::bigint, v_payload->>'supplierName',
    v_payload->>'counterpartyTaxId', v_payload->>'description') into v_efeito;

  perform pg_temp.assert5(v_efeito = 'updated', 'a projeção do cancelamento muda a linha');

  select status, amount_cents into v_status, v_valor from recon.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-TRI-0001';
  perform pg_temp.assert5(v_status = 'cancelled', 'a projeção ficou cancelada');
  perform pg_temp.assert5(v_valor = 150000, 'o valor continua na projeção');
end $$;

-- =============================================================================
-- CENÁRIO 7 — ⛔ A TRANSIÇÃO QUE NÃO EXISTE É RECUSADA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: cancelado é terminal; liquidado não se cancela ==='

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    update ap.payables set status = 'open'
     where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
       and external_ref = 'DOC-TRI-0001';
    v_erro := null;
  exception when others then
    v_erro := SQLSTATE;
  end;

  perform pg_temp.assert5(
    v_erro = '22023',
    'ressuscitar título cancelado é recusado (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');

  -- E o outro lado da regra: liquidado não se cancela. Estorna primeiro.
  insert into ap.payables
    (tenant_id, external_ref, due_date, amount_cents, settled_amount_cents,
     currency, status, description)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-TRI-0002', '2026-08-01',
     50000, 50000, 'BRL', 'settled', 'título já pago');

  begin
    update ap.payables set status = 'cancelled'
     where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
       and external_ref = 'DOC-TRI-0002';
    v_erro := null;
  exception when others then
    v_erro := SQLSTATE;
  end;

  perform pg_temp.assert5(
    v_erro = '22023',
    'cancelar título liquidado é recusado (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');
end $$;

-- =============================================================================
-- CENÁRIO 8 — ⭐ REPROJETAR O MESMO FATO NÃO DUPLICA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 8: a idempotência é do banco, não da promessa ==='

do $$
declare v_efeito text; v_n int;
begin
  -- O correio garante *ao menos uma vez*, nunca *exatamente uma vez*.
  -- Reprocessamento manual, restauração de backup e `dead` ressuscitado à mão
  -- reentregam o mesmo fato — e projetar duas vezes tem de dar o mesmo
  -- resultado que projetar uma.
  select recon.record_external_payable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap', 'DOC-TRI-0001',
    '2026-09-10', 150000, 'BRL', 'cancelled', 0, 'Fornecedor Alfa', null, 'serviço prestado')
  into v_efeito;

  perform pg_temp.assert5(v_efeito = 'unchanged', 'a reentrega do mesmo fato não muda nada');

  select count(*) into v_n from recon.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-TRI-0001';
  perform pg_temp.assert5(v_n = 1, 'a reentrega não duplicou a projeção');
end $$;

-- =============================================================================
-- CENÁRIO 9 — ⚠️ O QUE UMA PESSOA DIGITOU NÃO É SOBRESCRITO POR EVENTO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 9: mão humana ganha do evento ==='

do $$
declare v_efeito text; v_source text; v_valor bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Um título digitado/importado por gente deste tenant, com uma referência
  -- que um evento vai trazer depois.
  insert into recon.payables
    (tenant_id, source, external_ref, due_date, amount_cents, currency, supplier_name)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'imported', 'DOC-MANUAL-0001',
     '2026-01-01', 777, 'BRL', 'digitado à mão');

  reset role;

  select recon.record_external_payable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap', 'DOC-MANUAL-0001',
    '2026-09-10', 500000, 'BRL', 'open', 0, 'Fornecedor Gama', null, 'do evento')
  into v_efeito;

  perform pg_temp.assert5(v_efeito = 'skipped-imported', 'a projeção recusa sobrescrever o importado');

  select source, amount_cents into v_source, v_valor from recon.payables
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and external_ref = 'DOC-MANUAL-0001';
  perform pg_temp.assert5(v_source = 'imported', 'a linha continua sendo a que a pessoa criou');
  perform pg_temp.assert5(v_valor = 777, 'o evento não sobrescreveu trabalho de gente');
end $$;

-- =============================================================================
-- CENÁRIO 10 — ⛔ UM USUÁRIO REAL NÃO ESCREVE A PROJEÇÃO
-- -----------------------------------------------------------------------------
-- ⭐ O pesadelo desta etapa. `recon.record_external_payable` é SECURITY
-- DEFINER, e função SECURITY DEFINER concedida à toa é como se atravessa a RLS
-- sem perceber. Dar essa caneta à tela deixaria o cliente inventar um título
-- "vindo de outro módulo", com origem FORJADA e forjada por dentro da RLS.
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 10: a caneta da projeção é do correio, não do cliente ==='

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform recon.record_external_payable(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'forjado', 'DOC-FORJADO',
      '2026-12-01', 1, 'BRL', 'open', 0, null, null, null);
    v_erro := null;
  exception when insufficient_privilege then
    v_erro := 'negado';
  end;

  perform pg_temp.assert5(
    v_erro = 'negado',
    'usuário autenticado não executa a porta de projeção (recebido: ' || coalesce(v_erro, 'executou!') || ')');
end $$;

-- =============================================================================
-- CENÁRIO 11 — ⛔ A ORIGEM É OBRIGATÓRIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 11: projetar sem procedência é recusado com nome ==='

do $$
declare v_erro text;
begin
  begin
    perform recon.record_external_payable(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'DOC-SEM-ORIGEM',
      '2026-12-01', 1000, 'BRL', 'open');
    v_erro := null;
  exception when others then
    v_erro := SQLSTATE;
  end;

  -- Errar aqui, com nome, é melhor do que errar lá com número de constraint:
  -- sem origem a linha violaria `payables_source_coherent` de qualquer forma.
  perform pg_temp.assert5(
    v_erro = '22023',
    'sem origem, a projeção recusa (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');
end $$;

\echo ''
\echo '✅ O TRIÂNGULO FECHOU: o Módulo 3 conta, o Módulo 1 escuta, e nenhum dos'
\echo '   dois conhece o outro. Nenhuma linha do 0002_recon.sql mudou para isso.'
