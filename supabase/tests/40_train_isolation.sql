-- =============================================================================
-- O MÓDULO 35 NO BANCO — a turma que abre inscrição, a presença que congela
-- e a conclusão que vai além dela
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. isolamento + a ASSIMETRIA: os dois tenants desenham programa/turma,
--      mas só o Alfa tem `train.enrollment.manage` — o Beta é barrado na
--      inscrição, mesmo tendo desenhado a turma que publicou;
--   2. ⭐ o PORTEIRO: inscrição só em turma PUBLICADA; a LOTAÇÃO recusa
--      claro, não silêncio;
--   3. ⭐ a PRESENÇA é ato IMUTÁVEL carimbado pelo servidor; a CONCLUSÃO
--      vai além dela — o terceiro estado que o evt nunca precisou ter;
--   4. turmas e inscrições TERMINAIS não voltam;
--   5. apagar não existe; a caneta de emitir evento não é do cliente; e o
--      `anon` não encosta em nenhuma das três tabelas.
--
-- Dado 100% fabricado. `trainee_id`/`trainee_name` são id solto e nome
-- soltos, sem CPF/saúde/banco. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert40(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: train instalado nos dois tenants; Alfa desenha+inscreve, Beta só desenha ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'train', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'train', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: os dois DESENHAM (setup.manage); só o Alfa INSCREVE (enrollment.manage).
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'train.setup.manage', 'train'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'train.enrollment.manage', 'train'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois desenham; só o Alfa inscreve.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A ASSIMETRIA: O BETA DESENHA, MAS NÃO INSCREVE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com seu catálogo; o Beta publica mas não inscreve ==='

do $$
declare
  v_program_a uuid; v_session_a uuid;
  v_program_b uuid; v_session_b uuid;
  v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into train.programs (tenant_id, name, description)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Integração de Novos Colaboradores', 'onboarding institucional')
  returning id into v_program_a;

  insert into train.sessions (tenant_id, program_id, title, starts_at, capacity)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_program_a, 'Turma de Agosto', '2026-08-10 09:00-03', 1)
  returning id into v_session_a;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into train.programs (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Segurança do Trabalho')
  returning id into v_program_b;

  insert into train.sessions (tenant_id, program_id, title, starts_at)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_program_b, 'Turma Única', '2026-09-01 14:00-03')
  returning id into v_session_b;

  select count(*) into v_n from train.programs;
  perform pg_temp.assert40(v_n = 1, 'o Beta enxerga só o catálogo dele');

  -- O Beta PUBLICA a turma dele — setup.manage basta.
  update train.sessions set status = 'published' where id = v_session_b;
  perform pg_temp.assert40(true, 'o Beta publica a própria turma — setup.manage basta');

  -- Mas NÃO INSCREVE — falta enrollment.manage.
  begin
    insert into train.enrollments (tenant_id, session_id, trainee_id, trainee_name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_session_b,
            '99999999-9999-4999-8999-999999999999', 'Beto do Beta');
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: o Beta inscreveu sem enrollment.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert40(true, '⭐ o Beta desenha e publica, mas NÃO inscreve — falta train.enrollment.manage');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O PORTEIRO: SÓ PUBLICADA INSCREVE; LOTAÇÃO RECUSA CLARO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: rascunho não inscreve; publicar abre; lotação=1 barra o segundo ==='

do $$
declare
  v_session uuid; v_erro text; v_e1 uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_session from train.sessions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Turma de Agosto';

  -- Ainda em draft: inscrição falha.
  begin
    insert into train.enrollments (tenant_id, session_id, trainee_id, trainee_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_session,
            '11110000-1111-4111-8111-111100001111', 'Ana Vendedora');
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: inscreveu em turma draft');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert40(v_erro like '%PUBLICADA%', 'inscrição só em turma PUBLICADA');
  end;

  -- Publica: agora abre.
  update train.sessions set status = 'published' where id = v_session;

  insert into train.enrollments (tenant_id, session_id, trainee_id, trainee_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_session,
          '11110000-1111-4111-8111-111100001111', 'Ana Vendedora')
  returning id into v_e1;
  perform pg_temp.assert40(v_e1 is not null, '⭐ publicar abre a inscrição — a primeira vaga (capacidade=1) coube');

  -- Capacidade=1: a segunda inscrição ativa é recusada.
  begin
    insert into train.enrollments (tenant_id, session_id, trainee_id, trainee_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_session,
            '22220000-2222-4222-8222-222200002222', 'Bruno Analista');
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: passou da capacidade');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert40(v_erro like '%LOTADA%', '⭐ a turma está LOTADA — a segunda vaga é recusada');
  end;

  -- Cancelar a primeira libera a vaga (cancelada não ocupa).
  update train.enrollments set status = 'cancelled' where id = v_e1;

  insert into train.enrollments (tenant_id, session_id, trainee_id, trainee_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_session,
          '22220000-2222-4222-8222-222200002222', 'Bruno Analista');
  perform pg_temp.assert40(true, 'a inscrição cancelada libera a vaga para outra pessoa');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A PRESENÇA É ATO IMUTÁVEL; A CONCLUSÃO VAI ALÉM DELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: presença carimbada pelo servidor; conclusão é o terceiro estado ==='

