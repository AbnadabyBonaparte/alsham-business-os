-- =============================================================================
-- O MÓDULO 27 NO BANCO — a régua do método, a pergunta que congela, o livro
-- que não se rasura e o placar que só existe calculado
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o quadro de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta registra a voz, mas NÃO conduz a medição;
--   2. ⭐ **a rodada nasce no rascunho** e **abrir congela a pergunta** —
--      contra o gatilho real;
--   3. ⭐ **a régua 0–10 é CHECK** (a nota 11 não entra), o ato é carimbado
--      pelo servidor e o livro é ETERNO — nem o dono rasura;
--   4. ⭐ **o placar sai da VIEW** (%promotores − %detratores) e pesquisa
--      SEM resposta NÃO tem linha — sem número inventado (Lei 7);
--   5. ⭐ **closed é terminal** e a voz tardia é recusada; o envelope leva
--      a NOTA — sem comentário e sem respondente (LGPD-mínimo);
--   6. ⛔ **anon = NADA** — provado com o papel anon de verdade; apagar
--      não existe; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert32(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Pesquisas nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nps', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'nps', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) conduz E registra;
-- `user-b` (Beta) só registra a voz — não conduz a medição.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'nps.response.record', 'nps'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'nps.survey.manage', 'nps'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois registram a voz; só o Alfa conduz.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O RASCUNHO E A MÃO QUE NÃO CONDUZ
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce no rascunho; o rascunho não colhe; o Beta não conduz ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into nps.surveys (tenant_id, title, question, status, opened_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasceu colhendo', 'Recomendaria?', 'open', now());
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: nasceu colhendo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert32(v_erro like '%nasce no rascunho%', 'a rodada nasce no rascunho');
  end;

  insert into nps.surveys (tenant_id, title, question)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A voz da praça — julho',
          'De 0 a 10, o quanto você recomendaria a nossa praça?')
  returning id into v_id;

  -- ⭐ O rascunho ainda não colhe.
  begin
    insert into nps.responses (tenant_id, survey_id, score)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 9);
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: voz no rascunho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert32(v_erro like '%não há o que responder%', '⭐ o rascunho ainda não colhe');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  begin
    insert into nps.surveys (tenant_id, title, question)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Tentativa', 'Recomendaria?');
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: o Beta conduziu');
  exception when insufficient_privilege then
    perform pg_temp.assert32(true, '⭐ conduzir a medição é mão própria (nps.survey.manage)');
  end;

  select count(*) into v_n from nps.surveys;
  perform pg_temp.assert32(v_n = 0, 'o Beta enxerga só o quadro dele — e o dele está vazio');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ ABRIR CONGELA A PERGUNTA; O ESPELHO DAS TRANSIÇÕES
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: o rascunho não encerra; abrir carimba e congela ==='

do $$
declare
  v_id uuid; v_by uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from nps.surveys
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'A voz da praça — julho';

  -- Espelho: o rascunho nunca colheu — não encerra.
  begin
    update nps.surveys set status = 'closed' where id = v_id;
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: encerrou o rascunho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert32(v_erro like '%não existe%', 'o rascunho não encerra — nunca colheu');
  end;

  -- No rascunho a pergunta ainda é plano.
  update nps.surveys set question = 'De 0 a 10, o quanto você nos recomendaria a um amigo?'
   where id = v_id;
  perform pg_temp.assert32(true, 'no rascunho a pergunta ainda se lapida');

  update nps.surveys set status = 'open' where id = v_id;
  select opened_by into v_by from nps.surveys where id = v_id;
  perform pg_temp.assert32(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ abrir carimbou QUEM — pelo servidor');

  -- ⭐ A coleta congelou a pergunta.
  begin
    update nps.surveys set question = 'outra pergunta' where id = v_id;
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: mudou a pergunta no meio');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert32(v_erro like '%congelou a pergunta%', '⭐ a coleta congela a pergunta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ O LIVRO E A RÉGUA; O PLACAR SÓ EXISTE CALCULADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: a nota 11 não entra; o ato é do servidor; o placar sai da view ==='

do $$
declare
  v_id uuid; v_who uuid; v_score int; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from nps.surveys
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'A voz da praça — julho';

  -- ⭐ A régua é do método: 11 não existe.
  begin
    insert into nps.responses (tenant_id, survey_id, score)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 11);
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: nota fora da régua');
  exception when check_violation then
    perform pg_temp.assert32(true, '⭐ a régua 0–10 é física do método — a nota 11 não entra');
  end;

  -- ⭐ O recorded_by mandado é descartado — quem assina é o servidor.
  insert into nps.responses (tenant_id, survey_id, score, comment, respondent, recorded_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 9, 'praça limpa', 'mesa 12',
          '22222222-2222-4222-8222-222222222222');
  select recorded_by into v_who from nps.responses where survey_id = v_id;
  perform pg_temp.assert32(
    v_who = '11111111-1111-4111-8111-111111111111',
    '⭐ o ato é assinado pelo servidor — o recorded_by mandado foi descartado');

  insert into nps.responses (tenant_id, survey_id, score) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 10),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 7),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 3);

  -- ⭐ O placar sai da VIEW: 2 promotores, 1 neutro, 1 detrator → 50−25 = 25.
  select score into v_score from nps.survey_score where survey_id = v_id;
  perform pg_temp.assert32(v_score = 25, '⭐ o placar é calculado do livro — 25, como o mundo conta');

  -- O livro não se rasura.
  begin
    update nps.responses set score = 10 where survey_id = v_id;
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: o cliente rasurou o livro');
  exception when insufficient_privilege then
    perform pg_temp.assert32(true, 'o cliente não rasura o livro');
  end;

  reset role;
  begin
    delete from nps.responses where survey_id = v_id;
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: apagou o livro como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert32(v_erro like '%opinião dada%', '⭐ o livro não se apaga nem como dono do banco');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'nps.response.recorded';
  perform pg_temp.assert32(v_n = 4, 'nps.response.recorded saiu quatro vezes');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ SEM RESPOSTA NÃO HÁ PLACAR; CLOSED É TERMINAL; O ENVELOPE LEVE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: pesquisa muda sem inventar número; encerrada não colhe nem volta; a voz não passeia ==='

