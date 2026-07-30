-- =============================================================================
-- O MÓDULO 24 NO BANCO — a palavra dada que congela, a ciência própria e
-- única, e o arquivo que é terminal
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. o mural de um tenant não aparece no outro — e a assimetria
--      user-a × user-b: o Beta só dá ciência, NÃO redige;
--   2. ⭐ **o comunicado nasce no rascunho** e **publicar exige corpo** —
--      contra o gatilho real, não contra um mock;
--   3. ⭐ **publicar congela** título, corpo e audiência; o espelho das
--      transições: o rascunho não arquiva e o arquivado não volta ao mural;
--   4. ⭐ **a ciência é própria** (o gatilho FORÇA quem assina, mesmo
--      mandando outro user_id), **única** (UNIQUE) e **eterna** (nem o
--      dono do banco a rasura) — e só o PUBLICADO a recebe;
--   5. ⭐ **a correção carimba o título pelo servidor** — o digitado no
--      formulário é descartado; e **o corpo não passeia no envelope**;
--   6. apagar não existe; a caneta de emitir evento não é do cliente.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert29(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: Comunicados nos dois tenants ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'comm', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'comm', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE: `user-a` (Alfa) redige E dá ciência;
-- `user-b` (Beta) é só leitor — dá ciência, não dá a palavra.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'comm.notice.ack', 'comm'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'comm.notice.manage', 'comm'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois leem; só o Alfa dá a palavra.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O RASCUNHO E A MÃO QUE NÃO REDIGE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: nasce no rascunho; o leitor não redige; cada tenant no seu mural ==='

do $$
declare
  v_id uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  begin
    insert into comm.notices (tenant_id, title, audience, body, status, published_at)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasceu no mural', 'todos', 'x',
            'published', now());
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: nasceu publicado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert29(v_erro like '%nasce no rascunho%', 'o comunicado nasce no rascunho');
  end;

  insert into comm.notices (tenant_id, title, audience)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Manutenção do elevador', 'todos')
  returning id into v_id;
  perform pg_temp.assert29(v_id is not null, 'o rascunho pode nascer só com título e audiência');

  -- ⭐ O rascunho ainda não comunicou: ciência recusada.
  begin
    insert into comm.acks (tenant_id, notice_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id);
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: ciência no rascunho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert29(v_erro like '%ainda não comunicou%', '⭐ o rascunho não recebe ciência');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  -- O Beta (só ack) não redige.
  begin
    insert into comm.notices (tenant_id, title, audience)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Tentativa do leitor', 'todos');
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: o leitor redigiu');
  exception when insufficient_privilege then
    perform pg_temp.assert29(true, '⭐ dar a palavra é mão própria (comm.notice.manage)');
  end;

  select count(*) into v_n from comm.notices;
  perform pg_temp.assert29(v_n = 0, 'o Beta enxerga só o mural dele — e o dele está vazio');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ PUBLICAR EXIGE CORPO E CONGELA; O ESPELHO DAS TRANSIÇÕES
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: sem corpo não se publica; a palavra dada congela; o rascunho não arquiva ==='

