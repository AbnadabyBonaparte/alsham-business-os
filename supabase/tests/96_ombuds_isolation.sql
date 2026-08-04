-- =============================================================================
-- O MÓDULO 86 NO BANCO — a Ouvidoria (Lei 13.460) que se ISOLA, e cujo CORAÇÃO é
-- o ANONIMATO (reaproveitado do whistle). ⭐⭐ A prova central: a manifestação
-- anônima nasce de um cidadão REAL, autenticado, e mesmo assim o servidor NUNCA
-- grava quem se manifestou — `reporter_id` fica NULL para sempre. Não é "não
-- mostra"; é NÃO TER. O cidadão anônimo acompanha pelo PROTOCOLO público.
-- =============================================================================
--
-- ⭐ Vertical 🏛 Governo (Onda Governo, Fase 3) — capacidade *Ouvidoria*.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert96(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: ombuds instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'ombuds', 'Ouvidoria', '0.1.0',
  'A manifestação nasce imutável; o tratamento anda. ⭐⭐ Anônima nunca grava o cidadão.',
  'vertical', 'government',
  '[{"key":"ombudsman","canonicalName":"Ouvidoria"}]'::jsonb,
  '[{"key":"ombuds.manifestation.submit","moduleId":"ombuds","description":"Manifestar-se."},
    {"key":"ombuds.manifestation.handle","moduleId":"ombuds","description":"Tratar (a ouvidoria)."}]'::jsonb,
  '[{"type":"ombuds.manifestation.registered","version":1,"description":"Registrada."},
    {"type":"ombuds.manifestation.reviewed","version":1,"description":"Em análise."},
    {"type":"ombuds.manifestation.answered","version":1,"description":"Respondida."},
    {"type":"ombuds.manifestation.dismissed","version":1,"description":"Arquivada."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ombuds', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ombuds', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⭐ O Alfa (user 1) é a ouvidoria E pode se manifestar: submit + handle.
-- O Beta (user 2) é um cidadão comum: SÓ submit — nunca lê o alheio.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ombuds.manifestation.submit', 'ombuds'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'ombuds.manifestation.handle', 'ombuds'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ⭐⭐ O ANONIMATO (o coração): a identidade é DESCARTADA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: manifestação anônima NUNCA grava o cidadão; a identificada, sim ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta (submit)

  -- Manifestação ANÔNIMA no PRÓPRIO tenant (bbbb). SEM RETURNING de propósito: a
  -- anônima tem reporter_id NULL, não casa com a política de SELECT do Beta
  -- (ele não tem handle), e nem o próprio autor a reencontra pela RLS.
  insert into ombuds.manifestations (tenant_id, manifestation_type, subject, description, is_anonymous)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'report',
          'Relato reservado', 'Descricao sensivel que jamais deve vazar', true);

  -- Manifestação NÃO-anônima: o Beta pode ver a própria (reporter_id = auth.uid()),
  -- então o RETURNING é permitido pela política de SELECT.
  insert into ombuds.manifestations (tenant_id, manifestation_type, subject, description, is_anonymous)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'complaint',
          'Relato assinado', 'Descricao identificada', false);
end $$;

