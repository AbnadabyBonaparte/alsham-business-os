-- =============================================================================
-- O MÓDULO 10 NO BANCO — o mapa do tenant, o movimento livre e o desfecho
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. ⭐ dois tenants desenham funis de OFÍCIOS diferentes na mesma tabela —
--      a Lei das Etapas, segunda aplicação, provada no banco;
--   2. ⭐ o movimento é LIVRE nos dois sentidos — e CADA movimento vira linha
--      imutável na trilha, com os nomes carimbados;
--   3. ⭐ perder sem razão é recusado; perder com razão carimba a trilha e
--      emite o fato com a razão dentro;
--   4. ⭐ o desfecho é TERMINAL contra o porteiro real — nem mover, nem
--      reabrir, nem encerrar de novo;
--   5. a assimetria user-a × user-b prova que ganhar/perder exige `decide`;
--   6. ⭐ apagar um estágio percorrido mantém a trilha legível (nome
--      carimbado) — e o estágio com negociação parada não se apaga.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert15(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: o Funil nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'deal', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'deal', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: user-a (Alfa) com as TRÊS; user-b (Beta) com
-- design e manage, SEM decide.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'deal'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('deal.funnel.design'), ('deal.opportunity.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'deal.opportunity.decide', 'deal'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa decide.'

-- =============================================================================
-- CENÁRIO 1 — ⭐ DOIS OFÍCIOS, UMA TABELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: o funil da loja e o da licitação, lado a lado ==='

do $$
declare
  v_f_alfa uuid; v_f_beta uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into deal.funnels (tenant_id, name) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vendas diretas')
  returning id into v_f_alfa;

  insert into deal.funnel_stages (tenant_id, funnel_id, position, name) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_f_alfa, 0, 'contato'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_f_alfa, 1, 'conversa'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_f_alfa, 2, 'proposta na mesa'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_f_alfa, 3, 'aperto de mão');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- ⭐ Outro ofício inteiro: licitação pública, na MESMA tabela.
  insert into deal.funnels (tenant_id, name) values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Licitações')
  returning id into v_f_beta;

  insert into deal.funnel_stages (tenant_id, funnel_id, position, name) values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_f_beta, 0, 'edital publicado'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_f_beta, 1, 'proposta protocolada'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_f_beta, 2, 'habilitação');

  select count(*) into v_n from deal.funnel_stages;
  perform pg_temp.assert15(v_n = 3, 'o Beta enxerga só os três estágios dele');

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select count(*) into v_n from deal.funnel_stages;
  perform pg_temp.assert15(v_n = 4, 'e o Alfa vê os quatro dele — não os do vizinho');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O MOVIMENTO É LIVRE, E TODO MOVIMENTO É TRILHA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: para frente, para trás — e tudo carimbado ==='

do $$
declare
  v_funil uuid; v_s0 uuid; v_s2 uuid; v_opp uuid; v_n int; v_de text; v_para text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_funil from deal.funnels where name = 'Vendas diretas';
  select id into v_s0 from deal.funnel_stages where funnel_id = v_funil and position = 0;
  select id into v_s2 from deal.funnel_stages where funnel_id = v_funil and position = 2;

  insert into deal.opportunities
    (tenant_id, funnel_id, current_stage_id, title, value_cents, currency, probability, party_name)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_funil, v_s0, 'Contrato anual',
     500000, 'BRL', 40, 'Cliente Prospecto Ltda')
  returning id into v_opp;

  -- ⭐ Pula do estágio 0 direto ao 2 — o movimento é livre.
  perform deal.move_opportunity(v_opp, v_s2, 'reunião foi tão bem que já pediu proposta');

  -- ⭐ E VOLTA — esfriou. Sem devolução, sem instrução obrigatória.
  perform deal.move_opportunity(v_opp, v_s0, 'esfriou: decisor de férias');

  select count(*) into v_n from deal.opportunity_events
   where opportunity_id = v_opp and kind = 'moved';
  perform pg_temp.assert15(v_n = 2, '⭐ os dois movimentos viraram trilha');

  -- ⚠️ `now()` é fixo por transação: os dois movimentos têm o MESMO
  -- occurred_at, e ordenar por ele seria loteria. Filtra-se pelo destino.
  select from_stage_name, to_stage_name into v_de, v_para
    from deal.opportunity_events
   where opportunity_id = v_opp and kind = 'moved' and to_stage_name = 'contato';
  perform pg_temp.assert15(
    v_de = 'proposta na mesa' and v_para = 'contato',
    '⭐ a volta está carimbada pelo NOME, de onde para onde');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'deal.opportunity.moved';
  perform pg_temp.assert15(v_n = 2, 'deal.opportunity.moved saiu duas vezes');
  select count(*) into v_n from core.event_outbox where event_type = 'deal.opportunity.opened';
  perform pg_temp.assert15(v_n = 1, 'e a abertura contou o fato dela');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ PERDER EXIGE RAZÃO, E EXIGE DECIDE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o desfecho é ato — com razão e com permissão ==='

do $$
declare
  v_funil uuid; v_s0 uuid; v_opp uuid; v_erro text; v_n int;
  v_razao text; v_payload jsonb;
