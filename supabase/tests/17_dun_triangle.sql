-- =============================================================================
-- O MÓDULO 12 NO BANCO — o triângulo da régua: o título chega, o passo
-- executa, a baixa na origem tira sozinho
-- =============================================================================
--
-- Roda depois de `01`, `04` e `07_ar_isolation.sql` (que já exercitou o ar).
--
-- ⭐ **O padrão E10, pela quarta vez:** o produtor de títulos emite; a régua
-- — que ele não conhece — projeta. A "entrega" é simulada como nos testes 05
-- e 08: lê-se o ENVELOPE de `core.event_outbox` e chama-se a porta de
-- projeção com o payload e o `produced_by` DELE, como a composição faria.
--
--   1. ⭐ o título vencido entra na régua com a ORIGEM DO ENVELOPE, e
--      `dun.title.entered` sai;
--   2. a reentrega é idempotente — `unchanged`, sem segundo fato;
--   3. ⭐ um produtor FICTÍCIO (`erp-bridge`) grava a origem DELE — a prova
--      de que nada está chumbado;
--   4. a mesma referência nos dois tenants não se mistura;
--   5. ⭐ a régua é DESENHO DO TENANT (Lei das Etapas, terceira aplicação):
--      só UMA ativa; executar exige `dun.step.execute` (assimetria); o
--      mesmo passo não executa duas vezes; o ato carimba nome e canal;
--   6. título no prazo não se cobra;
--   7. ⭐⭐ a BAIXA NA ORIGEM tira o título da régua SOZINHA — o mesmo fato
--      que o trouxe o leva, `dun.title.left` sai, e o passo é recusado;
--   8. a execução é imutável; a porta de projeção não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert17(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: a Régua nos dois tenants; o ar já está instalado ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dun', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dun', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA: user-a (Alfa) desenha E executa; user-b (Beta) SÓ desenha.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'dun.ruler.design', 'dun'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'dun.step.execute', 'dun'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

-- E o produtor de títulos, para os usuários poderem registrar (o teste 07 já
-- concedeu; reconcede idempotente para este arquivo ser autossuficiente).
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'ar'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('ar.receivable.manage'), ('ar.receivable.cancel')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ⭐ O TRIÂNGULO: o produtor emite, a régua projeta DO ENVELOPE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: o título vencido entra na régua, com a origem do envelope ==='

do $$
declare
  v_env record; v_efeito text; v_row dun.titles; v_n int;
begin
  -- O usuário registra o título VENCIDO no módulo produtor.
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into ar.receivables (tenant_id, external_ref, due_date, amount_cents, currency, payer_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOC-DUN-0001',
          current_date - 10, 100000, 'BRL', 'Devedor Um');

  -- A "entrega": lê-se o ENVELOPE da caixa de saída, como a composição faria.
  reset role;
  select payload, produced_by into v_env
    from core.event_outbox
   where event_type like '%.receivable.registered'
     and payload->>'externalRef' = 'DOC-DUN-0001';

  select dun.record_external_receivable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    v_env.produced_by,                       -- ⭐ a origem VEM DO ENVELOPE
    v_env.payload->>'externalRef',
    (v_env.payload->>'dueDate')::date,
    (v_env.payload->>'amountCents')::bigint,
    (v_env.payload->>'currency')::char(3),
    v_env.payload->>'status',
    (v_env.payload->>'receivedAmountCents')::bigint,
    v_env.payload->>'payerName',
    v_env.payload->>'counterpartyTaxId',
    v_env.payload->>'description'
  ) into v_efeito;

  perform pg_temp.assert17(v_efeito = 'created', 'a projeção criou o título');

  select * into v_row from dun.titles where external_ref = 'DOC-DUN-0001';
  perform pg_temp.assert17(
    v_row.source_module_id = v_env.produced_by,
    '⭐ a origem gravada é a DO ENVELOPE — nada chumbado');
  perform pg_temp.assert17(v_row.entered_at is not null, 'vencido e em aberto: ENTROU na régua');

  select count(*) into v_n from core.event_outbox where event_type = 'dun.title.entered';
  perform pg_temp.assert17(v_n = 1, 'dun.title.entered saiu uma vez');

  -- CENÁRIO 2 — a reentrega é idempotente.
  select dun.record_external_receivable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_env.produced_by,
    v_env.payload->>'externalRef', (v_env.payload->>'dueDate')::date,
    (v_env.payload->>'amountCents')::bigint, (v_env.payload->>'currency')::char(3),
    v_env.payload->>'status', (v_env.payload->>'receivedAmountCents')::bigint,
    v_env.payload->>'payerName', v_env.payload->>'counterpartyTaxId',
    v_env.payload->>'description'
  ) into v_efeito;
  perform pg_temp.assert17(v_efeito = 'unchanged', 'a reentrega não muda nada');
  select count(*) into v_n from core.event_outbox where event_type = 'dun.title.entered';
  perform pg_temp.assert17(v_n = 1, 'e não emite segundo entered');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O PRODUTOR FICTÍCIO GRAVA A ORIGEM DELE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: erp-bridge projeta com a origem dele ==='