do $$
declare
  v_id uuid; v_vazia uuid; v_by uuid; v_erro text; v_n int; v_payload jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⭐ Rodada aberta SEM resposta: NENHUMA linha na view — sem número inventado.
  insert into nps.surveys (tenant_id, title, question)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Rodada sem voz', 'Recomendaria?')
  returning id into v_vazia;
  update nps.surveys set status = 'open' where id = v_vazia;

  select count(*) into v_n from nps.survey_score where survey_id = v_vazia;
  perform pg_temp.assert32(v_n = 0, '⭐ sem voz não há placar — a view não inventa número (Lei 7)');

  select id into v_id from nps.surveys
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'A voz da praça — julho';

  update nps.surveys set status = 'closed' where id = v_id;
  select closed_by into v_by from nps.surveys where id = v_id;
  perform pg_temp.assert32(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ encerrar carimbou QUEM — pelo servidor');

  -- ⭐ A voz tardia é recusada.
  begin
    insert into nps.responses (tenant_id, survey_id, score)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, 10);
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: voz tardia');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert32(v_erro like '%placar já lido%', '⭐ a medição encerrada não colhe');
  end;

  -- ⭐ E não reabre.
  begin
    update nps.surveys set status = 'open' where id = v_id;
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: reabriu a medição');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert32(v_erro like '%pesquisa nova%', '⭐ a rodada que volta é pesquisa nova');
  end;

  reset role;
  -- ⭐ O envelope leva a NOTA — sem comentário e sem respondente.
  select payload into v_payload from core.event_outbox
   where event_type = 'nps.response.recorded'
     and payload->>'score' = '9';
  perform pg_temp.assert32(
    v_payload is not null
      and not (v_payload ? 'comment')
      and not (v_payload ? 'respondent')
      and v_payload->>'surveyTitle' = 'A voz da praça — julho',
    '⭐ o envelope leva o fato — a voz inteira fica em casa (LGPD-mínimo)');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⛔ ANON = NADA; APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: anon não entra nem para ler; apagar não existe; emit_event não é concedida ==='

-- ⛔ ANON = NADA — provado com o papel de verdade, num bloco só dele
-- (o `set local` morre com o bloco; o papel não vaza para o resto).
do $$
begin
  set local role anon;
  begin
    perform count(*) from nps.surveys;
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: anon leu o quadro');
  exception when insufficient_privilege then
    perform pg_temp.assert32(true, '⛔ anon = NADA — o link público é integração futura, não um grant');
  end;
end $$;

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from nps.surveys
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from nps.surveys where id = v_id;
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: apagou rodada');
  exception when insufficient_privilege then
    perform pg_temp.assert32(true, 'apagar rodada não existe — medição feita é história');
  end;

  begin
    perform nps.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nps.survey.drafted', '{}'::jsonb);
    perform pg_temp.assert32(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert32(true, 'nps.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 27 OK: régua do método, pergunta congelada, livro eterno, placar calculado, anon do lado de fora ==='
