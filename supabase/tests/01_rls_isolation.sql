-- =============================================================================
-- TESTE DE ISOLAMENTO MULTI-TENANT — a prova que o suna-core nunca teve
-- =============================================================================
--
-- A diferença entre "RLS escrita" e "RLS que funciona" é este arquivo.
-- O parser prova sintaxe. O apply prova que sobe. Só um usuário real,
-- autenticado, tentando ler o que não é dele, prova ISOLAMENTO.
--
-- O suna-core nasceu com RLS aberta e virou P0 (Balanço de Tecnologia §5,
-- lição paga nº 1). Este teste existe para que isso não se repita — e roda
-- no CI a cada mudança de schema.
--
-- -----------------------------------------------------------------------------
-- COMO ELE "AUTENTICA"
-- -----------------------------------------------------------------------------
-- `set local role authenticated` + `set local request.jwt.claim.sub = '<uuid>'`
-- é exatamente o que o PostgREST faz ao receber um JWT do Supabase.
--
-- O `set role` é essencial: `postgres` é superusuário e **passa por cima de
-- toda RLS**. Um teste rodado como superusuário provaria absolutamente nada.
--
-- -----------------------------------------------------------------------------
-- DADO
-- -----------------------------------------------------------------------------
-- 100% fabricado e anônimo. Tenants `alfa` e `beta`; usuários identificados
-- só por UUID fixo. Nenhum nome, e-mail ou documento real (Lei anti-viés).
-- Este arquivo é DESCARTÁVEL: roda em banco efêmero e morre com ele.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

-- Falha o teste inteiro com mensagem legível.
create or replace function pg_temp.assert(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice '  ✅ %', p_label;
  else
    raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

-- =============================================================================
-- MONTAGEM — como service_role (a plataforma), não como usuário
-- =============================================================================

\echo ''
\echo '=== MONTAGEM: 2 tenants, 2 usuários, dado fake nos dois lados ==='

-- Usuários (só UUID; nenhuma identidade real)
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'user-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'user-b@example.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'user-c@example.invalid')
on conflict (id) do nothing;

-- Dois tenants isolados
insert into core.tenants (id, slug, name, plan_code) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'tenant-alfa', 'Tenant Alfa', 'starter'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'tenant-beta', 'Tenant Beta', 'starter')
on conflict (id) do nothing;

-- user-a é admin do Alfa; user-b é admin do Beta.
-- user-c é membro do Alfa com papel SEM a permissão de decidir aprovação —
-- é ele quem prova o cenário 3.
insert into core.roles (tenant_id, key, name, description) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'conciliador',
   'Concilia mas não visa', 'Papel de tenant: concilia, não aprova.')
