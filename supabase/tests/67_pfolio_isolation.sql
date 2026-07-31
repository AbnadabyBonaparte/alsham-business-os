-- =============================================================================
-- O MÓDULO 62 NO BANCO — o portfólio que se isola, o active↔archived que VOLTA,
-- o MESMO projeto em VÁRIOS portfólios, e a membership mutável
-- =============================================================================
--
-- ⭐⭐ A ÚLTIMA peça (62/62 desta frente): fecha o Domain PMO & Projetos 10/10.
--
-- Roda depois de `01_rls_isolation.sql` e `04_install_module.sql`.
--
-- ⭐ **Por que este teste existe e não bastam os do TypeScript:**
--
--   1. os portfólios de um tenant não aparecem no outro; nasce active e o autor
--      é carimbado pelo servidor;
--   2. ⭐ **active → archived → active** — o round-trip do DIVERGE: o portfólio
--      VOLTA (o fato `restored` sai);
--   3. ⭐⭐ **o MESMO projeto em DOIS portfólios diferentes passa** (o ponto do
--      módulo), mas o MESMO projeto DUAS vezes no MESMO portfólio bate no único;
--   4. um membro apontando para portfólio inexistente/de outro tenant é barrado
--      (a FK composta intra-schema / RLS pega);
--   5. cross-tenant barrado;
--   6. membro DELETE funciona (membership mutável, o fato `removed` sai), mas
--      DELETE de portfólio é barrado (arquivado é história); a caneta de emitir
--      evento não é do cliente; o `anon` não encosta.
--
-- Dado 100% fabricado. Zero nome de cliente. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert67(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: pfolio instalado nos dois tenants ==='

-- ⚠️ pfolio ainda NÃO está no seed do catálogo (o cartão é adicionado pelo dono,
-- arquivo compartilhado). O teste registra o próprio cartão para poder instalar
-- o módulo — transcrição fiel do MANIFEST de @alsham/pfolio.
insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key,
  capabilities, permissions, events_emits, events_consumes, agents,
  requires_core, status
)
values (
  'pfolio', 'Portfólio', '0.1.0',
  'Portfólio de projetos — o agrupamento para leitura executiva.',
  'domain', 'pmo',
  '[{"key":"pfolio","canonicalName":"Portfólio"}]'::jsonb,
  '[{"key":"pfolio.portfolio.manage","moduleId":"pfolio","description":"Gerir portfólios e membros."}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '0.0.x', 'published'
)
on conflict (module_id) do nothing;

insert into core.tenant_modules (tenant_id, module_id, version, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pfolio', '0.1.0', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pfolio', '0.1.0', 'active')
on conflict (tenant_id, module_id) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'pfolio.portfolio.manage', 'pfolio'
  from core.memberships m
  join core.roles r on r.tenant_id = m.tenant_id and r.key = m.role_key
 where m.user_id in ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222')
on conflict (role_id, permission_key) do nothing;

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ISOLAMENTO, O NASCIMENTO ATIVO E O AUTOR CARIMBADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: cada tenant com o seu portfólio; nasce active; autor do servidor ==='

