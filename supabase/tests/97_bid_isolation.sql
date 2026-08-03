-- =============================================================================
-- O MÓDULO 87 NO BANCO — a licitação que se isola, que CONGELA ao publicar o
-- edital, recebe propostas imutáveis dos licitantes, e a HOMOLOGAÇÃO do
-- vencedor: decisão do órgão, carimbada pelo servidor
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. as licitações de um tenant não aparecem no outro — e a assimetria
--      user-a × user-b: o Beta GERE (cadastra/publica) mas não HOMOLOGA;
--   2. ⭐ **PUBLICAR CONGELA** — depois de `open`, mudar o título/edital ou uma
--      linha RAISES;
--   3. ⭐ **PROPOSTAS** — só se recebem com o edital ABERTO; são IMUTÁVEIS
--      (update/delete recusados até para o dono); no rascunho não entram;
--   4. ⭐ **homologar exige bid.tender.homologate** — o Beta é barrado; e
--      homologar sem escolher o vencedor falha; o vencedor válido é carimbado (o
--      homologated_by mentido é descartado pelo servidor);
--   5. **cancelar exige razão**; e o terminal é terminal — a homologada não anda
--      mais;
--   6. apagar não existe; a caneta de emitir evento não é do cliente; o `anon`
--      não encosta na tabela. Cross-tenant também é barrado.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert97(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: bid instalado; Alfa homologa, Beta só gere ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bid', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bid', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'bid.tender.manage', 'bid'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

-- ⭐ ASSIMETRIA: só o Alfa homologa. O Beta cadastra, edita e publica, não decide.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'bid.tender.homologate', 'bid'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois gerem; só o Alfa homologa o vencedor.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO EM RASCUNHO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com a sua licitação; nasce draft; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- ⭐ Mente o autor no INSERT: diz que foi o Beta. O gatilho descarta.
  insert into bid.tenders (tenant_id, title, description, modality, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Pavimentação da Rua X', 'edital 001/2026',
          'Pregão eletrônico', '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert97(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  insert into bid.lines (tenant_id, tender_id, line_no, item, quantity, unit)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 1, 'Asfalto CBUQ', 500, 't'),
         ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 2, 'Meio-fio', 800, 'm');

  begin
    insert into bid.tenders (tenant_id, title, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errada', 'open');
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: nasceu aberta');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%nasce em rascunho%', 'a licitação nasce em rascunho');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into bid.tenders (tenant_id, title)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Uniformes escolares')
  returning id into v_id;
  insert into bid.lines (tenant_id, tender_id, line_no, item, quantity)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_id, 1, 'Camisa', 300);

  select count(*) into v_n from bid.tenders;
  perform pg_temp.assert97(v_n = 1, 'o Beta enxerga só a licitação dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ PUBLICAR CONGELA: título/edital e itens não mudam mais
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: publicar o edital congela o conteúdo ==='

do $$
declare
  v_id uuid; v_status text; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from bid.tenders
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Pavimentação da Rua X';

  update bid.tenders set status = 'open' where id = v_id;
  select status into v_status from bid.tenders where id = v_id;
  perform pg_temp.assert97(v_status = 'open', 'o edital foi publicado (open)');

  begin
    update bid.tenders set title = 'Outro título' where id = v_id;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: mudou o título depois de publicar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%não mudam mais%', '⭐ título congelado depois da publicação');
  end;

  begin
    update bid.tenders set modality = 'Concorrência' where id = v_id;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: mudou a modalidade depois de publicar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%não mudam mais%', '⭐ modalidade congelada depois da publicação');
  end;

  begin
    update bid.lines set item = 'Asfalto PMF' where tender_id = v_id and line_no = 1;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: mudou uma linha depois de publicar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%não mudam mais%', '⭐ a linha congelada depois da publicação');
  end;

  begin
    insert into bid.lines (tenant_id, tender_id, line_no, item, quantity)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 3, 'Sinalização', 20);
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: acrescentou linha depois de publicar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%não mudam mais%', '⭐ não se acrescenta item fora do rascunho');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'bid.tender.opened';
  perform pg_temp.assert97(v_n = 1, 'o fato de publicação saiu');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ PROPOSTAS: só com edital aberto, imutáveis, e não no rascunho
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: propostas só na janela aberta; fato consumado, não se rasura ==='

do $$
declare
  v_id_open uuid; v_id_draft uuid; v_prop uuid; v_n int; v_erro text; v_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id_open from bid.tenders
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Pavimentação da Rua X';

  -- Recebe uma proposta no edital aberto — e MENTE o created_by. O servidor carimba.
  insert into bid.proposals (tenant_id, tender_id, bidder_id, bidder_name, amount_cents, currency, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id_open,
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Construtora Alfa', 4500000, 'BRL',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_prop, v_by;

  perform pg_temp.assert97(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by da proposta é quem está autenticado — o autor mentido foi descartado');

  insert into bid.proposals (tenant_id, tender_id, bidder_name, amount_cents)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id_open, 'Empreiteira Beta', 4800000);

  select count(*) into v_n from bid.proposals where tender_id = v_id_open;
  perform pg_temp.assert97(v_n = 2, 'as duas propostas foram registradas');

  -- ⭐ A proposta é IMUTÁVEL: update recusado.
  begin
    update bid.proposals set amount_cents = 1 where id = v_prop;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: editou uma proposta');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%fato consumado%' or v_erro like '%insufficient%',
      '⭐ a proposta não se edita — fato consumado');
  end;

  -- ⭐ E delete recusado (segunda camada — gatilho até para o dono).
  begin
    delete from bid.proposals where id = v_prop;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: apagou uma proposta');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%fato consumado%' or v_erro like '%insufficient%',
      '⭐ a proposta não se apaga — fato consumado');
  end;

  -- ⛔ No rascunho não entra proposta: nada foi a mercado ainda.
  insert into bid.tenders (tenant_id, title)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Merenda escolar')
  returning id into v_id_draft;
  begin
    insert into bid.proposals (tenant_id, tender_id, bidder_name, amount_cents)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id_draft, 'Alimentos Gama', 100000);
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: proposta num edital em rascunho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%ABERTO%', '⛔ proposta só com o edital aberto');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ HOMOLOGAR: exige homologate, exige vencedor, carimba pelo servidor
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: homologar é decisão do órgão (homologate) ==='