do $$
declare
  v_src text;
begin
  perform dun.record_external_receivable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'erp-bridge', 'ERP-77',
    current_date - 3, 55000, 'BRL', 'open', 0, 'Devedor do ERP', null, null);

  select source_module_id into v_src from dun.titles where external_ref = 'ERP-77';
  perform pg_temp.assert17(v_src = 'erp-bridge', '⭐ um segundo produtor entra com o nome DELE');
end $$;

-- =============================================================================
-- CENÁRIO 4 — A MESMA REFERÊNCIA NOS DOIS TENANTS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: DOC-DUN-0001 no Beta é OUTRO título ==='

do $$
declare
  v_n int;
begin
  perform dun.record_external_receivable(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'origem-beta', 'DOC-DUN-0001',
    current_date - 5, 70000, 'BRL', 'open', 0, 'Devedor do Beta', null, null);

  select count(*) into v_n from dun.titles where external_ref = 'DOC-DUN-0001';
  perform pg_temp.assert17(v_n = 2, 'dois tenants, dois títulos, zero mistura');

  -- E o Beta, autenticado, só vê o dele.
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from dun.titles;
  perform pg_temp.assert17(v_n = 1, 'a RLS entrega ao Beta só o título do Beta');
  reset role;
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐ A RÉGUA DO TENANT E O ATO REGISTRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: desenhar, executar, carimbar — e não cobrar em dobro ==='

