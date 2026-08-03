-- =============================================================================
-- O MÓDULO 88 NO BANCO — o rito do órgão, o número de protocolo, a trilha
-- imutável e ⭐⭐ a DECISÃO FORMAL TERMINAL (o DIVERGE do ops)
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` (tenants Alfa e Beta, três usuários) e
-- de `04_install_module.sql` (que troca o papel do `user-a`).
--
-- ⭐ Prova o EFEITO no banco — o que os testes do pacote não alcançam:
--   1. dois ritos com etapas diferentes em tenants diferentes não se veem;
--   2. ⭐ o número de protocolo é ÚNICO POR TENANT (o DIVERGE do ops);
--   3. ⭐ a permissão depende do DESENHO (`requires_approval` → decide);
--   4. ⭐ pular é ATO REGISTRADO, e sem razão não pula;
--   5. ⭐⭐ a DECISÃO FORMAL exige `decide` E o despacho, é TERMINAL, e um
--      processo decidido NÃO se devolve nem reabre — o DIVERGE do ops;
--   6. ⭐ a trilha sobrevive ao apagamento da etapa (nome carimbado);
--   7. ⭐ a trilha é imutável nas três camadas, inclusive para o dono do banco.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_proc(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: o Protocolo nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'proc', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'proc', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) recebe as TRÊS permissões; `user-b`
-- (Beta) recebe `workflow.manage` e `process.manage`, mas **não** `process.decide`.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'proc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('proc.workflow.manage'), ('proc.process.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'proc.process.decide', 'proc'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois tenants com o módulo; só o Alfa decide.'

-- =============================================================================
-- CENÁRIO 1 — ⭐ O RITO É DADO DO TENANT, E DOIS RITOS NÃO SE VEEM
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada órgão desenha o rito dele ==='

do $$
declare
  v_rito_alfa uuid; v_rito_beta uuid; v_n int; v_nome text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into proc.workflows (tenant_id, name, description)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Requerimentos',
          'o rito de um requerimento de alvará')
  returning id into v_rito_alfa;

  insert into proc.workflow_stages
    (tenant_id, workflow_id, position, name, requires_approval, skippable)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rito_alfa, 0, 'protocolado', false, false),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rito_alfa, 1, 'análise',     false, true),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rito_alfa, 2, 'instrução',   false, false),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rito_alfa, 3, 'parecer',     false, false),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rito_alfa, 4, 'decisão',     true,  false);

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- ⭐ Outro órgão, outro rito inteiro, na MESMA tabela, sem uma linha diferente.
  insert into proc.workflows (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Ouvidoria interna')
  returning id into v_rito_beta;

  insert into proc.workflow_stages
    (tenant_id, workflow_id, position, name, requires_approval, skippable)
  values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_rito_beta, 0, 'recebido', false, false),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_rito_beta, 1, 'triagem',  false, true),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_rito_beta, 2, 'resposta', false, false);

  select count(*) into v_n from proc.workflows;
  perform pg_temp.assert_proc(v_n = 1, 'o Beta enxerga só o rito dele');
  select name into v_nome from proc.workflows;
  perform pg_temp.assert_proc(v_nome = 'Ouvidoria interna', 'e é o dele mesmo');

  select count(*) into v_n from proc.workflow_stages;
  perform pg_temp.assert_proc(v_n = 3, 'e só as três etapas dele — não as cinco do vizinho');

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  select count(*) into v_n from proc.workflow_stages;
  perform pg_temp.assert_proc(v_n = 5, 'o espelho vale: o Alfa vê as cinco dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — O PROCESSO NASCE COM A PRIMEIRA LINHA DA TRILHA E COM O FATO
-- E ⭐ O NÚMERO DE PROTOCOLO É ÚNICO POR TENANT
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: protocolar escreve trilha e caixa de saída; o número é único ==='

do $$
declare
  v_rito uuid; v_stage uuid; v_proc uuid;
  v_n int; v_payload jsonb; v_produtor text; v_kind text; v_nome text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_rito from proc.workflows where name = 'Requerimentos';
  select id into v_stage from proc.workflow_stages where workflow_id = v_rito and position = 0;

  insert into proc.processes
    (tenant_id, workflow_id, current_stage_id, protocol_number,
     interested_party_name, subject, due_date)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rito, v_stage, '2026.0001',
          'Maria da Silva', 'Requerimento de alvará de funcionamento', '2026-09-30')
  returning id into v_proc;

  select count(*) into v_n from proc.movements where process_id = v_proc;
  perform pg_temp.assert_proc(v_n = 1, 'o processo nasce com exatamente uma linha de trilha');

  select kind, to_stage_name into v_kind, v_nome from proc.movements where process_id = v_proc;
  perform pg_temp.assert_proc(v_kind = 'registered', 'e a linha é a abertura');
  perform pg_temp.assert_proc(v_nome = 'protocolado', '⭐ e ela CARIMBA o nome da etapa');

  -- ⭐ O número de protocolo é ÚNICO POR TENANT: o mesmo número, recusado.
  begin
    insert into proc.processes
      (tenant_id, workflow_id, current_stage_id, protocol_number,
       interested_party_name, subject)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_rito, v_stage, '2026.0001',
            'João Souza', 'Outro requerimento');
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: dois processos com o mesmo protocolo');
  exception when unique_violation then
    perform pg_temp.assert_proc(true,
      '⭐ o número de protocolo é único por tenant — o cidadão cita um número que aponta um só processo');
  end;

  reset role;

  select count(*) into v_n from core.event_outbox where event_type = 'proc.process.registered';
  perform pg_temp.assert_proc(v_n = 1, 'emitiu exatamente um proc.process.registered');

  select payload, produced_by into v_payload, v_produtor
    from core.event_outbox where event_type = 'proc.process.registered';
  perform pg_temp.assert_proc(v_produtor = 'proc', 'o envelope carrega a procedência');
  perform pg_temp.assert_proc(
    v_payload ->> 'protocolNumber' = '2026.0001',
    '⭐ payload traz o NÚMERO DE PROTOCOLO — a identidade pública');
  perform pg_temp.assert_proc(
    v_payload ->> 'interestedPartyName' = 'Maria da Silva',
    '⭐ e o NOME do interessado — o processo é o pedido de alguém');
  perform pg_temp.assert_proc(
    v_payload ->> 'workflowName' = 'Requerimentos',
    '⭐ e o NOME do rito — quem escuta não pode resolver id daqui');
  perform pg_temp.assert_proc(
    v_payload ->> 'stageName' = 'protocolado', '⭐ e o NOME da etapa');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A PERMISSÃO QUE DEPENDE DO DESENHO DO TENANT
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: quem não decide não passa da etapa que pede aprovação ==='

do $$
declare v_rito uuid; v_s0 uuid; v_proc uuid; v_erro text; v_n int; v_atual uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta, sem decide

  select id into v_rito from proc.workflows where name = 'Ouvidoria interna';

  -- O Beta marca a triagem como etapa de aprovação. Desenho dele.
  update proc.workflow_stages set requires_approval = true
   where workflow_id = v_rito and name = 'triagem';

  select id into v_s0 from proc.workflow_stages where workflow_id = v_rito and position = 0;

  insert into proc.processes
    (tenant_id, workflow_id, current_stage_id, protocol_number, interested_party_name, subject)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_rito, v_s0, 'OUV-1', 'Anônimo', 'Reclamação')
  returning id into v_proc;

  -- 'recebido' NÃO pede aprovação: `manage` basta, e ele passa.
  perform proc.advance_process(v_proc, 'manifestação recebida');
  select current_stage_id into v_atual from proc.processes where id = v_proc;
  select count(*) into v_n from proc.workflow_stages where id = v_atual and name = 'triagem';
  perform pg_temp.assert_proc(v_n = 1, 'com manage ele passa da etapa comum');

  -- 'triagem' pede aprovação: sem `decide`, o banco recusa.
  begin
    perform proc.advance_process(v_proc, 'tentando passar da triagem');
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: passou da etapa de aprovação sem decide');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert_proc(
      v_erro like '%proc.process.decide%',
      '⭐ trava na que pede aprovação, com o nome da permissão no erro');
  end;

  select count(*) into v_n from proc.movements where process_id = v_proc and kind = 'advanced';
  perform pg_temp.assert_proc(v_n = 1, 'a tentativa recusada não deixou linha na trilha');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ PULAR É ATO REGISTRADO, E EXIGE RAZÃO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: pular a etapa deixa rastro, e sem razão não pula ==='

do $$
declare v_proc uuid; v_erro text; v_n int; v_note text; v_de text; v_para text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_proc from proc.processes where protocol_number = '2026.0001';

  -- 'protocolado' → 'análise'
  perform proc.advance_process(v_proc, '');

  begin
    perform proc.skip_stage(v_proc, '   ');
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: pulou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert_proc(v_erro like '%razão%', 'pular sem razão é recusado');
  end;

  perform proc.skip_stage(v_proc, 'este requerimento dispensa análise prévia');

  select count(*) into v_n from proc.movements where process_id = v_proc and kind = 'skipped';
  perform pg_temp.assert_proc(v_n = 1, '⭐ pular escreveu UMA linha na trilha');

  select note, from_stage_name, to_stage_name into v_note, v_de, v_para
    from proc.movements where process_id = v_proc and kind = 'skipped';
  perform pg_temp.assert_proc(
    v_note = 'este requerimento dispensa análise prévia',
    '⭐ e a linha guarda a RAZÃO — pular não apaga, explica');
  perform pg_temp.assert_proc(v_de = 'análise' and v_para = 'instrução',
    'e guarda de onde para onde, pelo nome');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'proc.stage.skipped';
  perform pg_temp.assert_proc(v_n = 1, 'e o mundo soube: proc.stage.skipped saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⛔ ETAPA NÃO PULÁVEL NÃO PULA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: a etapa que o tenant não marcou como pulável não pula ==='

do $$
declare v_proc uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_proc from proc.processes where protocol_number = '2026.0001';

  begin
    -- O processo está em 'instrução', que nasceu com `skippable = false`.
    perform proc.skip_stage(v_proc, 'quero pular a instrução');
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: pulou etapa não pulável');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert_proc(
      v_erro like '%não foi desenhada como pulável%',
      'a etapa não pulável recusa — e o desenho é do tenant');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — ⭐⭐ A DECISÃO FORMAL: EXIGE DECIDE E O DESPACHO, É TERMINAL
-- -----------------------------------------------------------------------------
-- É aqui que este módulo diverge do `ops`. A decisão é ATO DE IMPÉRIO: exige
-- `decide` E o despacho (motivação obrigatória), é definitiva — não reabre e
-- não se devolve.
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: deferir/indeferir/arquivar exige despacho e é DEFINITIVO ==='

do $$
declare
  v_proc uuid; v_rito uuid; v_instrucao uuid; v_status text; v_n int; v_erro text;
  v_note text; v_payload jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id, workflow_id into v_proc, v_rito
    from proc.processes where protocol_number = '2026.0001';

  -- Anda até a última etapa: instrução → parecer → decisão.
  perform proc.advance_process(v_proc, '');
  perform proc.advance_process(v_proc, 'parecer favorável');

  -- Da última etapa não se avança: dali se decide.
  begin
    perform proc.advance_process(v_proc, '');
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: avançou da última etapa');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert_proc(v_erro like '%última etapa%', 'da última etapa se decide, não avança');
  end;

  -- ⭐ Decidir SEM despacho: recusado (decisão sem motivação é ato nulo).
  begin
    update proc.processes set status = 'deferred' where id = v_proc;
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: decidiu sem despacho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert_proc(v_erro like '%despacho%', '⭐ a decisão formal exige o despacho');
  end;

  -- ⭐ Com o despacho: defere.
  update proc.processes
     set status = 'deferred',
         decision_note = 'Deferido nos termos do parecer técnico. Alvará autorizado.'
   where id = v_proc;

  select status into v_status from proc.processes where id = v_proc;
  perform pg_temp.assert_proc(v_status = 'deferred', 'o processo foi deferido');

  select count(*) into v_n from proc.movements where process_id = v_proc and kind = 'decided';
  perform pg_temp.assert_proc(v_n = 1, '⭐ decidir escreveu a linha na trilha — não só o evento');

  select note into v_note from proc.movements where process_id = v_proc and kind = 'decided';
  perform pg_temp.assert_proc(
    v_note like '%Alvará autorizado%',
    '⭐ e a linha carimba o DESPACHO, imutável');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'proc.process.decided';
  perform pg_temp.assert_proc(v_n = 1, 'emitiu proc.process.decided uma vez');
  select payload into v_payload from core.event_outbox where event_type = 'proc.process.decided';
  perform pg_temp.assert_proc(v_payload ->> 'decision' = 'deferred',
    '⭐ o envelope carrega o desfecho da decisão');

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⭐⭐ A DIVERGÊNCIA DO OPS: processo DECIDIDO NÃO REABRE.
  begin
    update proc.processes set status = 'in_progress' where id = v_proc;
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: reabriu processo decidido');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert_proc(
      v_erro like '%não existe no ciclo de vida%',
      '⭐⭐ o ato de império é TERMINAL — não reabre (o DIVERGE do ops, cujo done volta)');
  end;

  -- ⭐⭐ E processo decidido NÃO SE DEVOLVE.
  select id into v_instrucao from proc.workflow_stages
   where workflow_id = v_rito and name = 'instrução';
  begin
    perform proc.send_back_process(v_proc, v_instrucao, 'reabrir para novo parecer');
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: devolveu processo decidido');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert_proc(
      v_erro like '%definitivo%',
      '⭐⭐ processo decidido não se devolve — reabrir é recurso ou novo protocolo');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 7 — ⭐ A TRILHA SOBREVIVE AO APAGAMENTO DA ETAPA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: apagar a etapa não apaga a história ==='

do $$
declare v_rito uuid; v_analise uuid; v_decisao uuid; v_n int; v_nome text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_rito from proc.workflows where name = 'Requerimentos';
  select id into v_analise from proc.workflow_stages where workflow_id = v_rito and name = 'análise';
  select id into v_decisao from proc.workflow_stages where workflow_id = v_rito and name = 'decisão';

  -- ⛔ Primeiro, o outro lado: a etapa ONDE HÁ processo não se apaga. O processo
  -- decidido ainda referencia 'decisão' pela `current_stage_id`.
  begin
    delete from proc.workflow_stages where id = v_decisao;
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: apagou etapa com processo em cima');
  exception when foreign_key_violation then
    perform pg_temp.assert_proc(true, '⛔ a etapa onde há processo não se apaga');
  end;

  -- A 'análise' foi PULADA e ninguém está nela: pode sair.
  delete from proc.workflow_stages where id = v_analise;

  select count(*) into v_n from proc.workflow_stages where id = v_analise;
  perform pg_temp.assert_proc(v_n = 0, 'a etapa saiu do rito');

  select from_stage_name into v_nome from proc.movements
   where kind = 'skipped' and from_stage_id = v_analise;
  perform pg_temp.assert_proc(
    v_nome = 'análise',
    '⭐ e a trilha continua dizendo "análise" — o nome carimbado sobrevive ao dado');
end $$;

-- =============================================================================
-- CENÁRIO 8 — ⛔ A TRILHA É IMUTÁVEL NAS TRÊS CAMADAS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 8: nem o dono do banco edita a trilha ==='

do $$
declare v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    update proc.movements set note = 'reescrevendo a história';
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: authenticated editou a trilha');
  exception when others then
    perform pg_temp.assert_proc(true, 'camadas 1 e 2: authenticated não edita a trilha');
  end;

  begin
    insert into proc.movements (tenant_id, process_id, kind)
    select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, 'advanced'
      from proc.processes limit 1;
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: authenticated inventou movimento');
  exception when others then
    perform pg_temp.assert_proc(true,
      '⭐ e não INVENTA movimento: a trilha só se escreve pelas funções de §6');
  end;

  reset role;

  begin
    update proc.movements set note = 'reescrevendo a história';
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: o dono do banco editou a trilha');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert_proc(
      v_erro like '%fato consumado%', '⭐ camada 3: nem o dono do banco edita a trilha');
  end;

  begin
    delete from proc.movements;
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: o dono do banco apagou a trilha');
  exception when insufficient_privilege then
    perform pg_temp.assert_proc(true, 'e nem apaga');
  end;

  select count(*) into v_n from proc.movements;
  perform pg_temp.assert_proc(v_n > 0, 'a trilha continua inteira depois das quatro tentativas');
end $$;

-- =============================================================================
-- CENÁRIO 9 — ⛔ QUEM NÃO TEM ACESSO NÃO VÊ, E NÃO MOVE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 9: o usuário sem permissão do módulo não enxerga nada ==='

do $$
declare v_n int; v_proc uuid;
begin
  reset role;
  select id into v_proc from proc.processes where protocol_number = '2026.0001';

  set local role authenticated;
  -- `user-c` não tem nenhuma permissão `proc.*` em nenhum tenant.
  set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

  select count(*) into v_n from proc.processes;
  perform pg_temp.assert_proc(v_n = 0, 'quem não tem permissão do módulo não vê processo nenhum');
  select count(*) into v_n from proc.workflows;
  perform pg_temp.assert_proc(v_n = 0, 'nem rito');
  select count(*) into v_n from proc.movements;
  perform pg_temp.assert_proc(v_n = 0, 'nem trilha');

  begin
    perform proc.advance_process(v_proc, 'tentando mover o processo do vizinho');
    perform pg_temp.assert_proc(false, 'DEVERIA TER FALHADO: moveu processo sem acesso');
  exception when insufficient_privilege then
    perform pg_temp.assert_proc(true,
      '⭐ a função SECURITY DEFINER confere o acesso antes de mover — RLS não vale dentro dela');
  end;
end $$;

\echo ''
\echo '✅ 95_proc_isolation.sql — todos os cenários passaram.'
