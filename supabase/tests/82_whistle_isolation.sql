-- =============================================================================
-- O MÓDULO 77 NO BANCO — o Canal de Denúncias que se ISOLA, e cujo CORAÇÃO é o
-- ANONIMATO. ⭐⭐ A prova central: a denúncia anônima nasce de um usuário REAL,
-- autenticado, e mesmo assim o servidor NUNCA grava quem denunciou —
-- `reporter_id` fica NULL para sempre. Não é "não mostra"; é NÃO TER.
-- =============================================================================
--
-- ⭐ Domain 🏛 GRC (Onda Dezenove, Fase 3) — capacidade *Canal de denúncias*.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert82(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: whistle instalado nos dois tenants ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'whistle', 'Canal de Denúncias', '0.1.0',
  'O relato nasce imutável; o tratamento anda. ⭐⭐ Anônima nunca grava o denunciante.',
  'domain', 'grc',
  '[{"key":"whistle-channel","canonicalName":"Canal de denúncias"}]'::jsonb,
  '[{"key":"whistle.report.submit","moduleId":"whistle","description":"Denunciar."},
    {"key":"whistle.report.handle","moduleId":"whistle","description":"Tratar (comitê de ética)."}]'::jsonb,
  '[{"type":"whistle.report.registered","version":1,"description":"Registrada."},
    {"type":"whistle.report.reviewed","version":1,"description":"Em análise."},
    {"type":"whistle.report.resolved","version":1,"description":"Resolvida."},
    {"type":"whistle.report.dismissed","version":1,"description":"Arquivada sem procedência."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'whistle', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'whistle', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⭐ O Alfa (user 1) é o comitê de ética E pode denunciar: submit + handle.
-- O Beta (user 2) é um denunciante comum: SÓ submit — nunca lê o alheio.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'whistle.report.submit', 'whistle'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'whistle.report.handle', 'whistle'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ⭐⭐ O ANONIMATO (o coração): a identidade é DESCARTADA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: denúncia anônima NUNCA grava o denunciante; a identificada, sim ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta (submit)

  -- Denúncia ANÔNIMA no PRÓPRIO tenant (bbbb). SEM RETURNING de propósito: a
  -- anônima tem reporter_id NULL, não casa com a política de SELECT do Beta
  -- (ele não tem handle), e nem o próprio autor a reencontra.
  insert into whistle.reports (tenant_id, category, subject, description, is_anonymous)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'assedio',
          'Relato reservado', 'Descricao sensivel que jamais deve vazar', true);

  -- Denúncia NÃO-anônima: o Beta pode ver a própria (reporter_id = auth.uid()),
  -- então o RETURNING é permitido pela política de SELECT.
  insert into whistle.reports (tenant_id, category, subject, description, is_anonymous)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'financeiro',
          'Relato assinado', 'Descricao identificada', false);
end $$;

do $$
begin
  reset role;  -- lê como dono do banco: só para CONFERIR o que o servidor gravou.

  -- ⭐⭐ A PROVA: um usuário autenticado e real submeteu, e mesmo assim NÃO HÁ
  -- denunciante gravado. A única forma de nunca vazar é nunca ter.
  perform pg_temp.assert82(
    (select reporter_id is null
       from whistle.reports
      where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and is_anonymous),
    '⭐⭐ ANONIMATO: a denúncia anônima tem reporter_id NULL — o servidor DESCARTOU a identidade');

  -- E a identificada: o servidor CARIMBOU quem submeteu (não o formulário).
  perform pg_temp.assert82(
    (select reporter_id = '22222222-2222-4222-8222-222222222222'
       from whistle.reports
      where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and not is_anonymous),
    'a denúncia identificada tem reporter_id = quem submeteu (carimbo do servidor)');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ A CONSTRAINT como segunda camada do anonimato
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: a lei do anonimato também vive na tabela (constraint) ==='

