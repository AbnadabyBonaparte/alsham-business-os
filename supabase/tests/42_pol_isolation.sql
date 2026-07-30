-- =============================================================================
-- O MÓDULO 37 NO BANCO — a versão que congela ao publicar, e a ciência que é
-- POR VERSÃO (⭐⭐ o DIVERGE do comm, provado com o USUÁRIO no banco real)
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o catálogo de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta só dá ciência, NÃO redige nem publica;
--   2. ⭐ **publicar exige corpo e congela** — contra o gatilho real, não
--      contra um mock;
--   3. ⭐⭐ **A CIÊNCIA É POR VERSÃO** — o coração do DIVERGE: o Alfa dá
--      ciência da v1; repetir na v1 falha (unique); nasce a v2 (versão
--      NOVA) e o MESMO Alfa dá ciência de novo — prova viva de que a
--      versão nova não herda a ciência da anterior; a arquivada não
--      recebe ciência nova, e não reabre;
--   4. ⭐ **a ciência é própria** (o gatilho força quem assina, mesmo
--      mandando outro user_id) e **imutável** (nem o dono do banco a
--      rasura);
--   5. apagar versão/política não existe; a caneta de emitir evento não é
--      do cliente; e o `anon` não encosta em tabela nenhuma do módulo.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert42(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Políticas nos dois tenants; Alfa gerencia+dá ciência, Beta só dá ciência ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pol', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pol', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: os dois dão ciência (ack); só o Alfa GERENCIA
-- (redige política, cria/publica/arquiva versão).
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'pol.policy.ack', 'pol'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'pol.policy.manage', 'pol'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois dão ciência; só o Alfa gerencia.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E A ASSIMETRIA: O BETA NÃO GERENCIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com seu catálogo; o Beta dá ciência, mas não cria política nem versão ==='

do $$
declare
  v_policy_id uuid; v_seed_policy uuid; v_seed_version uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into pol.policies (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Política de Uso de Equipamento')
  returning id into v_policy_id;

  select count(*) into v_n from pol.policies;
  perform pg_temp.assert42(v_n = 1, 'o Alfa vê só o catálogo dele');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select count(*) into v_n from pol.policies;
  perform pg_temp.assert42(v_n = 0, 'o Beta enxerga só o catálogo dele — vazio');

  -- ⭐ O Beta (só ack) não cria política.
  begin
    insert into pol.policies (tenant_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Tentativa do leitor');
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: o Beta criou política');
  exception when insufficient_privilege then
    perform pg_temp.assert42(true, '⭐ criar política é mão própria (pol.policy.manage)');
  end;

  -- ⭐ O Beta (só ack) também não cria versão — no próprio tenant, mesmo
  -- sem política nenhuma para apontar (a RLS barra antes da FK).
  begin
    insert into pol.versions (tenant_id, policy_id, body)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', gen_random_uuid(), 'tentativa');
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: o Beta criou versão');
  exception when insufficient_privilege then
    perform pg_temp.assert42(true, '⭐ criar versão é mão própria (pol.policy.manage) — o Beta só dá ciência');
  end;

  -- ⭐ E também não PUBLICA uma versão — mesmo uma já existente, semeada
  -- diretamente (bypassando RLS) só para este teste.
  reset role;
  insert into pol.policies (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Semeada direto — só para o teste')
  returning id into v_seed_policy;
  insert into pol.versions (tenant_id, policy_id, body)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_seed_policy, 'corpo semeado direto')
  returning id into v_seed_version;

  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta de novo

  -- ⚠️ A policy de UPDATE tem `using (…manage)`: a linha é FILTRADA para quem
  -- não tem manage — o UPDATE afeta ZERO linhas, sem erro. A prova não é a
  -- exceção; é o ESTADO: a versão segue rascunho, o Beta não publicou nada.
  update pol.versions set status = 'published' where id = v_seed_version;
  select status into v_erro from pol.versions where id = v_seed_version;
  perform pg_temp.assert42(
    v_erro = 'draft',
    '⭐ publicar é mão própria (pol.policy.manage) — a RLS filtra, a versão segue rascunho');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ PUBLICAR EXIGE CORPO E CONGELA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: v1 nasce rascunho; publicar sem corpo falha; publicar congela o corpo ==='

do $$
declare
  v_policy_id uuid; v_v1 uuid; v_erro text; v_no int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_policy_id from pol.policies
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Política de Uso de Equipamento';

  -- ⭐ Nasce no rascunho, mesmo se o formulário insistir em outra coisa.
  begin
    insert into pol.versions (tenant_id, policy_id, body, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_policy_id, 'x', 'published');
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: nasceu publicada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert42(v_erro like '%rascunho%', '⭐ a versão nasce no rascunho');
  end;

  insert into pol.versions (tenant_id, policy_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_policy_id)
  returning id into v_v1;

  select version_no into v_no from pol.versions where id = v_v1;
  perform pg_temp.assert42(v_no = 1, '⭐ a primeira versão nasce com número 1 — calculado pelo servidor');

  -- ⭐ Sem corpo não se publica.
  begin
    update pol.versions set status = 'published' where id = v_v1;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: publicou sem corpo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert42(v_erro like '%não vale%', '⭐ política sem corpo não vale — não publica');
  end;

  -- No rascunho o corpo ainda é plano — edita-se.
  update pol.versions
     set body = 'O equipamento corporativo é de uso individual e intransferível.'
   where id = v_v1;
  perform pg_temp.assert42(true, 'no rascunho o corpo ainda é plano — edita-se');

  update pol.versions set status = 'published' where id = v_v1;
  perform pg_temp.assert42(true, 'publicou com corpo — a versão 1 está no ar');

  -- ⭐ O corpo publicado congela.
  begin
    update pol.versions set body = 'mudei tudo depois de publicar' where id = v_v1;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: editou o corpo publicado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert42(v_erro like '%não se edita%', '⭐ a versão publicada não se edita');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ A CIÊNCIA É POR VERSÃO: O CORAÇÃO DO DIVERGE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: ciência única NA v1; a v2 (versão nova) exige ciência de novo do MESMO membro ==='

do $$
declare
  v_policy_id uuid; v_v1 uuid; v_v2 uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_policy_id from pol.policies
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Política de Uso de Equipamento';
  select id into v_v1 from pol.versions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and policy_id = v_policy_id and version_no = 1;

  -- Ciência na v1 publicada, pelo Alfa.
  insert into pol.acknowledgements (tenant_id, version_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_v1);
  perform pg_temp.assert42(true, 'o Alfa deu ciência da v1');

  -- ⭐ Duplicar a ciência na MESMA versão falha (unique).
  begin
    insert into pol.acknowledgements (tenant_id, version_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_v1);
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: ciência em dobro na v1');
  exception when unique_violation then
    perform pg_temp.assert42(true, '⭐ ciência não se dá duas vezes na mesma versão');
  end;

  -- Rascunho não recebe ciência.
  insert into pol.versions (tenant_id, policy_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_policy_id)
  returning id into v_v2;

  begin
    insert into pol.acknowledgements (tenant_id, version_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_v2);
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: ciência na v2 ainda rascunho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert42(v_erro like '%não foi publicada%', 'a versão em rascunho não recebe ciência');
  end;

  update pol.versions
     set body = 'v2: o equipamento corporativo é individual, intransferível e deve ser devolvido no desligamento.'
   where id = v_v2;
  update pol.versions set status = 'published' where id = v_v2;

  select version_no into v_n from pol.versions where id = v_v2;
  perform pg_temp.assert42(v_n = 2, '⭐ a v2 nasceu com o número seguinte — calculado, não digitado');

  -- ⭐⭐ O CORAÇÃO DO DIVERGE: o MESMO Alfa, que já tinha ciência da v1,
  -- dá ciência da v2 — uma linha NOVA, distinta, porque a identidade é a
  -- VERSÃO, não a política.
  insert into pol.acknowledgements (tenant_id, version_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_v2);

  select count(*) into v_n from pol.acknowledgements
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and version_id in (v_v1, v_v2);
  perform pg_temp.assert42(
    v_n = 2,
    '⭐⭐ o MESMO membro tem DUAS ciências distintas (v1 e v2) — a versão nova exigiu ciência de novo');

  -- Arquiva a v1: fora de circulação não recebe ciência nova (a v2 é a vigente).
  update pol.versions set status = 'archived' where id = v_v1;
  begin
    -- A tentativa falha pelo STATUS (arquivada) antes mesmo de chegar à
    -- unicidade — prova que o guard checa circulação primeiro.
    insert into pol.acknowledgements (tenant_id, version_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_v1);
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: ciência em versão arquivada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert42(v_erro like '%fora de circulação%', '⭐ versão arquivada não recebe ciência nova');
  end;

  -- ⭐ E a v1 arquivada é terminal — não volta a publicar.
  begin
    update pol.versions set status = 'published' where id = v_v1;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: reabriu a v1 arquivada');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert42(v_erro like '%versão nova%', '⭐ archived é terminal — a política volta com versão nova');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ A CIÊNCIA É PRÓPRIA E IMUTÁVEL
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: o gatilho força o próprio punho; nem o dono do banco rasura ==='

do $$
declare
  v_policy_id uuid; v_v3 uuid; v_who uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_policy_id from pol.policies
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Política de Uso de Equipamento';

  -- Uma terceira versão fresca — só para este cenário, sem ciência prévia.
  insert into pol.versions (tenant_id, policy_id, body)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_policy_id, 'v3: revisão anual do inventário de equipamentos.')
  returning id into v_v3;
  update pol.versions set status = 'published' where id = v_v3;

  -- ⭐ Mandando o user_id do OUTRO: o gatilho descarta e assina o próprio.
  insert into pol.acknowledgements (tenant_id, version_id, user_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_v3, '22222222-2222-4222-8222-222222222222');

  select user_id into v_who from pol.acknowledgements where version_id = v_v3;
  perform pg_temp.assert42(
    v_who = '11111111-1111-4111-8111-111111111111',
    '⭐ a ciência é do próprio punho — o user_id mandado (Beta) foi descartado; ficou o Alfa');

  -- O cliente não rasura (nem tem grant de update/delete).
  begin
    update pol.acknowledgements set acked_at = now() where version_id = v_v3;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: o cliente rasurou a ciência');
  exception when insufficient_privilege then
    perform pg_temp.assert42(true, 'o cliente não rasura a ciência (sem grant de update)');
  end;

  reset role;
  begin
    update pol.acknowledgements set acked_at = now() where version_id = v_v3;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: o dono do banco rasurou a ciência');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert42(v_erro like '%não se edita nem se retira%', '⭐ a ciência é imutável — nem o dono do banco a edita');
  end;

  begin
    delete from pol.acknowledgements where version_id = v_v3;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: o dono do banco apagou a ciência');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert42(v_erro like '%não se edita nem se retira%', '⭐ a ciência não se retira nem como dono do banco');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'pol.version.acknowledged';
  perform pg_temp.assert42(v_n >= 3, 'pol.version.acknowledged saiu uma vez por ciência dada (v1, v2, v3)');
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar versão/política não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_id uuid; v_policy_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id, policy_id into v_id, v_policy_id from pol.versions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from pol.versions where id = v_id;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: apagou versão');
  exception when insufficient_privilege then
    perform pg_temp.assert42(true, 'apagar versão não existe — arquivar é status');
  end;

  begin
    delete from pol.policies where id = v_policy_id;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: apagou política');
  exception when insufficient_privilege then
    perform pg_temp.assert42(true, 'apagar política não existe');
  end;

  begin
    perform pol.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pol.version.drafted', '{}'::jsonb);
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert42(true, 'pol.emit_event não é concedida ao cliente');
  end;
end $$;

-- ⭐ ANON NÃO ENCOSTA — com o papel real.
do $$
begin
  set local role anon;
  begin
    perform 1 from pol.policies limit 1;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: anon leu pol.policies');
  exception when insufficient_privilege then
    perform pg_temp.assert42(true, '⭐ anon não encosta em pol.policies');
  end;
  begin
    perform 1 from pol.versions limit 1;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: anon leu pol.versions');
  exception when insufficient_privilege then
    perform pg_temp.assert42(true, '⭐ anon não encosta em pol.versions');
  end;
  begin
    perform 1 from pol.acknowledgements limit 1;
    perform pg_temp.assert42(false, 'DEVERIA TER FALHADO: anon leu pol.acknowledgements');
  exception when insufficient_privilege then
    perform pg_temp.assert42(true, '⭐ anon não encosta em pol.acknowledgements');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 37 OK: catálogo isolado, publicar congela, ciência POR VERSÃO (o DIVERGE do comm provado), imutável, anon fora ==='
