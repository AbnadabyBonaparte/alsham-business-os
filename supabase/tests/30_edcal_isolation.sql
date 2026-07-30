-- =============================================================================
-- O MÓDULO 25 NO BANCO — o canal do tenant, o fluxo desenhado, o plano que
-- muda livre e o fato que congela com a data real
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o calendário de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta desenha e planeja, mas NÃO registra o fim;
--   2. ⭐ **a pauta nasce planejada**, num canal VIVO (o arquivado recusa
--      pauta nova) e o canal ATIVO não duplica nome;
--   3. ⭐ **mover é função com trilha** (nome carimbado, imutável até para
--      o dono) e **reagendar é UPDATE honesto SEM trilha** — os dois lados
--      da decisão de canon, contra o banco real;
--   4. ⭐ **o fim carimba pelo servidor** (a data real ao lado da
--      planejada), CONGELA a peça e é TERMINAL; descartar exige a razão;
--   5. ⭐ a etapa com pauta parada não se apaga (FK), e a apagada deixa a
--      história legível pelo NOME carimbado;
--   6. apagar pauta não existe; a caneta de emitir evento não é do
--      cliente; o texto de trabalho não passeia no envelope.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert30(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Calendário Editorial nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'edcal', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'edcal', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) tem as TRÊS mãos;
-- `user-b` (Beta) desenha e planeja, mas NÃO registra o fim.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, p.k, 'edcal'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
  cross join (values ('edcal.design.manage'), ('edcal.piece.manage')) as p(k)
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'edcal.piece.decide', 'edcal'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois desenham e planejam; só o Alfa decreta o fim.'

-- =============================================================================
-- CENÁRIO 1 — O DESENHO: canal vivo, canal no arquivo, fluxo do tenant
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: canais e etapas do tenant; o ativo não duplica nome; cada um no seu calendário ==='