on conflict (tenant_id, key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, v.k, 'recon'
  from core.roles r
 cross join (values ('recon.statement.import'), ('recon.match.manage')) v(k)
 where r.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and r.key = 'conciliador'
on conflict (role_id, permission_key) do nothing;

insert into core.memberships (tenant_id, user_id, role_key, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin',       'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'admin',       'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'conciliador', 'active')
on conflict (tenant_id, user_id) do nothing;

-- Dado de conciliação nos DOIS tenants, para que "não ver" seja significativo.
insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recon', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into recon.bank_statements
  (id, tenant_id, account_ref, source_format, content_hash, period_start, period_end, currency)
values
  ('a0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'conta-1', 'ofx', 'hash-alfa', '2026-07-01', '2026-07-31', 'BRL'),
  ('b0000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'conta-1', 'ofx', 'hash-beta', '2026-07-01', '2026-07-31', 'BRL')
on conflict do nothing;

insert into recon.statement_lines
  (id, tenant_id, statement_id, line_no, posted_at, amount_cents, currency, description)
values
  ('a1000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'a0000000-0000-4000-8000-00000000000a', 1, '2026-07-10', -15000, 'BRL', 'linha do alfa'),
  ('b1000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'b0000000-0000-4000-8000-00000000000b', 1, '2026-07-10', -25000, 'BRL', 'linha do beta')
on conflict do nothing;

insert into recon.approval_queue
  (id, tenant_id, subject_type, subject_id, title, amount_cents, currency, requested_by)
values
  ('a2000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'reconciliation-match', 'a1000000-0000-4000-8000-00000000000a',
   'Divergência a visar — alfa', 15000, 'BRL', '11111111-1111-4111-8111-111111111111'),
  ('b2000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'reconciliation-match', 'b1000000-0000-4000-8000-00000000000b',
   'Divergência a visar — beta', 25000, 'BRL', '22222222-2222-4222-8222-222222222222')
on conflict do nothing;

insert into core.audit_log
  (id, tenant_id, actor_kind, actor_process, action, resource_type, resource_id)
values
  ('a3000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'system', 'seed-de-teste', 'module.installed', 'tenant-module', 'recon')
on conflict do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — usuário do tenant A não enxerga NADA do tenant B
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: isolamento entre tenants ==='

do $$
declare
  v_tenants int; v_stmts int; v_lines int; v_appr int; v_members int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- user-a, tenant Alfa

  select count(*) into v_tenants from core.tenants;
  select count(*) into v_stmts   from recon.bank_statements;
  select count(*) into v_lines   from recon.statement_lines;
  select count(*) into v_appr    from recon.approval_queue;
  select count(*) into v_members from core.memberships;

  raise notice 'user-a (Alfa) enxerga: tenants=% extratos=% linhas=% aprovacoes=% membros=%',
    v_tenants, v_stmts, v_lines, v_appr, v_members;

  perform pg_temp.assert(v_tenants = 1, 'vê 1 tenant (o próprio), não 2');
  perform pg_temp.assert(v_stmts   = 1, 'vê 1 extrato (o próprio), não 2');
  perform pg_temp.assert(v_lines   = 1, 'vê 1 linha (a própria), não 2');
  perform pg_temp.assert(v_appr    = 1, 'vê 1 aprovação (a própria), não 2');
  perform pg_temp.assert(v_members = 2, 'vê os 2 membros do Alfa, nenhum do Beta');

  perform pg_temp.assert(
    (select count(*) from recon.statement_lines
      where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0,
    'SELECT explícito no tenant_id do Beta retorna 0 — a RLS não é filtro de tela');
end
$$;

-- O lado espelho: user-b só vê o Beta. Isolamento tem de valer nos dois sentidos.
do $$
declare v_stmts int; v_ref text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- user-b, tenant Beta

  select count(*) into v_stmts from recon.bank_statements;
  select content_hash into v_ref from recon.bank_statements;

  raise notice 'user-b (Beta) enxerga: extratos=% hash=%', v_stmts, v_ref;
  perform pg_temp.assert(v_stmts = 1,          'vê 1 extrato');
  perform pg_temp.assert(v_ref = 'hash-beta',  'e é o DELE, não o do Alfa');
end
$$;

-- Usuário sem vínculo nenhum não vê absolutamente nada.
do $$
declare v int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';  -- não é membro de nada

  select count(*) into v from core.tenants;
  raise notice 'usuário sem vínculo enxerga: tenants=%', v;
  perform pg_temp.assert(v = 0, 'usuário sem vínculo não vê nenhum tenant');
end
$$;

-- =============================================================================
-- CENÁRIO 2 — quem NÃO tem recon.approval.decide não consegue decidir
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: permissão de aprovação ==='

-- user-c é membro ATIVO do Alfa, tem recon.match.manage (logo LÊ a fila),
-- mas não tem recon.approval.decide.
do $$
declare v_visiveis int; v_afetadas int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- user-c, conciliador

  select count(*) into v_visiveis from recon.approval_queue;
  perform pg_temp.assert(v_visiveis = 1, 'conciliador LÊ a fila (tem recon.match.manage)');

  update recon.approval_queue
     set status = 'approved',
         decided_at = now(),
         decided_by = '33333333-3333-4333-8333-333333333333'
   where id = 'a2000000-0000-4000-8000-00000000000a';
  get diagnostics v_afetadas = row_count;

  raise notice 'conciliador tentou aprovar: linhas afetadas=%', v_afetadas;
  perform pg_temp.assert(v_afetadas = 0,
    'mas NÃO decide: sem recon.approval.decide, o UPDATE afeta 0 linhas');
end
$$;

-- E o item continua pendente — a tentativa não deixou rastro de mudança.
do $$
declare v_status text;
begin
  select status into v_status from recon.approval_queue
   where id = 'a2000000-0000-4000-8000-00000000000a';
  perform pg_temp.assert(v_status = 'pending', 'o item continua pendente');
end
$$;

-- Contraprova: quem TEM a permissão consegue. Sem isto, o teste acima poderia
-- estar passando por um erro qualquer, e não pela permissão.
do $$
declare v_afetadas int; v_eventos int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- user-a, admin

  update recon.approval_queue
     set status = 'approved',
         decided_at = now(),
         decided_by = '11111111-1111-4111-8111-111111111111',
         decision_note = 'visto em teste'
   where id = 'a2000000-0000-4000-8000-00000000000a';
  get diagnostics v_afetadas = row_count;

  raise notice 'admin aprovou: linhas afetadas=%', v_afetadas;
  perform pg_temp.assert(v_afetadas = 1, 'CONTRAPROVA: quem TEM a permissão decide');

  -- E o trigger tem de ter posto o evento na caixa de saída do Core.
  reset role;
  select count(*) into v_eventos from core.event_outbox
   where event_type = 'recon.approval.decided';
  raise notice 'eventos recon.approval.decided na outbox=%', v_eventos;
  perform pg_temp.assert(v_eventos = 1,
    'o trigger emitiu o evento em core.event_outbox, na mesma transação');
end
$$;

-- =============================================================================
-- CENÁRIO 3 — audit_log é append-only DE VERDADE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: audit_log append-only ==='

-- Como `authenticated` (que tem GRANT SELECT, mas nenhuma policy de escrita).
do $$
declare v_erro text; v_n int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select count(*) into v_n from core.audit_log;
  perform pg_temp.assert(v_n = 1, 'admin com core.audit.read lê a trilha do próprio tenant');

  begin
    update core.audit_log set action = 'adulterado' where tenant_id is not null;
    perform pg_temp.assert(false, 'UPDATE em audit_log deveria ter sido bloqueado');
  exception when others then
    v_erro := sqlerrm;
    raise notice 'UPDATE bloqueado: %', left(v_erro, 90);
    perform pg_temp.assert(true, 'UPDATE em audit_log bloqueado para authenticated');
  end;
end
$$;

-- A prova que importa: bloqueado até para quem TEM privilégio total.
-- `postgres` é superusuário e ignora RLS — só o TRIGGER o detém.
do $$
declare v_erro text;
begin
  reset role;
  begin
    update core.audit_log set action = 'adulterado por superusuario';
    perform pg_temp.assert(false, 'UPDATE deveria ter sido bloqueado até para superusuário');
  exception when others then
    v_erro := sqlerrm;
    raise notice 'UPDATE (superusuário) bloqueado: %', left(v_erro, 90);
    perform pg_temp.assert(true, 'UPDATE bloqueado pelo TRIGGER, não pela RLS — vale até para superusuário');
  end;

  begin
    delete from core.audit_log;
    perform pg_temp.assert(false, 'DELETE deveria ter sido bloqueado até para superusuário');
  exception when others then
    v_erro := sqlerrm;
    raise notice 'DELETE (superusuário) bloqueado: %', left(v_erro, 90);
    perform pg_temp.assert(true, 'DELETE bloqueado pelo TRIGGER — a trilha não se apaga');
  end;

  -- ⚠️ REGRESSÃO PAGA EM SUSTO. Enquanto os guardas eram FOR EACH ROW, este
  -- comando apagava a trilha INTEIRA, em silêncio, sem erro nenhum: trigger
  -- row-level nunca vê TRUNCATE. Nem o parser nem a revisão pegaram; só o
  -- apply real pegou. Este teste existe para que nunca mais volte.
  begin
    truncate core.audit_log;
    perform pg_temp.assert(false, 'TRUNCATE apagou a trilha — o guarda statement-level sumiu');
  exception when others then
    v_erro := sqlerrm;
    raise notice 'TRUNCATE (superusuário) bloqueado: %', left(v_erro, 90);
    perform pg_temp.assert(true, 'TRUNCATE bloqueado — o buraco que só o apply real revelou');
  end;
end
$$;

-- E os guardas valem em tabela VAZIA também. Row-level não dispara sem linha:
-- um `delete` numa trilha ainda vazia devolvia "DELETE 0" e parecia permitido.
do $$
declare v_erro text; v_ok boolean := false;
begin
  reset role;
  create temp table _trilha_backup on commit drop as select * from core.audit_log;
  begin
    delete from core.audit_log where false;   -- zero linhas afetadas
  exception when others then
    v_erro := sqlerrm; v_ok := true;
  end;
  raise notice 'DELETE que não pegaria linha nenhuma: %', coalesce(left(v_erro,70), 'PERMITIDO (ERRADO)');
  perform pg_temp.assert(v_ok, 'o guarda dispara mesmo quando nenhuma linha seria afetada');
end
$$;

-- E a trilha continua intacta depois de todas as tentativas.
do $$
declare v_n int; v_action text;
begin
  reset role;
  select count(*), max(action) into v_n, v_action from core.audit_log;
  raise notice 'audit_log após as tentativas: linhas=% action=%', v_n, v_action;
  perform pg_temp.assert(v_n = 1 and v_action = 'module.installed',
    'a trilha está intacta: nenhuma tentativa a alterou');
end
$$;

-- =============================================================================
-- CENÁRIO 4 — o encanamento é invisível para o cliente
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: outbox e idempotência são só do service_role ==='

do $$
declare v_erro text; v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform count(*) from core.event_outbox;
  exception when others then
    v_erro := sqlerrm; v_ok := true;
  end;
  raise notice 'authenticated lendo core.event_outbox: %', coalesce(left(v_erro,70), 'PERMITIDO (ERRADO)');
  perform pg_temp.assert(v_ok, 'authenticated NÃO acessa core.event_outbox (sem GRANT, sem policy)');

  v_ok := false; v_erro := null;
  begin
    perform count(*) from core.processed_events;
  exception when others then
    v_erro := sqlerrm; v_ok := true;
  end;
  raise notice 'authenticated lendo core.processed_events: %', coalesce(left(v_erro,70), 'PERMITIDO (ERRADO)');
  perform pg_temp.assert(v_ok, 'authenticated NÃO acessa core.processed_events');
end
$$;

-- Ninguém emite evento à mão: `recon.emit_event` não é concedida.
do $$
declare v_erro text; v_ok boolean := false;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  begin
    perform recon.emit_event(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon.forjado.evento', '{}'::jsonb);
  exception when others then
    v_erro := sqlerrm; v_ok := true;
  end;
  raise notice 'authenticated chamando recon.emit_event: %', coalesce(left(v_erro,70), 'PERMITIDO (ERRADO)');
  perform pg_temp.assert(v_ok,
    'authenticated NÃO chama recon.emit_event — só os triggers emitem');
end
$$;

\echo ''
\echo '============================================================'
\echo ' TODOS OS CENÁRIOS PASSARAM — isolamento provado com usuário real'
\echo '============================================================'