do $$
declare
  v_id uuid; v_n int; v_erro text; v_created_by uuid;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  insert into pfolio.portfolios (tenant_id, name, description, created_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Estratégicos', 'os da diretoria',
          '22222222-2222-4222-8222-222222222222')
  returning id, created_by into v_id, v_created_by;

  perform pg_temp.assert67(
    v_created_by = '11111111-1111-4111-8111-111111111111',
    '⭐ created_by é quem está autenticado — o autor mentido no INSERT foi descartado');

  begin
    insert into pfolio.portfolios (tenant_id, name, status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nasce Errado', 'archived');
    perform pg_temp.assert67(false, 'DEVERIA TER FALHADO: nasceu arquivado');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform pg_temp.assert67(v_erro like '%nasce ativo%', 'o portfólio nasce ativo');
  end;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';  -- Beta
  insert into pfolio.portfolios (tenant_id, name)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Portfólio do Beta');

  select count(*) into v_n from pfolio.portfolios;
  perform pg_temp.assert67(v_n = 1, 'o Beta enxerga só o portfólio dele');
end $$;

-- =============================================================================
-- CENÁRIO 2 — ⭐ active → archived → active (o round-trip; o portfólio VOLTA)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: arquivar e reabrir — o DIVERGE dos fins terminais do proj ==='

do $$
declare
  v_id uuid; v_erro text; v_arch int; v_rest int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_id from pfolio.portfolios
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Estratégicos';

  update pfolio.portfolios set status = 'archived' where id = v_id;
  perform pg_temp.assert67(
    (select status from pfolio.portfolios where id = v_id) = 'archived',
    'arquivar leva a archived');

  -- ⭐ E VOLTA — o DIVERGE do proj (onde completed/cancelled são terminais).
  update pfolio.portfolios set status = 'active' where id = v_id;
  perform pg_temp.assert67(
    (select status from pfolio.portfolios where id = v_id) = 'active',
    '⭐ o portfólio arquivado VOLTA (archived → active) — o mesmo agrupamento');

  reset role;
  select count(*) into v_arch from core.event_outbox where event_type = 'pfolio.portfolio.archived';
  select count(*) into v_rest from core.event_outbox where event_type = 'pfolio.portfolio.restored';
  perform pg_temp.assert67(v_arch = 1, 'o fato de arquivamento saiu');
  perform pg_temp.assert67(v_rest = 1, '⭐ o fato de restauração saiu — a volta é registrada');
end $$;

-- =============================================================================
-- CENÁRIO 3 — ⭐⭐ O MESMO PROJETO EM VÁRIOS PORTFÓLIOS (o ponto do módulo)
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: o projeto C em dois portfólios passa; duas vezes no mesmo, não ==='

do $$
declare
  v_pf1 uuid; v_pf2 uuid; v_n int; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_pf1 from pfolio.portfolios
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Estratégicos';

  insert into pfolio.portfolios (tenant_id, name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Inovação')
  returning id into v_pf2;

  -- O projeto C entra no portfólio 1...
  insert into pfolio.members (tenant_id, portfolio_id, project_id, project_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pf1,
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Obra Central');

  -- ...e TAMBÉM no portfólio 2 — o MESMO projeto, dois recortes de leitura.
  insert into pfolio.members (tenant_id, portfolio_id, project_id, project_name)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pf2,
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Obra Central');

  select count(*) into v_n from pfolio.members
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and project_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  perform pg_temp.assert67(v_n = 2, '⭐⭐ o MESMO projeto vive em DOIS portfólios');

  -- Mas o MESMO projeto DUAS vezes no MESMO portfólio bate no único.
  begin
    insert into pfolio.members (tenant_id, portfolio_id, project_id, project_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_pf1,
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Obra Central');
    perform pg_temp.assert67(false, 'DEVERIA TER FALHADO: projeto duplicado no mesmo portfólio');
  exception when unique_violation then
    perform pg_temp.assert67(true, '⭐ um projeto aparece UMA vez por portfólio (único por portfólio+projeto)');
  end;

  reset role;
  select count(*) into v_n from core.event_outbox where event_type = 'pfolio.member.added';
  perform pg_temp.assert67(v_n = 2, 'os dois fatos de entrada de membro saíram');
end $$;

-- =============================================================================
-- CENÁRIO 4 — MEMBRO COM PORTFÓLIO INEXISTENTE / DE OUTRO TENANT É BARRADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: a FK composta intra-schema barra portfólio bogus/alheio ==='

do $$
declare
  v_beta_pf uuid; v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa

  -- Portfólio inexistente: a FK composta (portfolio_id, tenant_id) barra.
  begin
    insert into pfolio.members (tenant_id, portfolio_id, project_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '99999999-9999-4999-8999-999999999999',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    perform pg_temp.assert67(false, 'DEVERIA TER FALHADO: membro em portfólio inexistente');
  exception when foreign_key_violation then
    perform pg_temp.assert67(true, '⭐ membro em portfólio inexistente barrado (FK composta intra-schema)');
  end;

  -- Portfólio do BETA, com o tenant do Alfa: a FK exige (id, tenant) do MESMO
  -- portfólio — como o do Beta tem tenant do Beta, o par não bate.
  reset role;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  select id into v_beta_pf from pfolio.portfolios
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'Portfólio do Beta';

  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- volta a ser Alfa
  begin
    insert into pfolio.members (tenant_id, portfolio_id, project_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_beta_pf,
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    perform pg_temp.assert67(false, 'DEVERIA TER FALHADO: membro do Alfa apontando portfólio do Beta');
  exception when foreign_key_violation then
    perform pg_temp.assert67(true, '⭐ membro não atravessa tenant: portfólio do Beta é inalcançável pelo Alfa');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 5 — CROSS-TENANT: O ALFA NÃO ESCREVE NO PORTFÓLIO DO BETA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: escrever no tenant do vizinho é barrado pela RLS ==='

do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- Alfa
  begin
    insert into pfolio.portfolios (tenant_id, name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasor');
    perform pg_temp.assert67(false, 'DEVERIA TER FALHADO: o Alfa escreveu no tenant do Beta');
  exception when others then
    perform pg_temp.assert67(true, '⭐ cross-tenant barrado: o Alfa não cadastra no tenant do Beta');
  end;
end $$;

-- =============================================================================
-- CENÁRIO 6 — MEMBRO SAI (mutável); PORTFÓLIO NÃO APAGA; CANETA/ANON FORA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: membro DELETE funciona; portfólio DELETE barrado; emit/anon fora ==='

do $$
declare
  v_pf1 uuid; v_mem uuid; v_n int; v_removed int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  select id into v_pf1 from pfolio.portfolios
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Estratégicos';

  select id into v_mem from pfolio.members
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and portfolio_id = v_pf1
   limit 1;

  -- ⭐ Membership é MUTÁVEL: o projeto sai do recorte.
  delete from pfolio.members where id = v_mem;
  select count(*) into v_n from pfolio.members where id = v_mem;
  perform pg_temp.assert67(v_n = 0, '⭐ o projeto saiu do portfólio (membership mutável)');

  reset role;
  select count(*) into v_removed from core.event_outbox where event_type = 'pfolio.member.removed';
  perform pg_temp.assert67(v_removed = 1, 'o fato de saída de membro saiu');

  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⛔ Portfólio não se apaga — arquivado é história (e volta).
  begin
    delete from pfolio.portfolios where id = v_pf1;
    perform pg_temp.assert67(false, 'DEVERIA TER FALHADO: apagou portfólio');
  exception when insufficient_privilege then
    perform pg_temp.assert67(true, 'apagar portfólio não existe — arquivado é história');
  end;

  -- ⛔ A caneta de emitir evento não é do cliente.
  begin
    perform pfolio.emit_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pfolio.portfolio.registered', '{}'::jsonb);
    perform pg_temp.assert67(false, 'DEVERIA TER FALHADO: cliente emitiu evento à mão');
  exception when insufficient_privilege then
    perform pg_temp.assert67(true, 'pfolio.emit_event não é concedida ao cliente');
  end;
end $$;

do $$
begin
  set local role anon;
  begin
    perform 1 from pfolio.portfolios limit 1;
    perform pg_temp.assert67(false, 'DEVERIA TER FALHADO: anon leu pfolio.portfolios');
  exception when insufficient_privilege then
    perform pg_temp.assert67(true, '⭐ anon não encosta em pfolio.portfolios');
  end;
  reset role;
end $$;

\echo ''
\echo '=== ⭐⭐ MÓDULO 62 OK — a ÚLTIMA peça; PMO 10/10 ==='