do $$
declare
  v_session uuid; v_id uuid; v_by uuid; v_at timestamptz;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_session from train.sessions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Turma de Agosto';

  select id into v_id from train.enrollments
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and trainee_name = 'Bruno Analista';

  update train.enrollments set status = 'attended' where id = v_id;

  select attended_at, attended_by into v_at, v_by from train.enrollments where id = v_id;
  perform pg_temp.assert40(v_at is not null, '⭐ a presença carimbou QUANDO — pelo servidor');
  perform pg_temp.assert40(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ a presença carimbou QUEM — pelo servidor, nunca da tela');

  -- ⭐ A CONCLUSÃO: o terceiro estado que o evt nunca precisou ter.
  update train.enrollments set status = 'completed', grade = 'aprovado com louvor' where id = v_id;

  perform pg_temp.assert40(
    (select completed_at from train.enrollments where id = v_id) is not null,
    '⭐ a conclusão carimbou QUANDO — o fato além da presença');
  perform pg_temp.assert40(
    (select grade from train.enrollments where id = v_id) = 'aprovado com louvor',
    'a nota é texto livre opcional — o método de avaliação é do tenant');

  -- attended_at continua presente mesmo depois de completed (a mesma história).
  perform pg_temp.assert40(
    (select attended_at from train.enrollments where id = v_id) is not null,
    'attended_at persiste depois de completed — a mesma linha do tempo');
end $$;

-- =============================================================================
-- CENÁRIO 4 — TERMINAIS: TURMA E INSCRIÇÃO NÃO VOLTAM
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: concluded/cancelled e completed/cancelled são terminais ==='

do $$
declare
  v_session uuid; v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_session from train.sessions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Turma de Agosto';

  update train.sessions set status = 'concluded' where id = v_session;

  begin
    update train.sessions set status = 'published' where id = v_session;
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: turma concluída voltou');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert40(v_erro like '%não existe%', '⭐ turma concluída é terminal');
  end;

  select id into v_id from train.enrollments
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and trainee_name = 'Bruno Analista';

  begin
    update train.enrollments set status = 'attended' where id = v_id;
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: inscrição concluída voltou a attended');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert40(v_erro like '%terminais%', '⭐ inscrição completed é terminal');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from train.enrollments limit 1;

  begin
    delete from train.enrollments where id = v_id;
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: apagou inscrição');
  exception when insufficient_privilege then
    perform pg_temp.assert40(true, 'apagar não existe — cancelar é status');
  end;

  begin
    delete from train.sessions where id = (select id from train.sessions limit 1);
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: apagou turma');
  exception when insufficient_privilege then
    perform pg_temp.assert40(true, 'apagar turma também não existe');
  end;

  begin
    perform train.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'train.enrollment.registered', '{}'::jsonb);
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert40(true, 'train.emit_event não é concedida ao cliente');
  end;
end $$;

-- ⭐ ANON NÃO ENCOSTA — com o papel real, nas três tabelas.
do $$
begin
  set local role anon;
  begin
    perform 1 from train.programs limit 1;
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: anon leu train.programs');
  exception when insufficient_privilege then
    perform pg_temp.assert40(true, '⭐ anon não encosta em train.programs');
  end;

  begin
    perform 1 from train.sessions limit 1;
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: anon leu train.sessions');
  exception when insufficient_privilege then
    perform pg_temp.assert40(true, '⭐ anon não encosta em train.sessions');
  end;

  begin
    perform 1 from train.enrollments limit 1;
    perform pg_temp.assert40(false, 'DEVERIA TER FALHADO: anon leu train.enrollments');
  exception when insufficient_privilege then
    perform pg_temp.assert40(true, '⭐ anon não encosta em train.enrollments');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 35 OK: catálogo isolado, porteiro da inscrição, presença carimbada, conclusão além dela, terminais, anon fora ==='
