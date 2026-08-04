-- =============================================================================
-- O MÓDULO 100 NO BANCO — o PACOTE FECHADO de sessões que se isola: a compra
-- congela a trave (total_sessions), o uso é lançamento IMUTÁVEL (as duas
-- camadas), o saldo é VIEW (total − usos), e ⭐⭐ consumir mais que a trave é
-- RECUSADO (a física do loyalty/invest). Mais a assimetria vender × dar baixa,
-- e o contraste client_id SOLTO × FK real intra-schema do uso.
-- =============================================================================
--
-- ⭐⭐ É o Módulo 100 — a peça que fecha a campanha "rumo aos 100 módulos".
-- ⭐ Vertical 💇 Beleza & Estética (`vertical_key='beauty'`).
-- Roda depois de `01_rls_isolation.sql`.
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert105(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: pack instalado; Alfa vende E dá baixa, Beta só dá baixa ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, vertical_key,
  capabilities, permissions, events_emits, events_consumes,
  requires_core, status
)
values (
  'pack', 'Pacotes', '0.1.0',
  'O pacote fechado de sessões: a compra congela o total, cada uso consome uma do livro imutável, o saldo é VIEW e consumir mais que o saldo é recusado.',
  'vertical', 'beauty',
  '[{"key":"packages","canonicalName":"Pacotes"}]'::jsonb,
  '[{"key":"pack.package.manage","moduleId":"pack","description":"Registrar a compra de um pacote."},{"key":"pack.session.record","moduleId":"pack","description":"Dar baixa numa sessão."}]'::jsonb,
  '[{"type":"pack.package.registered","version":1,"description":"Comprou."}]'::jsonb,
  '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pack', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pack', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- Os dois dão baixa (session.record); só o Alfa vende pacote (package.manage).
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'pack.session.record', 'pack'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'pack.package.manage', 'pack'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois dão baixa; só o Alfa vende pacote.'

-- =============================================================================
-- CENÁRIO 1 — VENDER PACOTE: ISOLA, O SERVIDOR CARIMBA O AUTOR, CLIENT_ID SOLTO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: a compra cria; created_by do servidor; client_id solto; isola ==='

do $$
declare v_id uuid; v_by uuid; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- O client_id NÃO existe em crm nenhum — e insere sem erro: vínculo solto.
  insert into pack.packages (tenant_id, client_id, client_name, service, total_sessions, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
          'Cliente Fiel', 'corte de cabelo', 10, '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_by;

  perform pg_temp.assert105(v_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido foi descartado');

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select count(*) into v_n from pack.packages;
  perform pg_temp.assert105(v_n = 0, 'o Beta não vê a compra do Alfa');
end $$;

-- =============================================================================
-- CENÁRIO 2 — total_sessions > 0 e serviço obrigatório (a física da compra)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: total_sessions > 0; serviço não-vazio ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into pack.packages (tenant_id, client_id, service, total_sessions)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'laser', 0);
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: total_sessions = 0');
  exception when check_violation then
    perform pg_temp.assert105(true, '⭐ total_sessions > 0 (pacote de zero não é pacote)');
  end;

  begin
    insert into pack.packages (tenant_id, client_id, service, total_sessions)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', '   ', 5);
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: serviço vazio');
  exception when check_violation then
    perform pg_temp.assert105(true, '⭐ o serviço é obrigatório (texto não-vazio)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ ASSIMETRIA: O BETA DÁ BAIXA MAS NÃO VENDE PACOTE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o Beta só tem session.record — falha ao vender pacote ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  begin
    insert into pack.packages (tenant_id, client_id, service, total_sessions)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'massagem', 4);
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: o Beta vendeu pacote sem package.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert105(true, '⭐ vender pacote exige pack.package.manage — o Beta é barrado');
  end;
end $$;

-- Um pacote do tenant do Beta, criado pelo dono do banco só para os testes
-- seguintes (contorna a RLS deliberadamente — é montagem, não é o Beta agindo).
insert into pack.packages (tenant_id, client_id, service, total_sessions)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'massagem do Beta', 4);

do $$
declare v_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  select id into v_id from pack.packages
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and service = 'massagem do Beta';

  -- Mas o Beta DÁ BAIXA — é a permissão dele.
  insert into pack.uses (tenant_id, package_id, used_on)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_id, current_date);
  perform pg_temp.assert105(true, 'o Beta registra um uso — session.record basta');
end $$;

-- =============================================================================
-- CENÁRIO 4 — O SALDO É VIEW (total − usos); dar baixa dentro do saldo passa
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: saldo = total − usos (VIEW); baixa dentro do saldo passa ==='