do $$
declare
  v_id uuid; v_by uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from comm.notices
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Manutenção do elevador';

  -- ⭐ Espelho: o rascunho nunca esteve no mural — não arquiva.
  begin
    update comm.notices set status = 'archived' where id = v_id;
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: arquivou o rascunho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert29(v_erro like '%não existe%', '⭐ o rascunho não arquiva — nunca esteve no mural');
  end;

  -- ⭐ Sem corpo não se publica.
  begin
    update comm.notices set status = 'published' where id = v_id;
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: publicou sem corpo');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert29(v_erro like '%não comunica%', '⭐ comunicado sem corpo não se publica');
  end;

  -- No rascunho tudo se edita — é plano.
  update comm.notices
     set body = 'O elevador social para das 8h às 12h para revisão. Usem o de serviço.'
   where id = v_id;
  perform pg_temp.assert29(true, 'no rascunho o texto ainda é plano — edita-se');

  update comm.notices set status = 'published' where id = v_id;
  select published_by into v_by from comm.notices where id = v_id;
  perform pg_temp.assert29(
    v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ publicar carimbou QUEM deu a palavra — pelo servidor');

  -- ⭐ A palavra dada congela.
  begin
    update comm.notices set body = 'na verdade era outra coisa' where id = v_id;
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: mudou o publicado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert29(v_erro like '%não se edita%', '⭐ a palavra dada não se edita');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A CIÊNCIA: PRÓPRIA, ÚNICA E ETERNA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o gatilho força o próprio punho; duas vezes não; rasurar nunca ==='

do $$
declare
  v_id uuid; v_who uuid; v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from comm.notices
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Manutenção do elevador';

  -- ⭐ Mandando o user_id do OUTRO: o gatilho descarta e assina o próprio.
  insert into comm.acks (tenant_id, notice_id, user_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, '22222222-2222-4222-8222-222222222222');

  select user_id into v_who from comm.acks where notice_id = v_id;
  perform pg_temp.assert29(
    v_who = '11111111-1111-4111-8111-111111111111',
    '⭐ a ciência é do próprio punho — o user_id mandado foi descartado');

  -- ⭐ Ciência não se dá duas vezes.
  begin
    insert into comm.acks (tenant_id, notice_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id);
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: ciência em dobro');
  exception when unique_violation then
    perform pg_temp.assert29(true, '⭐ ciência não se dá duas vezes');
  end;

  -- O cliente não rasura (nem tem grant).
  begin
    update comm.acks set acked_at = now() where notice_id = v_id;
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: o cliente rasurou a ciência');
  exception when insufficient_privilege then
    perform pg_temp.assert29(true, 'o cliente não rasura a ciência');
  end;

  reset role;
  begin
    delete from comm.acks where notice_id = v_id;
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: retirou a ciência como dono');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert29(v_erro like '%foi lido%', '⭐ a ciência não se retira nem como dono do banco');
  end;

  select count(*) into v_n from core.event_outbox where event_type = 'comm.notice.acked';
  perform pg_temp.assert29(v_n = 1, 'comm.notice.acked saiu uma vez');
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ O ARQUIVO É TERMINAL; A CORREÇÃO CARIMBA; O CORPO NÃO PASSEIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: arquivado não volta nem recebe ciência; o título do corrigido é do servidor; envelope sem corpo ==='

do $$
declare
  v_id uuid; v_novo uuid; v_titulo text; v_erro text; v_payload jsonb;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from comm.notices
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and title = 'Manutenção do elevador';

  update comm.notices set status = 'archived' where id = v_id;

  -- ⭐ Fora do mural não há ciência nova.
  begin
    insert into comm.acks (tenant_id, notice_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id);
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: ciência no arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert29(v_erro like '%fora do mural%', '⭐ o arquivado não recebe ciência — a cobertura não mente');
  end;

  -- ⭐ E não volta ao mural.
  begin
    update comm.notices set status = 'published' where id = v_id;
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: devolveu ao mural');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert29(v_erro like '%comunicado novo%', '⭐ o aviso que volta é comunicado novo');
  end;

  -- ⭐ A correção: o título digitado no formulário é DESCARTADO — carimba o real.
  insert into comm.notices (tenant_id, title, audience, body, corrects_notice_id, corrects_title)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Manutenção adiada para sexta', 'todos',
          'A revisão do elevador foi adiada para sexta, mesmo horário.',
          v_id, 'título forjado no formulário')
  returning id into v_novo;

  select corrects_title into v_titulo from comm.notices where id = v_novo;
  perform pg_temp.assert29(
    v_titulo = 'Manutenção do elevador',
    '⭐ o título do corrigido é carimbo do servidor — o digitado foi descartado');

  update comm.notices set status = 'published' where id = v_novo;

  reset role;
  -- ⭐ O corpo NÃO passeia no envelope — conferido no payload REAL do correio.
  select payload into v_payload from core.event_outbox
   where event_type = 'comm.notice.published'
     and payload->>'noticeId' = v_novo::text;
  perform pg_temp.assert29(
    v_payload is not null and not (v_payload ? 'body')
      and v_payload->>'title' = 'Manutenção adiada para sexta'
      and v_payload->>'correctsTitle' = 'Manutenção do elevador',
    '⭐ o envelope leva o fato — título e correção — e o corpo mora no mural');
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar não existe; emit_event não é concedida ==='

do $$
declare
  v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from comm.notices
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;

  begin
    delete from comm.notices where id = v_id;
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: apagou comunicado');
  exception when insufficient_privilege then
    perform pg_temp.assert29(true, 'apagar comunicado não existe — arquivar é status');
  end;

  begin
    perform comm.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'comm.notice.drafted', '{}'::jsonb);
    perform pg_temp.assert29(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert29(true, 'comm.emit_event não é concedida ao cliente');
  end;
end $$;

\echo ''
\echo '=== MÓDULO 24 OK: palavra congelada, ciência própria e eterna, arquivo terminal, tenants isolados ==='