do $$
declare
  v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into edcal.channels (tenant_id, name) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'blog'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'mural da entrada');
  update edcal.channels set status = 'archived'
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'mural da entrada';

  -- Dois canais ATIVOS com o mesmo nome confundiriam a pauta.
  begin
    insert into edcal.channels (tenant_id, name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  BLOG ');
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: canal vivo em dobro');
  exception when unique_violation then
    perform pg_temp.assert30(true, 'canal ATIVO não duplica nome — o arquivo pode guardar homônimos');
  end;

  insert into edcal.stages (tenant_id, name, position) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pauta', 0),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'redação', 1),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'revisão', 2);
  perform pg_temp.assert30(true, '⭐ o fluxo é DESENHO do tenant — três etapas do jeito dele');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into edcal.channels (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'newsletter');
  insert into edcal.stages (tenant_id, name, position)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rascunho', 0);

  select count(*) into v_n from edcal.channels;
  perform pg_temp.assert30(v_n = 1, 'o Beta enxerga só os canais dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — O NASCIMENTO: planejada, em canal VIVO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: nasce planejada; o canal guardado recusa pauta nova ==='

do $$
declare
  v_canal uuid; v_morto uuid; v_etapa uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_canal from edcal.channels
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'blog';
  select id into v_morto from edcal.channels
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'mural da entrada';
  select id into v_etapa from edcal.stages
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'pauta';

  begin
    insert into edcal.pieces (tenant_id, title, channel_id, current_stage_id, planned_on, status, published_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasceu no ar', v_canal, v_etapa, '2026-08-10', 'published', now());
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: nasceu no ar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert30(v_erro like '%nasce planejada%', 'a pauta nasce planejada');
  end;

  begin
    insert into edcal.pieces (tenant_id, title, channel_id, current_stage_id, planned_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Pauta no canal guardado', v_morto, v_etapa, '2026-08-10');
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: pauta em canal guardado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert30(v_erro like '%arquivado%', '⭐ canal fora do ativo não recebe pauta nova');
  end;

  insert into edcal.pieces (tenant_id, title, brief, channel_id, current_stage_id, planned_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Bastidores da reforma',
          'fotos da obra e fala do síndico', v_canal, v_etapa, '2026-08-10');
  perform pg_temp.assert30(true, 'a pauta nasceu planejada, no fluxo, com data de plano');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ MOVER TEM TRILHA; REAGENDAR NÃO — os dois lados da decisão
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a trilha carimba o nome; o plano muda sem trilha; a trilha não se rasura ==='

do $$
declare
  v_id uuid; v_para uuid; v_nome text; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from edcal.pieces
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Bastidores da reforma';
  select id into v_para from edcal.stages
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'redação';

  perform edcal.move_piece(v_id, v_para, 'roteiro aprovado na reunião');

  select to_stage_name into v_nome from edcal.piece_events
   where piece_id = v_id and kind = 'moved';
  perform pg_temp.assert30(v_nome = 'redação', '⭐ mover escreveu a trilha — com o NOME carimbado');

  begin
    perform edcal.move_piece(v_id, v_para, '');
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: moveu para onde estava');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert30(v_erro like '%já está%', 'mover para a mesma etapa é recusado');
  end;

  -- ⭐ REAGENDAR é UPDATE honesto: o plano muda, a trilha NÃO cresce.
  select count(*) into v_n from edcal.piece_events where piece_id = v_id;
  update edcal.pieces set planned_on = '2026-08-17' where id = v_id;
  perform pg_temp.assert30(
    (select count(*) from edcal.piece_events where piece_id = v_id) = v_n,
    '⭐ reagendar não escreve trilha — o calendário é plano, não fato');

  -- A trilha não se escreve à mão…
  begin
    insert into edcal.piece_events (tenant_id, piece_id, kind, note)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 'moved', 'linha forjada');
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: escreveu a trilha à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert30(true, 'a trilha só nasce pelos atos — a aplicação não a escreve');
  end;

  -- …nem se rasura, nem como dono do banco.
  reset role;
  begin
    delete from edcal.piece_events where piece_id = v_id;
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: rasurou a trilha como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert30(v_erro like '%fato consumado%', '⭐ a trilha não se apaga nem como dono do banco');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O FIM: a data real do servidor, o congelamento, o terminal
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: só quem decide registra o fim; a data real é do servidor; o fato congela ==='

do $$
declare
  v_id uuid; v_beta_canal uuid; v_beta_etapa uuid; v_beta_pauta uuid;
  v_by uuid; v_real timestamptz; v_erro text; v_payload jsonb;
begin
  set local role authenticated;

  -- O Beta (desenha e planeja) NÃO registra o fim.
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_beta_canal from edcal.channels
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;
  select id into v_beta_etapa from edcal.stages
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;
  insert into edcal.pieces (tenant_id, title, channel_id, current_stage_id, planned_on)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Edição de agosto', v_beta_canal, v_beta_etapa, '2026-08-01')
  returning id into v_beta_pauta;

  begin
    update edcal.pieces set status = 'published' where id = v_beta_pauta;
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: o Beta registrou o fim');
  exception when insufficient_privilege then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert30(
      v_erro like '%edcal.piece.decide%',
      '⭐ registrar o fim é mão própria — com o nome da permissão no erro');
  end;

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select id into v_id from edcal.pieces
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Bastidores da reforma';

  -- Descartar sem explicar é recusado.
  begin
    update edcal.pieces set status = 'dropped' where id = v_id;
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: descartou sem explicar');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert30(v_erro like '%razão%', '⭐ descartar exige a razão');
  end;

  -- O ATO: foi ao ar — a data real é do servidor, ao lado da planejada.
  perform edcal.close_piece(v_id, 'published', '');
  select published_by, published_at into v_by, v_real from edcal.pieces where id = v_id;
  perform pg_temp.assert30(
    v_by = '11111111-1111-4111-8111-111111111111' and v_real is not null,
    '⭐ o fim carimbou QUEM e QUANDO — pelo servidor, com a planejada preservada');

  -- ⭐ E o fato CONGELA.
  begin
    update edcal.pieces set title = 'outro título' where id = v_id;
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: mudou a pauta encerrada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert30(v_erro like '%não se reescreve%', '⭐ o fim é registro de fato — congela');
  end;

  begin
    update edcal.pieces set status = 'planned' where id = v_id;
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: reviveu a pauta');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert30(v_erro like '%terminal%', '⭐ o fim é terminal — a pauta que revive é pauta nova');
  end;

  reset role;
  -- ⭐ O texto de trabalho NÃO passeia no envelope — no payload REAL.
  select payload into v_payload from core.event_outbox
   where event_type = 'edcal.piece.published'
     and payload->>'pieceId' = v_id::text;
  perform pg_temp.assert30(
    v_payload is not null and not (v_payload ? 'brief')
      and v_payload->>'channelName' = 'blog'
      and v_payload->>'plannedOn' = '2026-08-17'
      and v_payload->>'publishedAt' is not null,
    '⭐ o envelope leva o par de datas e os nomes — e o texto de trabalho fica em casa');
end $$;

-- =============================================================================
-- CENÁRIO 5 — O REDESENHO: a etapa presa, a etapa apagada, a história legível
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: etapa com pauta parada não sai; a apagada deixa a trilha legível; apagar pauta não existe ==='

do $$
declare
  v_etapa uuid; v_livre uuid; v_id uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

  -- A etapa do Beta tem pauta parada: a FK segura.
  select id into v_etapa from edcal.stages
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' limit 1;
  begin
    delete from edcal.stages where id = v_etapa;
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: apagou etapa com pauta parada');
  exception when foreign_key_violation then
    perform pg_temp.assert30(true, '⭐ etapa com pauta parada não se apaga — o contrapeso da porta de DELETE');
  end;

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- A 'revisão' está vazia: sai. E a história de quem passou por 'redação'
  -- continua legível pelo NOME, mesmo que o desenho mude inteiro.
  select id into v_livre from edcal.stages
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'revisão';
  delete from edcal.stages where id = v_livre;
  select count(*) into v_n from edcal.piece_events
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and to_stage_name = 'redação';
  perform pg_temp.assert30(v_n >= 1, '⭐ o redesenho não apaga a história — o nome carimbado fica');

  select id into v_id from edcal.pieces
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;
  begin
    delete from edcal.pieces where id = v_id;
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: apagou pauta');
  exception when insufficient_privilege then
    perform pg_temp.assert30(true, 'apagar pauta não existe — o fim é status com registro');
  end;

  begin
    perform edcal.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'edcal.piece.planned', '{}'::jsonb);
    perform pg_temp.assert30(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert30(true, 'edcal.emit_event não é concedida ao cliente');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'edcal.piece.moved';
  perform pg_temp.assert30(v_n = 1, 'edcal.piece.moved saiu uma vez — e reagendar não emitiu nada');
end $$;

\echo ''
\echo '=== MÓDULO 25 OK: canal do tenant, fluxo desenhado, plano livre, fato congelado com a data real, tenants isolados ==='