do $$
declare v_id uuid; v_remaining bigint; v_used bigint;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_id from pack.packages
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and service = 'corte de cabelo';

  -- 3 baixas sobre um pacote de 10.
  insert into pack.uses (tenant_id, package_id, used_on) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, current_date),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, current_date),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, current_date);

  select remaining, used_count into v_remaining, v_used
    from pack.package_balances where package_id = v_id;
  perform pg_temp.assert105(v_used = 3 and v_remaining = 7,
    '⭐ o saldo é VIEW: 10 compradas − 3 usadas = 7 restantes');
end $$;

-- =============================================================================
-- CENÁRIO 5 — ⭐⭐ A TERCEIRA RESPOSTA: consumir mais que a trave é RECUSADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: pacote esgotado — não se dá baixa do que não resta ==='

do $$
declare v_id uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Um pacote pequeno: 2 sessões.
  insert into pack.packages (tenant_id, client_id, service, total_sessions)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'sobrancelha', 2)
  returning id into v_id;

  insert into pack.uses (tenant_id, package_id, used_on) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, current_date),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, current_date);
  perform pg_temp.assert105(true, 'as 2 sessões da trave foram consumidas');

  begin
    insert into pack.uses (tenant_id, package_id, used_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_id, current_date);
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: baixa além da trave');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert105(v_erro like '%pacote esgotado%',
      '⭐⭐ consumir mais que a trave é recusado (a física do loyalty/invest)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — ⭐⭐ IMUTÁVEL: o uso e a compra, as duas camadas cada
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: o uso é fato consumado; a compra congela a trave ==='

do $$
declare v_use uuid; v_pkg uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_use from pack.uses
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;
  select id into v_pkg from pack.packages
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and service = 'corte de cabelo';

  -- USO — CAMADA 1: o cliente não tem porta de UPDATE.
  begin
    update pack.uses set used_on = current_date - 1 where id = v_use;
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: cliente editou um uso');
  exception when insufficient_privilege then
    perform pg_temp.assert105(true, '⭐ CAMADA 1 (uso): o cliente não edita — não há porta de UPDATE');
  end;

  -- USO — CAMADA 2: nem o dono do banco.
  reset role;
  begin
    update pack.uses set used_on = current_date - 1 where id = v_use;
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: o dono reescreveu o uso');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert105(v_erro like '%fato consumado%', '⭐⭐ CAMADA 2 (uso): nem o dono reescreve');
  end;

  -- COMPRA — CAMADA 2: nem o dono altera a trave.
  begin
    update pack.packages set total_sessions = 999 where id = v_pkg;
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: o dono alterou a trave');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert105(v_erro like '%compra fechada%', '⭐⭐ CAMADA 2 (compra): a trave não se altera');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 7 — FK REAL INTRA-SCHEMA (o contraste com o client_id solto)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: o package_id do uso é FK real intra-schema; órfão recusado ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    insert into pack.uses (tenant_id, package_id, used_on)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '99999999-9999-4999-8999-999999999999', current_date);
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: uso apontou pacote inexistente');
  exception when foreign_key_violation then
    perform pg_temp.assert105(true, '⭐ o package_id é FK real intra-schema — órfão recusado (× client_id solto)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 8 — APAGAR NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA; OS FATOS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 8: apagar não existe; emit_event fechada; anon barrado; fatos no correio ==='

do $$
declare v_id uuid; v_use uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from pack.packages limit 1;
  begin
    delete from pack.packages where id = v_id;
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: apagou pacote');
  exception when insufficient_privilege then
    perform pg_temp.assert105(true, 'apagar pacote não existe — a compra é fato consumado');
  end;

  select id into v_use from pack.uses limit 1;
  begin
    delete from pack.uses where id = v_use;
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: apagou uso');
  exception when insufficient_privilege then
    perform pg_temp.assert105(true, 'apagar uso não existe — sem grant de DELETE');
  end;

  begin
    perform pack.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pack.package.registered', '{}'::jsonb);
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert105(true, 'pack.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;

  begin
    perform 1 from pack.packages limit 1;
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: anon leu pack.packages');
  exception when insufficient_privilege then
    perform pg_temp.assert105(true, '⭐ anon não encosta em pack.packages');
  end;

  begin
    perform 1 from pack.uses limit 1;
    perform pg_temp.assert105(false, 'DEVERIA TER FALHADO: anon leu pack.uses');
  exception when insufficient_privilege then
    perform pg_temp.assert105(true, '⭐ anon não encosta em pack.uses');
  end;

  reset role;
end $$;

do $$
declare v_n int;
begin
  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'pack.package.registered';
  perform pg_temp.assert105(v_n >= 1, 'vender pacote emitiu pack.package.registered');
  select count(*) into v_n from core.event_outbox where event_type = 'pack.session.used';
  perform pg_temp.assert105(v_n >= 1, 'dar baixa emitiu pack.session.used');
end $$;

\echo ''
\echo '=== MÓDULO 100 OK: pacote isolado, compra congela a trave, uso imutável (2 camadas), saldo é VIEW, consumo > trave recusado, FK real do uso, anon fora ==='