do $$
begin
  reset role;  -- lê como dono do banco: só para CONFERIR o que o servidor gravou.

  -- ⭐⭐ A PROVA: um cidadão autenticado e real submeteu, e mesmo assim NÃO HÁ
  -- cidadão gravado. A única forma de nunca vazar é nunca ter.
  perform pg_temp.assert96(
    (select reporter_id is null
       from ombuds.manifestations
      where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and is_anonymous),
    '⭐⭐ ANONIMATO: a manifestação anônima tem reporter_id NULL — o servidor DESCARTOU a identidade');

  -- E a identificada: o servidor CARIMBOU quem submeteu (não o formulário).
  perform pg_temp.assert96(
    (select reporter_id = '22222222-2222-4222-8222-222222222222'
       from ombuds.manifestations
      where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and not is_anonymous),
    'a manifestação identificada tem reporter_id = quem submeteu (carimbo do servidor)');

  -- ⭐ O PROTOCOLO público foi carimbado pelo servidor, mesmo na anônima.
  perform pg_temp.assert96(
    (select bool_and(protocol ~ '^OUV-[0-9]{4}-[0-9A-F]{8}$')
       from ombuds.manifestations
      where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    '⭐ o protocolo público é carimbado pelo servidor (OUV-<ano>-<hex>), inclusive na anônima');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A CONSTRAINT como segunda camada do anonimato
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: a lei do anonimato também vive na tabela (constraint) ==='

-- O gatilho já anula o reporter (cenário 1). A tabela guarda a MESMA lei de
-- forma independente: anônima ⇒ sem cidadão. Testar o bypass direto do gatilho
-- exigiria desabilitá-lo; aqui basta provar que a constraint EXISTE — as duas
-- camadas juntas é que fazem "impossível gravar quem se manifestou".
do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n
    from pg_constraint
   where conname = 'ombuds_manifestations_anon_has_no_reporter';
  perform pg_temp.assert96(v_n = 1,
    '⭐ a constraint ombuds_manifestations_anon_has_no_reporter existe (segunda camada)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O RELATO É IMUTÁVEL: fato consumado não se reescreve
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: nem a ouvidoria reescreve o relato — só o tratamento anda ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (submit+handle)

  insert into ombuds.manifestations (tenant_id, manifestation_type, subject, description, is_anonymous)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'suggestion',
          'Relato do Alfa', 'Original imutavel do relato', false)
  returning id into v_id;

  begin
    update ombuds.manifestations set description = 'reescrito' where id = v_id;
    perform pg_temp.assert96(false, 'DEVERIA TER FALHADO: reescrever o relato');
  exception when insufficient_privilege then
    perform pg_temp.assert96(true,
      '⭐ o relato é fato consumado: o conteúdo não se reescreve (42501)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O CICLO: received → under_review → answered (resposta
--             obrigatória), e answered é TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o tratamento anda com resposta escrita; answered não reabre ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (handle)

  select id into v_id from ombuds.manifestations
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and subject = 'Relato do Alfa';

  -- received → under_review
  update ombuds.manifestations set status = 'under_review' where id = v_id;
  perform pg_temp.assert96(
    (select status = 'under_review' from ombuds.manifestations where id = v_id),
    'received → under_review: a ouvidoria assumiu a manifestação');

  -- Encerrar com resposta VAZIA é recusado.
  begin
    update ombuds.manifestations set status = 'answered' where id = v_id;
    perform pg_temp.assert96(false, 'DEVERIA TER FALHADO: encerrar sem resposta escrita');
  exception when invalid_parameter_value then
    perform pg_temp.assert96(true, '⭐ encerrar a manifestação exige a resposta escrita (22023)');
  end;

  -- Com resposta, o servidor carimba answered_at/answered_by.
  update ombuds.manifestations set status = 'answered', response = 'Providencia tomada' where id = v_id;
  perform pg_temp.assert96(
    (select status = 'answered' and answered_at is not null
        and answered_by = '11111111-1111-4111-8111-111111111111'
       from ombuds.manifestations where id = v_id),
    'responder com resposta carimba answered_at/answered_by pelo servidor');

  -- answered é TERMINAL: answered → received não existe no ciclo.
  begin
    update ombuds.manifestations set status = 'received' where id = v_id;
    perform pg_temp.assert96(false, 'DEVERIA TER FALHADO: reabrir manifestação respondida');
  exception when invalid_parameter_value then
    perform pg_temp.assert96(true, '⭐ answered é TERMINAL: answered → received não existe (22023)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CONFIDENCIALIDADE: o cidadão comum não lê o alheio; anon fora
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o Beta (só submit) vê apenas a PRÓPRIA não-anônima; anon nada ==='

do $$
declare v_n int; v_anon int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta (só submit)

  -- No tenant do Beta há DUAS manifestações dele (uma anônima, uma não). Ele só
  -- alcança a NÃO-anônima; a anônima não casa com ninguém, nem com o autor.
  select count(*) into v_n from ombuds.manifestations;
  perform pg_temp.assert96(v_n = 1,
    '⭐ o Beta vê só a própria manifestação NÃO-anônima (a anônima nem o autor reencontra)');

  select count(*) into v_anon from ombuds.manifestations where is_anonymous;
  perform pg_temp.assert96(v_anon = 0,
    '⭐ a manifestação anônima é invisível a quem só tem submit — inclusive ao próprio autor');

  -- A caneta do correio é fechada: o cliente não emite fato à mão.
  begin
    perform ombuds.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                              'ombuds.manifestation.registered', '{}'::jsonb);
    perform pg_temp.assert96(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert96(true, 'ombuds.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from ombuds.manifestations limit 1;
    perform pg_temp.assert96(false, 'DEVERIA TER FALHADO: anon leu ombuds.manifestations');
  exception when insufficient_privilege then
    perform pg_temp.assert96(true, '⭐ anon não encosta em ombuds.manifestations (consulta pública é API futura)');
  end;
  reset role;
end $$;

-- =============================================================================
-- CENÁRIO 6 — OS FATOS NO CORREIO, E O RELATO QUE NÃO PASSEIA NO ENVELOPE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: registered/reviewed/answered no outbox; o relato NÃO viaja ==='

do $$
declare v_n int;
begin
  reset role;

  select count(*) into v_n from core.event_outbox
   where event_type = 'ombuds.manifestation.registered';
  perform pg_temp.assert96(v_n >= 1, 'cada manifestação registrada emitiu ombuds.manifestation.registered');

  select count(*) into v_n from core.event_outbox
   where event_type = 'ombuds.manifestation.reviewed';
  perform pg_temp.assert96(v_n >= 1, 'o início da análise emitiu ombuds.manifestation.reviewed');

  select count(*) into v_n from core.event_outbox
   where event_type = 'ombuds.manifestation.answered';
  perform pg_temp.assert96(v_n >= 1, 'a resposta emitiu ombuds.manifestation.answered');

  -- ⭐ PRIVACIDADE NO ENVELOPE: o texto do relato NUNCA vai ao fato. O payload
  -- carrega só metadado seguro (manifestationId/protocol/manifestationType/isAnonymous/status).
  select count(*) into v_n from core.event_outbox
   where event_type = 'ombuds.manifestation.registered'
     and payload::text ilike '%Descricao sensivel que jamais deve vazar%';
  perform pg_temp.assert96(v_n = 0,
    '⭐ o relato NÃO passeia no envelope: nenhum payload de registered contém o texto');

  -- E o cidadão identificado também não viaja no fato.
  select count(*) into v_n from core.event_outbox
   where event_type = 'ombuds.manifestation.registered'
     and payload::text ilike '%reporter%';
  perform pg_temp.assert96(v_n = 0,
    '⭐ o envelope não carrega o cidadão — só metadado seguro');
end $$;

\echo ''
\echo '=== MÓDULO 86 OK: anônima nunca grava o cidadão, protocolo público, relato imutável, ciclo com resposta, confidencialidade na RLS, relato fora do envelope ==='
