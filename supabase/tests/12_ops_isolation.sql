-- =============================================================================
-- O MÓDULO 7 NO BANCO — a esteira do tenant, a trilha imutável e o REFAZER
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` (tenants Alfa e Beta, três usuários) e
-- de `04_install_module.sql` (que troca o papel do `user-a` — ver a MONTAGEM).
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:** os testes do
-- pacote provam a LÓGICA. Este prova o EFEITO no banco, e sete coisas que só
-- existem aqui:
--
--   1. duas esteiras com as MESMAS etapas em tenants diferentes não se veem;
--   2. ⭐ **a permissão que depende do DESENHO** — passar de uma etapa marcada
--      `requires_approval` exige `ops.order.decide`; das outras, não;
--   3. ⭐ **pular é ATO REGISTRADO** — a linha fica na trilha, com quem, quando
--      e por quê, e pular sem razão é recusado;
--   4. ⭐ **a trilha é imutável nas três camadas**, inclusive para o dono do
--      banco;
--   5. ⭐ **o REFAZER de uma OS CONCLUÍDA a reabre** — a divergência declarada
--      do módulo, provada contra o gatilho de verdade;
--   6. ⭐ **a trilha sobrevive ao apagamento da etapa** — o nome carimbado
--      continua legível depois que a etapa deixa de existir;
--   7. o entregável versiona e não se edita.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert8(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: a Esteira de Produção nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ops', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ops', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A concessão passa por `core.memberships`, e não por um papel escrito à
-- mão: o teste 04 troca o vínculo do `user-a`. Lição da Etapa 10.
--
-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as TRÊS permissões;
-- `user-b` (Beta) recebe `design` e `manage`, mas **não** `decide`. É ela que
-- prova, no cenário 3, que a etapa de aprovação aprova de verdade.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'ops'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('ops.pipeline.design'), ('ops.order.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ops.order.decide', 'ops'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa decide.'

-- =============================================================================
-- CENÁRIO 1 — ⭐ A ESTEIRA É DADO DO TENANT, E DUAS ESTEIRAS NÃO SE VEEM
-- -----------------------------------------------------------------------------
-- Os dois tenants desenham esteiras com nomes DIFERENTES para a mesma coisa —
-- e é esse o ponto da Lei das Etapas. Se as etapas fossem enum do produto,
-- este cenário seria impossível de escrever.
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant desenha a esteira dele ==='

do $$
declare
  v_pipe_alfa uuid; v_pipe_beta uuid; v_n int; v_nome text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into ops.pipelines (tenant_id, name, description)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Produção de conteúdo',
          'a esteira do marketing')
  returning id into v_pipe_alfa;

  -- A esteira da agência do enunciado, com o briefing PULÁVEL e a aprovação
  -- exigindo decisão.
  insert into ops.pipeline_stages
    (tenant_id, pipeline_id, position, name, requires_approval, skippable)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pipe_alfa, 0, 'abertura',   false, false),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pipe_alfa, 1, 'briefing',   false, true),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pipe_alfa, 2, 'criação',    false, false),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pipe_alfa, 3, 'revisão',    false, false),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pipe_alfa, 4, 'aprovação',  true,  false),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pipe_alfa, 5, 'veiculação', false, false);

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- ⭐ Outro ofício inteiro, na MESMA tabela, sem uma linha de código
  -- diferente. É a prova da decisão 2 do cabeçalho do 0011: o módulo não é de
  -- marketing.
  insert into ops.pipelines (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Ordem de manutenção')
  returning id into v_pipe_beta;

  insert into ops.pipeline_stages
    (tenant_id, pipeline_id, position, name, requires_approval, skippable)
  values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_pipe_beta, 0, 'chamado',   false, false),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_pipe_beta, 1, 'vistoria',  false, true),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_pipe_beta, 2, 'execução',  false, false);

  select count(*) into v_n from ops.pipelines;
  perform pg_temp.assert8(v_n = 1, 'o Beta enxerga só a esteira dele');
  select name into v_nome from ops.pipelines;
  perform pg_temp.assert8(v_nome = 'Ordem de manutenção', 'e é a dele mesmo');

  select count(*) into v_n from ops.pipeline_stages;
  perform pg_temp.assert8(v_n = 3, 'e só as três etapas dele — não as seis do vizinho');

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  select count(*) into v_n from ops.pipeline_stages;
  perform pg_temp.assert8(v_n = 6, 'o espelho vale: o Alfa vê as seis dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — A OS NASCE COM A PRIMEIRA LINHA DA TRILHA E COM O FATO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: abrir a OS escreve trilha e caixa de saída, juntas ==='

do $$
declare
  v_pipe uuid; v_stage uuid; v_order uuid;
  v_n int; v_payload jsonb; v_produtor text; v_kind text; v_nome text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_pipe from ops.pipelines where name = 'Produção de conteúdo';
  select id into v_stage from ops.pipeline_stages
   where pipeline_id = v_pipe and position = 0;

  insert into ops.orders (tenant_id, pipeline_id, current_stage_id, title, description, due_date)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pipe, v_stage,
          'Campanha de setembro', 'peça para a data comemorativa', '2026-09-30')
  returning id into v_order;

  select count(*) into v_n from ops.order_events where order_id = v_order;
  perform pg_temp.assert8(v_n = 1, 'a OS nasce com exatamente uma linha de trilha');

  select kind, to_stage_name into v_kind, v_nome
    from ops.order_events where order_id = v_order;
  perform pg_temp.assert8(v_kind = 'opened', 'e a linha é a abertura');
  perform pg_temp.assert8(v_nome = 'abertura',
    '⭐ e ela CARIMBA o nome da etapa, não só o id');

  reset role;

  select count(*) into v_n from core.event_outbox where event_type = 'ops.order.opened';
  perform pg_temp.assert8(v_n = 1, 'e emitiu exatamente um ops.order.opened');

  select payload, produced_by into v_payload, v_produtor
    from core.event_outbox where event_type = 'ops.order.opened';
  perform pg_temp.assert8(v_produtor = 'ops', 'o envelope carrega a procedência');
  perform pg_temp.assert8(v_payload ? 'orderId',      'payload traz orderId');
  perform pg_temp.assert8(v_payload ? 'title',        'payload traz title');
  perform pg_temp.assert8(v_payload ? 'status',       'payload traz status');
  perform pg_temp.assert8(
    v_payload ->> 'pipelineName' = 'Produção de conteúdo',
    '⭐ payload traz o NOME da esteira — quem escuta não pode resolver id daqui');
  perform pg_temp.assert8(
    v_payload ->> 'stageName' = 'abertura',
    '⭐ e o NOME da etapa, pelo mesmo motivo');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A PERMISSÃO QUE DEPENDE DO DESENHO DO TENANT
-- -----------------------------------------------------------------------------
-- O `user-b` tem `manage` e não tem `decide`. Ele move a OS pelas etapas
-- comuns da esteira DELE — e trava na hora de passar de uma que pede
-- aprovação. Como o Beta não desenhou etapa de aprovação, o teste faz o Beta
-- desenhar uma agora: é assim que se prova que quem decide o que é decisão é o
-- tenant, e não uma palavra mágica no código.
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: quem não decide não passa da etapa que pede aprovação ==='

do $$
declare
  v_pipe uuid; v_s0 uuid; v_order uuid; v_erro text; v_n int; v_stage_atual uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta, sem decide

  select id into v_pipe from ops.pipelines where name = 'Ordem de manutenção';

  -- O Beta marca a vistoria como etapa de aprovação. Desenho dele.
  update ops.pipeline_stages set requires_approval = true
   where pipeline_id = v_pipe and name = 'vistoria';

  select id into v_s0 from ops.pipeline_stages where pipeline_id = v_pipe and position = 0;

  insert into ops.orders (tenant_id, pipeline_id, current_stage_id, title)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_pipe, v_s0, 'Troca de lâmpada')
  returning id into v_order;

  -- 'chamado' NÃO pede aprovação: `manage` basta, e ele passa.
  perform ops.advance_order(v_order, 'chamado recebido');
  select current_stage_id into v_stage_atual from ops.orders where id = v_order;
  select count(*) into v_n from ops.pipeline_stages
   where id = v_stage_atual and name = 'vistoria';
  perform pg_temp.assert8(v_n = 1, 'com manage ele passa da etapa comum');

  -- 'vistoria' pede aprovação: sem `decide`, o banco recusa.
  begin
    perform ops.advance_order(v_order, 'tentando passar da aprovação');
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: passou da etapa de aprovação sem decide');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert8(
      v_erro like '%ops.order.decide%',
      '⭐ e trava na que pede aprovação, com o nome da permissão no erro');
  end;

  -- ⛔ E a trilha NÃO ganhou linha da tentativa recusada. Movimento que não
  -- aconteceu não se registra — trilha com tentativa frustrada mente sobre o
  -- que foi feito.
  select count(*) into v_n from ops.order_events
   where order_id = v_order and kind = 'advanced';
  perform pg_temp.assert8(v_n = 1, 'a tentativa recusada não deixou linha na trilha');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ PULAR É ATO REGISTRADO, E EXIGE RAZÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: pular a etapa deixa rastro, e sem razão não pula ==='

do $$
declare
  v_order uuid; v_erro text; v_n int; v_note text; v_de text; v_para text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_order from ops.orders where title = 'Campanha de setembro';

  -- 'abertura' → 'briefing'
  perform ops.advance_order(v_order, '');

  -- Sem razão: recusado.
  begin
    perform ops.skip_stage(v_order, '   ');
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: pulou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert8(v_erro like '%razão%', 'pular sem razão é recusado');
  end;

  -- Com razão: passa, e deixa a linha.
  perform ops.skip_stage(v_order, 'este trabalho não tem briefing do cliente');

  select count(*) into v_n from ops.order_events
   where order_id = v_order and kind = 'skipped';
  perform pg_temp.assert8(v_n = 1, '⭐ pular escreveu UMA linha na trilha');

  select note, from_stage_name, to_stage_name into v_note, v_de, v_para
    from ops.order_events where order_id = v_order and kind = 'skipped';
  perform pg_temp.assert8(
    v_note = 'este trabalho não tem briefing do cliente',
    '⭐ e a linha guarda a RAZÃO — pular não apaga, explica');
  perform pg_temp.assert8(v_de = 'briefing' and v_para = 'criação',
    'e guarda de onde para onde, pelo nome');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'ops.stage.skipped';
  perform pg_temp.assert8(v_n = 1, 'e o mundo soube: ops.stage.skipped saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⛔ ETAPA NÃO PULÁVEL NÃO PULA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: a etapa que o tenant não marcou como pulável não pula ==='

do $$
declare v_order uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_order from ops.orders where title = 'Campanha de setembro';

  begin
    -- A OS está em 'criação', que nasceu com `skippable = false`.
    perform ops.skip_stage(v_order, 'quero pular a criação');
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: pulou etapa não pulável');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert8(
      v_erro like '%não foi desenhada como pulável%',
      'a etapa não pulável recusa — e o desenho é do tenant');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — ENTREGÁVEL VERSIONA, E NÃO SE EDITA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: o entregável versiona, escreve trilha e é imutável ==='

do $$
declare
  v_order uuid; v_stage uuid; v_n int; v_erro text; v_note text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id, current_stage_id into v_order, v_stage
    from ops.orders where title = 'Campanha de setembro';

  insert into ops.deliverables
    (tenant_id, order_id, stage_id, stage_name, kind, reference, version, instruction)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_order, v_stage, 'criação',
     'arte', 'https://exemplo.invalido/pasta/arte-v1', 1, '');

  insert into ops.deliverables
    (tenant_id, order_id, stage_id, stage_name, kind, reference, version, instruction)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_order, v_stage, 'criação',
     'arte', 'https://exemplo.invalido/pasta/arte-v2', 2,
     'tirar o telefone do rodapé');

  select count(*) into v_n from ops.deliverables where order_id = v_order;
  perform pg_temp.assert8(v_n = 2, 'as duas versões coexistem — refazer não apaga');

  -- A mesma versão duas vezes: recusada.
  begin
    insert into ops.deliverables
      (tenant_id, order_id, stage_id, stage_name, kind, reference, version)
    values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_order, v_stage, 'criação',
       'arte', 'https://exemplo.invalido/pasta/colisao', 2);
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: duas v2 do mesmo tipo');
  exception when unique_violation then
    perform pg_temp.assert8(true, 'duas refações simultâneas colidem em vez de gerar duas v2');
  end;

  -- Editar: recusado nas três camadas.
  begin
    update ops.deliverables set reference = 'outra coisa' where order_id = v_order;
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: editou entregável');
  exception when others then
    perform pg_temp.assert8(true, 'entregável não se edita');
  end;

  select count(*) into v_n from ops.order_events
   where order_id = v_order and kind = 'deliverable-registered';
  perform pg_temp.assert8(v_n = 2, '⭐ cada entregável escreveu a própria linha na trilha');

  -- ⚠️ Selecionado pelo CONTEÚDO, não por `order by occurred_at desc limit 1`.
  -- As duas linhas nascem na mesma transação e `now()` é o instante da
  -- transação, não da linha: as duas têm o MESMO `occurred_at`, e a ordenação
  -- devolveria qualquer uma das duas. O teste falhou exatamente assim antes de
  -- entrar, e a lição fica escrita porque ela vale para toda a trilha: dentro
  -- de uma transação, `occurred_at` ordena empatado.
  select note into v_note from ops.order_events
   where order_id = v_order and kind = 'deliverable-registered'
     and note like 'arte v2%';
  perform pg_temp.assert8(
    v_note like '%tirar o telefone do rodapé%',
    '⭐ e a linha guarda a INSTRUÇÃO que gerou a versão — minerado do kraken-v2');

  reset role;
  select count(*) into v_n from core.event_outbox
   where event_type = 'ops.deliverable.registered';
  perform pg_temp.assert8(v_n = 2, 'e saíram dois ops.deliverable.registered');
end $$;

-- =============================================================================
-- CENÁRIO 7 — ⭐⭐ A DIVERGÊNCIA: DEVOLVER UMA OS CONCLUÍDA A REABRE
-- -----------------------------------------------------------------------------
-- É aqui que este módulo diverge do `ap`, e a divergência é o cenário.
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: a OS concluída volta a andar quando é devolvida ==='

do $$
declare
  v_order uuid; v_pipe uuid; v_criacao uuid; v_status text; v_n int; v_erro text;
  v_stage_atual uuid; v_nome text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id, pipeline_id into v_order, v_pipe
    from ops.orders where title = 'Campanha de setembro';

  -- Anda até o fim: criação → revisão → aprovação → veiculação.
  perform ops.advance_order(v_order, '');
  perform ops.advance_order(v_order, '');
  perform ops.advance_order(v_order, 'aprovado pelo cliente');

  update ops.orders set status = 'done' where id = v_order;

  select status into v_status from ops.orders where id = v_order;
  perform pg_temp.assert8(v_status = 'done', 'a OS chegou a concluída');

  select count(*) into v_n from ops.order_events
   where order_id = v_order and kind = 'completed';
  perform pg_temp.assert8(v_n = 1, '⭐ concluir escreveu a linha na trilha — não só o evento');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'ops.order.completed';
  perform pg_temp.assert8(v_n = 1, 'e emitiu ops.order.completed uma vez');

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_criacao from ops.pipeline_stages
   where pipeline_id = v_pipe and name = 'criação';

  -- ⭐⭐ A DIVERGÊNCIA em ação.
  perform ops.send_back_order(v_order, v_criacao, 'cliente pediu trocar a cor do fundo');

  select status, current_stage_id into v_status, v_stage_atual
    from ops.orders where id = v_order;
  perform pg_temp.assert8(v_status = 'in_progress',
    '⭐⭐ devolver uma OS CONCLUÍDA a reabre — trabalho tem identidade por serviço');

  select name into v_nome from ops.pipeline_stages where id = v_stage_atual;
  perform pg_temp.assert8(v_nome = 'criação', 'e ela voltou para a etapa pedida');

  select count(*) into v_n from ops.order_events
   where order_id = v_order and kind = 'sent-back';
  perform pg_temp.assert8(v_n = 1, 'a devolução deixou a linha na trilha');

  -- ⛔ Devolver sem instrução: recusado. Reprovar sem dizer o que mudar trava
  -- quem recebe.
  begin
    perform ops.send_back_order(v_order, v_criacao, '');
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: devolveu sem instrução');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert8(v_erro like '%instrução%', 'devolver sem instrução é recusado');
  end;

  -- ⛔ E cancelar continua terminal, como no `ap`: aqui copiar foi decisão.
  update ops.orders set status = 'cancelled' where id = v_order;
  begin
    update ops.orders set status = 'in_progress' where id = v_order;
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: ressuscitou OS cancelada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert8(
      v_erro like '%não existe no ciclo de vida%',
      '⛔ cancelled é TERMINAL — retomar trabalho cancelado é OS nova');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 8 — ⭐ A TRILHA SOBREVIVE AO APAGAMENTO DA ETAPA
-- -----------------------------------------------------------------------------
-- A etapa é dado vivo do tenant. Este cenário apaga uma etapa que já foi
-- percorrida e confere que a história continua legível — porque o nome está
-- carimbado e o id é solto, sem chave estrangeira.
--
-- É a única prova possível de que a decisão do cabeçalho do 0011 é real, e não
-- um comentário bonito.
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 8: apagar a etapa não apaga a história ==='

do $$
declare
  v_pipe uuid; v_briefing uuid; v_n int; v_nome text; v_erro text; v_atual uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_pipe from ops.pipelines where name = 'Produção de conteúdo';
  select id into v_briefing from ops.pipeline_stages
   where pipeline_id = v_pipe and name = 'briefing';

  -- ⛔ Primeiro, a garantia do outro lado: a etapa ONDE HÁ OS não se apaga.
  select current_stage_id into v_atual from ops.orders where title = 'Campanha de setembro';
  begin
    delete from ops.pipeline_stages where id = v_atual;
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: apagou etapa com OS em cima');
  exception when foreign_key_violation then
    perform pg_temp.assert8(true, '⛔ a etapa onde há OS parada não se apaga');
  end;

  -- A 'briefing' foi PULADA e ninguém está nela: pode sair.
  delete from ops.pipeline_stages where id = v_briefing;

  select count(*) into v_n from ops.pipeline_stages where id = v_briefing;
  perform pg_temp.assert8(v_n = 0, 'a etapa saiu da esteira');

  select from_stage_name into v_nome from ops.order_events
   where kind = 'skipped' and from_stage_id = v_briefing;
  perform pg_temp.assert8(
    v_nome = 'briefing',
    '⭐ e a trilha continua dizendo "briefing" — o nome carimbado sobrevive ao dado');
end $$;

-- =============================================================================
-- CENÁRIO 9 — ⛔ A TRILHA É IMUTÁVEL NAS TRÊS CAMADAS
-- -----------------------------------------------------------------------------
-- As duas primeiras camadas valem para o cliente. A terceira é para nós: roda
-- como DONO DO BANCO, onde RLS e GRANT não valem, e o trigger ainda recusa.
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 9: nem o dono do banco edita a trilha ==='

do $$
declare v_n int; v_erro text;
begin
  -- Camada 1 e 2: como `authenticated`, a porta não existe.
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    update ops.order_events set note = 'reescrevendo a história';
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: authenticated editou a trilha');
  exception when others then
    perform pg_temp.assert8(true, 'camadas 1 e 2: authenticated não edita a trilha');
  end;

  begin
    insert into ops.order_events (tenant_id, order_id, kind)
    select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, 'advanced'
      from ops.orders limit 1;
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: authenticated inventou movimento');
  exception when others then
    perform pg_temp.assert8(true,
      '⭐ e não INVENTA movimento: a trilha só se escreve pelas funções de §7');
  end;

  reset role;

  -- Camada 3: como dono do banco. Aqui RLS e GRANT não valem.
  begin
    update ops.order_events set note = 'reescrevendo a história';
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: o dono do banco editou a trilha');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert8(
      v_erro like '%fato consumado%',
      '⭐ camada 3: nem o dono do banco edita a trilha');
  end;

  begin
    delete from ops.order_events;
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: o dono do banco apagou a trilha');
  exception when insufficient_privilege then
    perform pg_temp.assert8(true, 'e nem apaga');
  end;

  select count(*) into v_n from ops.order_events;
  perform pg_temp.assert8(v_n > 0, 'a trilha continua inteira depois das quatro tentativas');
end $$;

-- =============================================================================
-- CENÁRIO 10 — ⛔ QUEM NÃO TEM ACESSO NÃO VÊ, E NÃO MOVE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 10: o usuário sem permissão do módulo não enxerga nada ==='

do $$
declare v_n int; v_erro text; v_order uuid;
begin
  reset role;
  select id into v_order from ops.orders where title = 'Campanha de setembro';

  set local role authenticated;
  -- `user-c` não tem nenhuma permissão `ops.*` em nenhum tenant.
  set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

  select count(*) into v_n from ops.orders;
  perform pg_temp.assert8(v_n = 0, 'quem não tem permissão do módulo não vê OS nenhuma');
  select count(*) into v_n from ops.pipelines;
  perform pg_temp.assert8(v_n = 0, 'nem esteira');
  select count(*) into v_n from ops.order_events;
  perform pg_temp.assert8(v_n = 0, 'nem trilha');
  select count(*) into v_n from ops.deliverables;
  perform pg_temp.assert8(v_n = 0, 'nem entregável');

  begin
    perform ops.advance_order(v_order, 'tentando mover a OS do vizinho');
    perform pg_temp.assert8(false, 'DEVERIA TER FALHADO: moveu OS sem acesso');
  exception when insufficient_privilege then
    perform pg_temp.assert8(true,
      '⭐ e a função SECURITY DEFINER confere o acesso antes de mover — RLS não vale dentro dela');
  end;
end $$;

\echo ''
\echo '✅ 12_ops_isolation.sql — todos os cenários passaram.'