do $$
declare
  v_ruler uuid; v_s1 uuid; v_s2 uuid; v_title uuid; v_erro text;
  v_exec record; v_n int; v_payload jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into dun.rulers (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Régua padrão')
  returning id into v_ruler;

  insert into dun.steps (tenant_id, ruler_id, position, name, days_after_due, channel) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_ruler, 0, '1º aviso', 1, 'e-mail'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_ruler, 1, 'ligação', 7, 'telefone');

  select id into v_s1 from dun.steps where ruler_id = v_ruler and position = 0;
  select id into v_s2 from dun.steps where ruler_id = v_ruler and position = 1;

  -- ⭐ SÓ UMA régua ativa por tenant.
  begin
    insert into dun.rulers (tenant_id, name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Segunda régua');
    perform pg_temp.assert17(false, 'DEVERIA TER FALHADO: segunda régua ativa');
  exception when unique_violation then
    perform pg_temp.assert17(true, '⭐ uma régua ativa por tenant — o índice é a lei');
  end;

  select id into v_title from dun.titles
   where external_ref = 'DOC-DUN-0001'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  -- O Beta (sem execute) não executa — nem no título DELE.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  begin
    perform dun.execute_step(v_title, v_s1, 'tentativa');
    perform pg_temp.assert17(false, 'DEVERIA TER FALHADO: Beta executou no título do Alfa');
  exception when insufficient_privilege then
    perform pg_temp.assert17(true, 'sem acesso ao tenant do título, nada acontece');
  end;

  -- O Alfa executa o 1º aviso, com anotação.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  perform dun.execute_step(v_title, v_s1, 'aviso enviado com o boleto atualizado');

  select * into v_exec from dun.step_executions where title_id = v_title;
  perform pg_temp.assert17(
    v_exec.step_name = '1º aviso' and v_exec.channel = 'e-mail'
      and v_exec.actor_user_id = '11111111-1111-4111-8111-111111111111',
    '⭐ o ato carimbou o NOME, o CANAL e o autor');

  -- O MESMO passo, de novo: recusado.
  begin
    perform dun.execute_step(v_title, v_s1, 'de novo');
    perform pg_temp.assert17(false, 'DEVERIA TER FALHADO: cobrou em dobro');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert17(v_erro like '%já foi executado%', 'o mesmo passo não executa duas vezes');
  end;

  -- O segundo passo (7 dias, atraso de 10): executa.
  perform dun.execute_step(v_title, v_s2, '');
  select count(*) into v_n from dun.step_executions where title_id = v_title;
  perform pg_temp.assert17(v_n = 2, 'a régua andou para o segundo passo');

  reset role;
  select payload into v_payload from core.event_outbox
   where event_type = 'dun.step.executed'
   order by created_at limit 1;
  perform pg_temp.assert17(
    v_payload->>'stepName' = '1º aviso'
      and (v_payload->>'daysOverdue')::int = 10
      and v_payload->>'externalRef' = 'DOC-DUN-0001',
    '⭐ o fato leva o passo pelo NOME, o atraso e o título — autossuficiente');
end $$;

-- =============================================================================
-- CENÁRIO 6 — TÍTULO NO PRAZO NÃO SE COBRA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: só se cobra o que venceu ==='

do $$
declare
  v_title uuid; v_s1 uuid; v_erro text;
begin
  perform dun.record_external_receivable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'origem', 'DOC-NO-PRAZO',
    current_date + 30, 20000, 'BRL', 'open', 0, null, null, null);

  select id into v_title from dun.titles where external_ref = 'DOC-NO-PRAZO';
  select s.id into v_s1 from dun.steps s
   join dun.rulers r on r.id = s.ruler_id where r.status = 'active' and s.position = 0
   and s.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    perform dun.execute_step(v_title, v_s1, '');
    perform pg_temp.assert17(false, 'DEVERIA TER FALHADO: cobrou título no prazo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert17(v_erro like '%não está na régua%', 'no prazo, sem cobrança');
  end;
  reset role;
end $$;

-- =============================================================================
-- CENÁRIO 7 — ⭐⭐ A BAIXA NA ORIGEM TIRA DA RÉGUA SOZINHA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: o dinheiro entrou lá — o título sai daqui ==='

do $$
declare
  v_env record; v_efeito text; v_row dun.titles; v_n int; v_erro text; v_s2 uuid;
begin
  -- O recebimento acontece NA ORIGEM.
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  update ar.receivables
     set received_amount_cents = 100000, status = 'received'
   where external_ref = 'DOC-DUN-0001'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  -- A entrega do fato novo.
  reset role;
  select payload, produced_by into v_env
    from core.event_outbox
   where event_type like '%.receivable.updated'
     and payload->>'externalRef' = 'DOC-DUN-0001'
     and payload->>'status' = 'received';

  select dun.record_external_receivable(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_env.produced_by,
    v_env.payload->>'externalRef', (v_env.payload->>'dueDate')::date,
    (v_env.payload->>'amountCents')::bigint, (v_env.payload->>'currency')::char(3),
    v_env.payload->>'status', (v_env.payload->>'receivedAmountCents')::bigint,
    v_env.payload->>'payerName', v_env.payload->>'counterpartyTaxId',
    v_env.payload->>'description'
  ) into v_efeito;

  perform pg_temp.assert17(v_efeito = 'updated', 'a projeção aplicou a baixa');

  select * into v_row from dun.titles
   where external_ref = 'DOC-DUN-0001'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert17(
    v_row.status = 'received' and v_row.left_at is not null,
    '⭐⭐ o título SAIU da régua — a baixa na origem tirou sozinha');

  select count(*) into v_n from core.event_outbox where event_type = 'dun.title.left';
  perform pg_temp.assert17(v_n = 1, 'dun.title.left saiu uma vez');

  -- E cobrá-lo agora é recusado.
  select s.id into v_s2 from dun.steps s
   join dun.rulers r on r.id = s.ruler_id
   where r.status = 'active' and s.position = 1
     and s.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    perform dun.execute_step(v_row.id, v_s2, '');
    perform pg_temp.assert17(false, 'DEVERIA TER FALHADO: cobrou título pago');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert17(v_erro like '%não está na régua%', 'título pago não se cobra');
  end;
  reset role;
end $$;

-- =============================================================================
-- CENÁRIO 8 — IMUTABILIDADE E A CANETA CERTA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 8: a execução não se edita; a projeção não é do cliente ==='

do $$
declare
  v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    update dun.step_executions set note = 'reescrevendo' where true;
    perform pg_temp.assert17(false, 'DEVERIA TER FALHADO: cliente editou a execução');
  exception when insufficient_privilege then
    perform pg_temp.assert17(true, 'cliente não edita execução (sem grant, sem policy)');
  end;

  begin
    perform dun.record_external_receivable(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'forjado', 'FORJA-1',
      current_date - 1, 1000, 'BRL', 'open', 0, null, null, null);
    perform pg_temp.assert17(false, 'DEVERIA TER FALHADO: cliente projetou título');
  exception when insufficient_privilege then
    perform pg_temp.assert17(true, '⛔ a porta de projeção NÃO é do cliente — só da composição');
  end;

  begin
    insert into dun.titles (tenant_id, source_module_id, external_ref, due_date, amount_cents, currency, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'na-mao', 'MAO-1', current_date - 1, 1000, 'BRL', 'open');
    perform pg_temp.assert17(false, 'DEVERIA TER FALHADO: cliente escreveu na projeção');
  exception when insufficient_privilege then
    perform pg_temp.assert17(true, 'a projeção não tem porta de escrita para o cliente');
  end;
end $$;

-- Camada 3 da imutabilidade: nem o dono do banco.
do $$
declare
  v_erro text;
begin
  begin
    delete from dun.step_executions where true;
    perform pg_temp.assert17(false, 'DEVERIA TER FALHADO: o dono apagou a execução');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert17(v_erro like '%fato consumado%', 'nem o dono do banco apaga o ato');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 12 OK: o triângulo da régua fechado — entra pelo fato, sai pelo fato ==='