-- O gatilho já anula o reporter (cenário 1). A tabela guarda a MESMA lei de
-- forma independente: anônima ⇒ sem denunciante. Testar o bypass direto do
-- gatilho exigiria desabilitá-lo; aqui basta provar que a constraint EXISTE —
-- as duas camadas juntas é que fazem "impossível gravar quem denunciou".
do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n
    from pg_constraint
   where conname = 'whistle_reports_anon_has_no_reporter';
  perform pg_temp.assert82(v_n = 1,
    '⭐ a constraint whistle_reports_anon_has_no_reporter existe (segunda camada)');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O RELATO É IMUTÁVEL: fato consumado não se reescreve
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: nem o comitê reescreve o relato — só o tratamento anda ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (submit+handle)

  insert into whistle.reports (tenant_id, category, subject, description, is_anonymous)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'conduta',
          'Relato do Alfa', 'Original imutavel do relato', false)
  returning id into v_id;

  begin
    update whistle.reports set description = 'reescrito' where id = v_id;
    perform pg_temp.assert82(false, 'DEVERIA TER FALHADO: reescrever o relato');
  exception when insufficient_privilege then
    perform pg_temp.assert82(true,
      '⭐ o relato é fato consumado: o conteúdo não se reescreve (42501)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O CICLO: open → under_review → resolved (desfecho obrigatório),
--             e resolved é TERMINAL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o tratamento anda com desfecho escrito; resolved não reabre ==='

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (handle)

  select id into v_id from whistle.reports
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and subject = 'Relato do Alfa';

  -- open → under_review
  update whistle.reports set status = 'under_review' where id = v_id;
  perform pg_temp.assert82(
    (select status = 'under_review' from whistle.reports where id = v_id),
    'open → under_review: o comitê assumiu a denúncia');

  -- Encerrar com desfecho VAZIO é recusado.
  begin
    update whistle.reports set status = 'resolved' where id = v_id;
    perform pg_temp.assert82(false, 'DEVERIA TER FALHADO: encerrar sem desfecho escrito');
  exception when invalid_parameter_value then
    perform pg_temp.assert82(true, '⭐ encerrar a denúncia exige o desfecho escrito (22023)');
  end;

  -- Com desfecho, o servidor carimba resolved_at/resolved_by.
  update whistle.reports set status = 'resolved', resolution = 'Apurado e tratado' where id = v_id;
  perform pg_temp.assert82(
    (select status = 'resolved' and resolved_at is not null
        and resolved_by = '11111111-1111-4111-8111-111111111111'
       from whistle.reports where id = v_id),
    'resolver com desfecho carimba resolved_at/resolved_by pelo servidor');

  -- resolved é TERMINAL: resolved → open não existe no ciclo.
  begin
    update whistle.reports set status = 'open' where id = v_id;
    perform pg_temp.assert82(false, 'DEVERIA TER FALHADO: reabrir denúncia resolvida');
  exception when invalid_parameter_value then
    perform pg_temp.assert82(true, '⭐ resolved é TERMINAL: resolved → open não existe (22023)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CONFIDENCIALIDADE: o denunciante comum não lê o alheio; anon fora
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: o Beta (só submit) vê apenas a PRÓPRIA não-anônima; anon nada ==='

do $$
declare v_n int; v_anon int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta (só submit)

  -- No tenant do Beta há DUAS denúncias dele (uma anônima, uma não). Ele só
  -- alcança a NÃO-anônima; a anônima não casa com ninguém, nem com o autor.
  select count(*) into v_n from whistle.reports;
  perform pg_temp.assert82(v_n = 1,
    '⭐ o Beta vê só a própria denúncia NÃO-anônima (a anônima nem o autor reencontra)');

  select count(*) into v_anon from whistle.reports where is_anonymous;
  perform pg_temp.assert82(v_anon = 0,
    '⭐ a denúncia anônima é invisível a quem só tem submit — inclusive ao próprio autor');

  -- A caneta do correio é fechada: o cliente não emite fato à mão.
  begin
    perform whistle.emit_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                               'whistle.report.registered', '{}'::jsonb);
    perform pg_temp.assert82(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert82(true, 'whistle.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from whistle.reports limit 1;
    perform pg_temp.assert82(false, 'DEVERIA TER FALHADO: anon leu whistle.reports');
  exception when insufficient_privilege then
    perform pg_temp.assert82(true, '⭐ anon não encosta em whistle.reports');
  end;
  reset role;
end $$;

-- =============================================================================
-- CENÁRIO 6 — OS FATOS NO CORREIO, E O RELATO QUE NÃO PASSEIA NO ENVELOPE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: registered/reviewed/resolved no outbox; o relato NÃO viaja ==='

do $$
declare v_n int;
begin
  reset role;

  select count(*) into v_n from core.event_outbox
   where event_type = 'whistle.report.registered';
  perform pg_temp.assert82(v_n >= 1, 'cada denúncia registrada emitiu whistle.report.registered');

  select count(*) into v_n from core.event_outbox
   where event_type = 'whistle.report.reviewed';
  perform pg_temp.assert82(v_n >= 1, 'o início da análise emitiu whistle.report.reviewed');

  select count(*) into v_n from core.event_outbox
   where event_type = 'whistle.report.resolved';
  perform pg_temp.assert82(v_n >= 1, 'a resolução emitiu whistle.report.resolved');

  -- ⭐ PRIVACIDADE NO ENVELOPE: o texto do relato NUNCA vai ao fato. O payload
  -- carrega só metadado seguro (reportId/category/isAnonymous/status).
  select count(*) into v_n from core.event_outbox
   where event_type = 'whistle.report.registered'
     and payload::text ilike '%Descricao sensivel que jamais deve vazar%';
  perform pg_temp.assert82(v_n = 0,
    '⭐ o relato NÃO passeia no envelope: nenhum payload de registered contém o texto');

  -- E o denunciante identificado também não viaja no fato.
  select count(*) into v_n from core.event_outbox
   where event_type = 'whistle.report.registered'
     and payload::text ilike '%reporter%';
  perform pg_temp.assert82(v_n = 0,
    '⭐ o envelope não carrega o denunciante — só metadado seguro');
end $$;

\echo ''
\echo '=== MÓDULO 77 OK: anônima nunca grava o denunciante, relato imutável, ciclo com desfecho, confidencialidade na RLS, relato fora do envelope ==='