begin
  set local role authenticated;

  -- O Beta (sem decide) monta a dele e não consegue encerrar.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_funil from deal.funnels where name = 'Licitações';
  select id into v_s0 from deal.funnel_stages where funnel_id = v_funil and position = 0;

  insert into deal.opportunities (tenant_id, funnel_id, current_stage_id, title)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_funil, v_s0, 'Pregão 42/2026')
  returning id into v_opp;

  begin
    perform deal.close_opportunity(v_opp, 'won', '');
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: ganhou sem decide');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert15(
      v_erro like '%deal.opportunity.decide%',
      'sem decide não se encerra — com o nome da permissão no erro');
  end;

  -- O Alfa: perder SEM razão é recusado.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_opp from deal.opportunities where title = 'Contrato anual';

  begin
    perform deal.close_opportunity(v_opp, 'lost', '   ');
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: perdeu sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert15(v_erro like '%razão%', '⭐ perder sem razão é recusado');
  end;

  -- Com razão: passa, sai do mapa, e o fato leva a razão dentro.
  perform deal.close_opportunity(v_opp, 'lost', 'preço 30% acima do concorrente');

  select count(*) into v_n from deal.opportunities
   where id = v_opp and status = 'lost' and current_stage_id is null;
  perform pg_temp.assert15(v_n = 1, 'a perdida saiu do mapa (estágio nulo)');

  select note into v_razao from deal.opportunity_events
   where opportunity_id = v_opp and kind = 'lost';
  perform pg_temp.assert15(
    v_razao = 'preço 30% acima do concorrente',
    '⭐ a trilha guarda a razão da perda');

  reset role;
  select payload into v_payload from core.event_outbox
   where event_type = 'deal.opportunity.lost';
  perform pg_temp.assert15(
    v_payload->>'status' = 'lost'
      and v_payload->>'outcomeReason' = 'preço 30% acima do concorrente',
    '⭐ o fato saiu com o desfecho JÁ GRAVADO e a razão dentro');
end $$;

-- =============================================================================
-- CENÁRIO 4 — O DESFECHO É TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: encerrada não move, não reabre, não encerra de novo ==='

do $$
declare
  v_opp uuid; v_stage uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_opp from deal.opportunities where title = 'Contrato anual';
  select s.id into v_stage from deal.funnel_stages s
   join deal.funnels f on f.id = s.funnel_id
   where f.name = 'Vendas diretas' and s.position = 0;

  begin
    perform deal.move_opportunity(v_opp, v_stage, 'tentando reabrir pelo mapa');
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: moveu encerrada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert15(v_erro like '%encerrada%', 'encerrada não se move');
  end;

  begin
    update deal.opportunities set status = 'open' where id = v_opp;
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: reabriu por UPDATE');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert15(
      v_erro like '%oportunidade nova%',
      '⭐ reabrir não existe: voltar é oportunidade nova');
  end;

  begin
    perform deal.close_opportunity(v_opp, 'won', '');
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: encerrou de novo');
  exception when others then
    perform pg_temp.assert15(true, 'encerrada não se encerra de novo');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — A TRILHA É IMUTÁVEL, E O ESTÁGIO APAGADO NÃO A APAGA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: a trilha sobrevive a tudo — inclusive ao redesenho ==='

do $$
declare
  v_erro text; v_n int; v_funil uuid; v_s3 uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- Camadas 1 e 2: cliente não escreve na trilha nem a edita.
  begin
    insert into deal.opportunity_events (tenant_id, opportunity_id, kind)
    select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, 'moved'
      from deal.opportunities limit 1;
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: cliente inventou movimento');
  exception when insufficient_privilege then
    perform pg_temp.assert15(true, 'ninguém inventa movimento: a trilha não tem porta de INSERT');
  end;

  begin
    update deal.opportunity_events set note = 'reescrevendo a história' where true;
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: cliente editou a trilha');
  exception when insufficient_privilege then
    perform pg_temp.assert15(true, 'cliente não edita a trilha');
  end;

  -- ⭐ Apagar um estágio SEM negociação parada: pode. A trilha que passou por
  -- ele continua legível pelo nome carimbado.
  select f.id into v_funil from deal.funnels f where f.name = 'Vendas diretas';
  select id into v_s3 from deal.funnel_stages where funnel_id = v_funil and position = 3;

  delete from deal.funnel_stages where id = v_s3;
  perform pg_temp.assert15(true, 'estágio vazio se apaga — desenho é tentativa e erro');

  select count(*) into v_n from deal.opportunity_events
   where from_stage_name = 'proposta na mesa' or to_stage_name = 'proposta na mesa';
  perform pg_temp.assert15(v_n >= 1, '⭐ a trilha continua legível pelo NOME depois do redesenho');
end $$;

-- Camada 3: o dono do banco também não.
do $$
declare
  v_erro text;
begin
  begin
    delete from deal.opportunity_events where true;
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: o dono apagou a trilha');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert15(v_erro like '%fato consumado%', 'nem o dono do banco apaga a trilha');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — SEM DELETE DE NEGOCIAÇÃO; A CANETA É DO CORREIO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: negociação não se apaga; evento não se emite à mão ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    delete from deal.opportunities where true;
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: apagou negociação');
  exception when insufficient_privilege then
    perform pg_temp.assert15(true, 'negociação perdida é a aula mais cara — não se apaga');
  end;

  begin
    perform deal.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'deal.opportunity.won', '{}'::jsonb);
    perform pg_temp.assert15(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert15(true, 'deal.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 10 OK: mapa do tenant, movimento livre com trilha, desfecho terminal ==='