do $$
declare
  v_id_a uuid; v_id_b uuid; v_status text; v_by uuid; v_at timestamptz; v_erro text; v_n int;
begin
  set local role authenticated;

  -- Beta publica a sua licitação e TENTA homologar — barrado (não tem homologate).
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_id_b from bid.tenders
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and title = 'Uniformes escolares';
  update bid.tenders set status = 'open' where id = v_id_b;

  begin
    update bid.tenders
       set status = 'homologated',
           homologated_bidder_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
           homologated_bidder_name = 'Malharia B'
     where id = v_id_b;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: o Beta homologou sem homologate');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%bid.tender.homologate%', '⭐ homologar exige bid.tender.homologate');
  end;

  -- Alfa homologa — mas sem escolher o vencedor: recusado.
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id_a from bid.tenders
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Pavimentação da Rua X';

  begin
    update bid.tenders set status = 'homologated' where id = v_id_a;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: homologou sem escolher o vencedor');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%licitante vencedor%', '⭐ homologar exige escolher o vencedor');
  end;

  -- Alfa homologa com o vencedor — e MENTE o homologated_by. O servidor carimba.
  update bid.tenders
     set status = 'homologated',
         homologated_bidder_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
         homologated_bidder_name = 'Construtora Alfa',
         homologated_by = '22222222-2222-4222-8222-222222222222'
   where id = v_id_a;

  select status, homologated_by, homologated_at into v_status, v_by, v_at
    from bid.tenders where id = v_id_a;
  perform pg_temp.assert97(v_status = 'homologated', 'a licitação foi homologada');
  perform pg_temp.assert97(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ homologated_by é quem homologou — o autor mentido foi descartado');
  perform pg_temp.assert97(v_at is not null, 'homologated_at foi carimbado pelo servidor');

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'bid.tender.homologated';
  perform pg_temp.assert97(v_n = 1, 'o fato da homologação saiu');
end $$;

-- =============================================================================
-- CENÁRIO 5 — CANCELAR EXIGE RAZÃO; O TERMINAL É TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: cancelar exige razão; a homologada não anda mais ==='

do $$
declare
  v_id2 uuid; v_id_a uuid; v_status text; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  insert into bid.tenders (tenant_id, title)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Frota — pneus')
  returning id into v_id2;
  insert into bid.lines (tenant_id, tender_id, line_no, item, quantity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id2, 1, 'Pneu 275/80', 12);
  update bid.tenders set status = 'open' where id = v_id2;

  begin
    update bid.tenders set status = 'cancelled' where id = v_id2;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: cancelou sem razão');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%razão%', 'cancelar exige uma razão');
  end;

  update bid.tenders set status = 'cancelled', cancel_reason = 'licitação deserta'
   where id = v_id2;
  select status into v_status from bid.tenders where id = v_id2;
  perform pg_temp.assert97(v_status = 'cancelled', 'cancelou com razão');

  -- A homologada do cenário 4 é terminal: não anda mais.
  select id into v_id_a from bid.tenders
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Pavimentação da Rua X';
  begin
    update bid.tenders set status = 'cancelled', cancel_reason = 'tentando reabrir'
     where id = v_id_a;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: moveu a licitação homologada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert97(v_erro like '%não existe%', '⭐ a homologada é terminal — refazer é licitação nova');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'bid.tender.cancelled';
  perform pg_temp.assert97(v_n = 1, 'o fato do cancelamento saiu');
end $$;

-- =============================================================================
-- CENÁRIO 6 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON E CROSS-TENANT FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: apagar não existe; emit_event não é concedida; anon e cross-tenant barrados ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from bid.tenders
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from bid.tenders where id = v_id;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: apagou licitação');
  exception when insufficient_privilege then
    perform pg_temp.assert97(true, 'apagar não existe — licitação decidida é história pública');
  end;

  begin
    perform bid.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bid.tender.registered', '{}'::jsonb);
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert97(true, 'bid.emit_event não é concedida ao cliente');
  end;

  -- Cross-tenant: o Alfa não escreve no tenant do Beta (barrado pela RLS).
  begin
    insert into bid.tenders (tenant_id, title)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasora');
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert97(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from bid.tenders limit 1;
    perform pg_temp.assert97(false, 'DEVERIA TER FALHADO: anon leu bid.tenders');
  exception when insufficient_privilege then
    perform pg_temp.assert97(true, '⭐ anon não encosta em bid.tenders');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 87 OK: licitação isolada, edital congela ao publicar, propostas imutáveis, homologação do órgão carimbada, anon fora ==='
