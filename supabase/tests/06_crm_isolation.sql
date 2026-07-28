-- =============================================================================
-- O MÓDULO 4 NO BANCO — isolamento, imutabilidade e o histórico que sobrevive
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` (tenants Alfa e Beta, três usuários) e
-- de `04_install_module.sql` (que troca o papel do `user-a` — ver a MONTAGEM).
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:** os testes do
-- pacote provam a LÓGICA — o que é uma contraparte válida, por onde ela pode
-- andar. Este prova o EFEITO no banco, inclusive as coisas que só o banco pode
-- garantir:
--
--   1. as duas tabelas isolam por tenant, com usuário real;
--   2. a interação é IMUTÁVEL — `update` e `delete` são negados, e negados
--      até para quem roda como dono do banco;
--   3. arquivar a contraparte NÃO leva o histórico junto;
--   4. o identificador fiscal não se repete no tenant **quando informado**, e
--      não atrapalha quando não é;
--   5. quem não tem `crm.party.archive` não arquiva — nem por SQL direto;
--   6. a interação não pode apontar para a contraparte de OUTRO tenant.
--
-- A sexta é a que dá pesadelo: sem a chave estrangeira composta, um bug de
-- aplicação criaria essa linha e a RLS de leitura ESCONDERIA o estrago em vez
-- de impedi-lo.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert6(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: o módulo de Relacionamentos nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'crm', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'crm', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ **A concessão passa por `core.memberships`, e não por um papel escrito à
-- mão.** É a lição que o teste do triângulo pagou na Etapa 10: o teste 04 troca
-- o vínculo do `user-a` para `dono-do-tenant` quando prova quem pode instalar,
-- e um fixture que escrevesse `admin` concederia a um papel que o usuário não
-- tem mais — morrendo na RLS do primeiro insert.
--
-- ⚠️ `user-a` (Alfa) ganha as TRÊS; `user-b` (Beta) ganha `manage` e `record`,
-- mas NÃO `archive`. A assimetria é de propósito: é ela que prova, no cenário
-- 5, que cadastrar e arquivar são atos separados de verdade.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, v.k, 'crm'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 cross join (values ('crm.party.manage'), ('crm.interaction.record')) v(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'crm.party.archive', 'crm'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa pode arquivar.'

-- =============================================================================
-- CENÁRIO 1 — A CONTRAPARTE NASCE E O FATO SAI, AUTOSSUFICIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cadastrar emite o evento com payload completo ==='

do $$
declare v_payload jsonb; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- user-a, Alfa

  insert into crm.parties (tenant_id, kind, display_name, tax_id, email, tags)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'org', 'Contraparte Alfa',
          'ID-CRM-0001', 'contato@alfa.invalid', array['fornecedor']);

  reset role;

  select count(*) into v_n from core.event_outbox
   where event_type = 'crm.party.registered'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert6(v_n = 1, 'o insert emitiu exatamente um crm.party.registered');

  select payload into v_payload from core.event_outbox
   where event_type = 'crm.party.registered'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  perform pg_temp.assert6(v_payload ? 'partyId',     'payload traz partyId');
  perform pg_temp.assert6(v_payload ? 'kind',        'payload traz kind');
  perform pg_temp.assert6(v_payload ? 'displayName', 'payload traz displayName');
  perform pg_temp.assert6(v_payload ? 'taxId',       'payload traz taxId — neutro, não "cpf" nem "cnpj"');
  perform pg_temp.assert6(v_payload ? 'tags',        'payload traz tags');
  perform pg_temp.assert6(v_payload ? 'status',      'payload traz status');
  perform pg_temp.assert6(
    v_payload->>'displayName' = 'Contraparte Alfa',
    'o nome no envelope é o nome da contraparte');
end $$;

-- =============================================================================
-- CENÁRIO 2 — A INTERAÇÃO, E O ENVELOPE QUE NÃO EXIGE JOIN
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: registrar contato leva os dados da contraparte junto ==='

do $$
declare v_party uuid; v_payload jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_party from crm.parties
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and tax_id = 'ID-CRM-0001';

  insert into crm.interactions (tenant_id, party_id, channel, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_party, 'ligação', 'primeiro contato');

  reset role;

  select payload into v_payload from core.event_outbox
   where event_type = 'crm.interaction.registered'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  perform pg_temp.assert6(v_payload ? 'interactionId', 'payload traz interactionId');
  perform pg_temp.assert6(v_payload ? 'channel',       'payload traz o canal');
  perform pg_temp.assert6(v_payload ? 'occurredAt',    'payload traz quando aconteceu');
  -- ⭐ O ponto do cenário: quem escuta NÃO pode fazer join no schema deste
  -- módulo, então os dados da contraparte vão no mesmo envelope.
  perform pg_temp.assert6(
    v_payload ? 'displayName' and v_payload ? 'taxId',
    'o envelope da interação carrega a contraparte — quem escuta não faz join');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⛔ A INTERAÇÃO É IMUTÁVEL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: fato consumado não se edita nem se apaga ==='

do $$
declare v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    update crm.interactions set note = 'reescrevendo a história';
    v_erro := null;
  exception when others then v_erro := SQLSTATE; end;
  perform pg_temp.assert6(
    v_erro = '42501',
    'UPDATE em interação é recusado (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');

  begin
    delete from crm.interactions;
    v_erro := null;
  exception when others then v_erro := SQLSTATE; end;
  perform pg_temp.assert6(
    v_erro = '42501',
    'DELETE em interação é recusado (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');

  reset role;
  select count(*) into v_n from crm.interactions;
  perform pg_temp.assert6(v_n = 1, 'a interação continua lá, intacta');
end $$;

-- ⭐ A TERCEIRA CAMADA: negado até para o DONO DO BANCO.
--
-- As duas primeiras camadas (sem policy, sem GRANT) protegem o cliente. Esta
-- protege de nós mesmos — um script de manutenção rodando como `postgres`
-- passaria pelas outras duas sem esbarrar em nada.
\echo ''
\echo '=== CENÁRIO 3.1: e negado até para quem roda como dono do banco ==='

do $$
declare v_erro text;
begin
  begin
    update crm.interactions set note = 'como superusuário';
    v_erro := null;
  exception when others then v_erro := SQLSTATE; end;
  perform pg_temp.assert6(
    v_erro = '42501',
    'nem o dono do banco edita interação (recebido: ' || coalesce(v_erro, 'PASSOU!') || ')');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ ARQUIVAR NÃO LEVA O HISTÓRICO JUNTO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: arquivar é status, e o histórico sobrevive ==='

do $$
declare v_n int; v_status text; v_eventos int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  update crm.parties set status = 'archived'
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and tax_id = 'ID-CRM-0001';

  reset role;

  select count(*) into v_n from crm.parties
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and tax_id = 'ID-CRM-0001';
  perform pg_temp.assert6(v_n = 1, 'a contraparte arquivada continua na tabela');

  select count(*) into v_n from crm.interactions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert6(v_n = 1, '⭐ o histórico de contato NÃO foi junto');

  select count(*) into v_eventos from core.event_outbox
   where event_type = 'crm.party.archived'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert6(v_eventos = 1, 'o arquivamento emitiu crm.party.archived');

  -- E voltar é permitido — ao contrário do título cancelado do Módulo 3.
  -- Uma contraparte que volta é a MESMA pessoa; obrigá-la a nascer de novo
  -- partiria o histórico em dois.
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  update crm.parties set status = 'active'
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and tax_id = 'ID-CRM-0001';
  reset role;

  select status into v_status from crm.parties
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and tax_id = 'ID-CRM-0001';
  perform pg_temp.assert6(v_status = 'active', 'a contraparte volta para a carteira');

  -- ⚠️ E voltar NÃO emite evento: quem escutou o arquivamento guardou o fato, e
  -- desfazer seria obrigação que nenhum consumidor pediu.
  select count(*) into v_eventos from core.event_outbox
   where event_type like 'crm.party.%'
     and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and payload->>'status' = 'active'
     and event_type = 'crm.party.updated';
  perform pg_temp.assert6(v_eventos = 0, 'trazer de volta não vira crm.party.updated');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⛔ QUEM NÃO PODE ARQUIVAR, NÃO ARQUIVA — NEM POR SQL DIRETO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: cadastrar e arquivar são atos separados de verdade ==='

do $$
declare v_erro text; v_status text; v_party uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- user-b, sem archive

  insert into crm.parties (tenant_id, kind, display_name, tax_id)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'person', 'Contraparte Beta', 'ID-CRM-0001')
  returning id into v_party;

  -- Editar o cadastro ele PODE — tem `crm.party.manage`.
  update crm.parties set email = 'beta@exemplo.invalid' where id = v_party;

  begin
    update crm.parties set status = 'archived' where id = v_party;
    v_erro := null;
  exception when others then v_erro := SQLSTATE; end;

  perform pg_temp.assert6(
    v_erro = '42501',
    'arquivar sem crm.party.archive é recusado (recebido: ' || coalesce(v_erro, 'nenhum erro') || ')');

  reset role;
  select status into v_status from crm.parties where id = v_party;
  perform pg_temp.assert6(v_status = 'active', 'a contraparte do Beta continua ativa');
end $$;

-- =============================================================================
-- CENÁRIO 6 — ⛔ O ISOLAMENTO, COM O MESMO IDENTIFICADOR NOS DOIS TENANTS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: o mesmo ID-CRM-0001 em dois tenants não se mistura ==='

do $$
declare v_n int; v_nome text;
begin
  -- ⚠️ Os DOIS tenants usam o MESMO identificador, de propósito (o cenário 5 já
  -- criou o do Beta). A mesma empresa pode ser contraparte de dois clientes
  -- nossos ao mesmo tempo. Se a unicidade fosse global, o segundo cliente não
  -- conseguiria cadastrá-la — e isso não seria isolamento, seria defeito.
  select count(*) into v_n from crm.parties where tax_id = 'ID-CRM-0001';
  perform pg_temp.assert6(v_n = 2, 'o mesmo identificador existe nos dois tenants');

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- user-a, Alfa

  select count(*) into v_n from crm.parties;
  perform pg_temp.assert6(v_n = 1, 'user-a enxerga só a contraparte do próprio tenant');

  select display_name into v_nome from crm.parties;
  perform pg_temp.assert6(v_nome = 'Contraparte Alfa', 'e é a dele mesmo');

  select count(*) into v_n from crm.interactions;
  perform pg_temp.assert6(v_n = 1, 'e só o histórico do próprio tenant');
end $$;

do $$
declare v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- user-b, Beta
  select count(*) into v_n from crm.parties;
  perform pg_temp.assert6(v_n = 1, 'o espelho vale: o Beta só vê o Beta');
  select count(*) into v_n from crm.interactions;
  perform pg_temp.assert6(v_n = 0, 'e não vê o histórico do vizinho');
end $$;

-- =============================================================================
-- CENÁRIO 7 — ⭐ A UNICIDADE DO IDENTIFICADOR, E O QUE ELA NÃO IMPEDE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: identificador único quando informado, livre quando não ==='

do $$
declare v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into crm.parties (tenant_id, kind, display_name, tax_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'person', 'Repetida', 'ID-CRM-0001');
    v_erro := null;
  exception when unique_violation then v_erro := 'recusado'; end;

  perform pg_temp.assert6(
    v_erro = 'recusado',
    'o mesmo identificador não entra duas vezes no tenant');

  -- ⭐ E SEM identificador, quantas quiser: duas pessoas podem ter o mesmo
  -- nome, e recusar a segunda seria inventar uma regra que o mundo não tem.
  insert into crm.parties (tenant_id, kind, display_name) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'person', 'Homônima'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'person', 'Homônima');

  select count(*) into v_n from crm.parties
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and tax_id is null;
  perform pg_temp.assert6(v_n = 2, 'duas contrapartes sem identificador convivem');
end $$;

-- =============================================================================
-- CENÁRIO 8 — ⛔ A INTERAÇÃO NÃO ATRAVESSA A FRONTEIRA DO TENANT
-- -----------------------------------------------------------------------------
-- ⭐ O pesadelo deste módulo. Sem a chave estrangeira COMPOSTA
-- `(party_id, tenant_id)`, um bug de aplicação criaria uma interação apontando
-- para a contraparte de outro tenant — e a RLS de leitura ESCONDERIA o estrago
-- em vez de impedi-lo. O dado errado existiria, calado.
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 8: interação do Alfa não aponta para contraparte do Beta ==='

do $$
declare v_erro text; v_beta uuid;
begin
  select id into v_beta from crm.parties
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;

  -- Como o dono do banco, de propósito: aqui não é a RLS que tem de barrar, é
  -- a integridade referencial. Se só a RLS barrasse, um serviço com
  -- `service_role` criaria a linha sem esbarrar em nada.
  begin
    insert into crm.interactions (tenant_id, party_id, channel)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_beta, 'ligação');
    v_erro := null;
  exception when foreign_key_violation then v_erro := 'recusado'; end;

  perform pg_temp.assert6(
    v_erro = 'recusado',
    'a chave composta impede a interação de cruzar o tenant (recebido: '
      || coalesce(v_erro, 'PASSOU!') || ')');
end $$;

-- =============================================================================
-- CENÁRIO 9 — ⛔ NINGUÉM EMITE EVENTO À MÃO, E O CINTO SEGURA O TIPO ERRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 9: a porta de saída é do módulo, não do cliente ==='

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform crm.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'crm.party.registered', '{}'::jsonb);
    v_erro := null;
  exception when insufficient_privilege then v_erro := 'negado'; end;

  perform pg_temp.assert6(
    v_erro = 'negado',
    'usuário autenticado não emite evento à mão (recebido: ' || coalesce(v_erro, 'emitiu!') || ')');

  reset role;

  -- E o cinto: nem o dono do banco emite um tipo que não é deste módulo.
  begin
    perform crm.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ap.payable.registered', '{}'::jsonb);
    v_erro := null;
  exception when others then v_erro := SQLERRM; end;

  perform pg_temp.assert6(
    v_erro is not null,
    'o cinto recusa tipo de outro módulo: ' || coalesce(v_erro, 'PASSOU!'));
end $$;

\echo ''
\echo '✅ O MÓDULO 4 ESTÁ DE PÉ: dois tenants isolados, interação imutável,'
\echo '   histórico que sobrevive ao arquivamento e identificador único onde importa.'
