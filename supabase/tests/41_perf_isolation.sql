-- =============================================================================
-- O MÓDULO 36 NO BANCO — o ciclo que isola por tenant, o avaliador que o
-- servidor carimba, a avaliação que não se rasura e o ciclo fechado que
-- não reabre
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. isolamento + assimetria: o Beta REGISTRA avaliações mas NÃO FECHA
--      ciclo (falta `perf.cycle.manage`);
--   2. ⭐ **o avaliador é carimbado pelo SERVIDOR** — mesmo que o INSERT
--      tente forjar outro `reviewer_id`, quem fica é `auth.uid()` de quem
--      agiu;
--   3. ⭐ **a avaliação é IMUTÁVEL** — UPDATE e DELETE mordem os dois;
--   4. ⭐ **ciclo fechado é TERMINAL** — avaliação nova é recusada, e
--      reabrir (`closed → open`) também é recusado;
--   5. apagar ciclo não existe; `emit_event` não é do cliente; `anon` fora.
--
-- Dado 100% fabricado. `reviewee_id`/`reviewee_name` são id solto + nome
-- forjados — zero CPF/saúde/banco. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert41(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: perf instalado nos dois tenants; Alfa fecha ciclo, Beta só avalia ==='

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'perf', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'perf', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

-- ⚠️ A ASSIMETRIA É O TESTE (a mesma do spc — desenhar × usar): os dois
-- ADMINISTRAM o ciclo (cycle.manage); só o Alfa REGISTRA avaliação
-- (review.manage). Com um usuário por tenant, é assim que se prova a
-- separação das duas mãos: o Beta monta o ciclo, mas não avalia.
insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'perf.cycle.manage', 'perf'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'perf.review.manage', 'perf'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída: os dois montam o ciclo; só o Alfa avalia.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO E ASSIMETRIA: o Beta avalia mas não fecha ciclo
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com seu próprio ciclo; o Beta é barrado de fechar ==='

do $$
declare
  v_cycle_a uuid; v_cycle_b uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into perf.cycles (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1º trimestre 2026')
  returning id into v_cycle_a;

  -- Nasce aberto, mesmo se o formulário insistir em outra coisa.
  begin
    insert into perf.cycles (tenant_id, name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'closed');
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: nasceu fechado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert41(v_erro like '%nasce aberto%', 'o ciclo nasce aberto — não fechado');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta

  insert into perf.cycles (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Anual 2026')
  returning id into v_cycle_b;

  select count(*) into v_n from perf.cycles;
  perform pg_temp.assert41(v_n = 1, 'o Beta enxerga só o ciclo do tenant dele');

  -- ⭐ O Beta MONTA o ciclo (cycle.manage), mas NÃO AVALIA — falta review.manage.
  begin
    insert into perf.reviews (tenant_id, cycle_id, reviewee_id, reviewee_name, summary)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_cycle_b,
      '99999999-9999-4999-8999-999999999999', 'Beto do Beta',
      'Entregou dentro do prazo.'
    );
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: o Beta avaliou sem review.manage');
  exception when insufficient_privilege then
    perform pg_temp.assert41(true, '⭐ avaliar exige perf.review.manage — quem monta o ciclo não avalia');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ O AVALIADOR É CARIMBADO PELO SERVIDOR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: reviewer_id é sempre quem agiu — mesmo que o insert tente forjar outro ==='

do $$
declare
  v_cycle uuid; v_review uuid; v_reviewer uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  select id into v_cycle from perf.cycles
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = '1º trimestre 2026';

  -- Tenta forjar reviewer_id com outra pessoa — o servidor ignora e carimba quem agiu.
  insert into perf.reviews (tenant_id, cycle_id, reviewee_id, reviewee_name, reviewer_id, summary, rating)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_cycle,
    '88888888-8888-4888-8888-888888888888', 'Ana Vendedora',
    '77777777-7777-4777-8777-777777777777',  -- forjado: outra pessoa
    'Superou as metas do trimestre.', 92
  )
  returning id into v_review;

  select reviewer_id into v_reviewer from perf.reviews where id = v_review;
  perform pg_temp.assert41(
    v_reviewer = '11111111-1111-4111-8111-111111111111',
    '⭐ reviewer_id carimbado pelo SERVIDOR — o forjado foi ignorado');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐ A AVALIAÇÃO É IMUTÁVEL: UPDATE E DELETE MORDEM OS DOIS
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: avaliação registrada não se edita nem se apaga ==='

do $$
declare
  v_review uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_review from perf.reviews
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and reviewee_name = 'Ana Vendedora';

  -- ⭐ Imutável em DUAS camadas: sem grant de UPDATE/DELETE (o cliente é
  -- barrado por privilégio, que vem ANTES do gatilho) E o gatilho que recusa
  -- até o dono do banco. Para o cliente, o privilégio morde primeiro.
  begin
    update perf.reviews set rating = 100 where id = v_review;
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: editou a avaliação');
  exception when insufficient_privilege then
    perform pg_temp.assert41(true, '⭐ avaliação não se edita — fato consumado (sem grant de UPDATE)');
  end;

  begin
    delete from perf.reviews where id = v_review;
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: apagou a avaliação');
  exception when insufficient_privilege then
    perform pg_temp.assert41(true, '⭐ avaliação não se apaga — fato consumado (sem grant de DELETE)');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ CICLO FECHADO É TERMINAL: SEM AVALIAÇÃO NOVA, SEM REABRIR
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: fechar o ciclo; avaliação nova recusada; reabrir recusado ==='

do $$
declare
  v_cycle uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa (cycle.manage)

  select id into v_cycle from perf.cycles
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = '1º trimestre 2026';

  update perf.cycles set status = 'closed' where id = v_cycle;
  perform pg_temp.assert41(true, 'o Alfa fecha o ciclo — cycle.manage');

  -- Avaliação nova em ciclo fechado: recusada.
  begin
    insert into perf.reviews (tenant_id, cycle_id, reviewee_id, reviewee_name, summary)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_cycle,
      '66666666-6666-4666-8666-666666666666', 'Tentativa Tardia',
      'Não deveria entrar.'
    );
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: avaliou em ciclo fechado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert41(v_erro like '%fechado%', '⭐ ciclo fechado não recebe avaliação nova');
  end;

  -- Reabrir: recusado. closed é terminal.
  begin
    update perf.cycles set status = 'open' where id = v_cycle;
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: o ciclo fechado reabriu');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert41(v_erro like '%terminal%', '⭐ closed é terminal — o próximo é ciclo novo');
  end;

  -- Congela: nem o nome muda depois de fechado.
  begin
    update perf.cycles set name = 'rasura' where id = v_cycle;
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: editou o nome do ciclo fechado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert41(v_erro like '%não se edita%', 'ciclo fechado congela inteiro');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — APAGAR CICLO NÃO EXISTE; A CANETA NÃO É DO CLIENTE; ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: apagar ciclo não existe; emit_event não é concedida; anon barrado ==='

do $$
declare
  v_cycle uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_cycle from perf.cycles limit 1;

  begin
    delete from perf.cycles where id = v_cycle;
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: apagou o ciclo');
  exception when insufficient_privilege then
    perform pg_temp.assert41(true, 'apagar ciclo não existe — só fechar');
  end;

  begin
    perform perf.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'perf.cycle.opened', '{}'::jsonb);
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert41(true, 'perf.emit_event não é concedida ao cliente');
  end;
end $$;

-- ⭐ ANON NÃO ENCOSTA — com o papel real.
do $$
begin
  set local role anon;
  begin
    perform 1 from perf.cycles limit 1;
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: anon leu perf.cycles');
  exception when insufficient_privilege then
    perform pg_temp.assert41(true, '⭐ anon não encosta em perf.cycles');
  end;

  begin
    perform 1 from perf.reviews limit 1;
    perform pg_temp.assert41(false, 'DEVERIA TER FALHADO: anon leu perf.reviews');
  exception when insufficient_privilege then
    perform pg_temp.assert41(true, '⭐ anon não encosta em perf.reviews');
  end;
  reset role;
end $$;

\echo ''
\echo '=== MÓDULO 36 OK: ciclo isolado, avaliador carimbado pelo servidor, avaliação imutável, ciclo fechado terminal, anon fora ==='
