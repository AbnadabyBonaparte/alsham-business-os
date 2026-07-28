-- =============================================================================
-- O INSTALADOR EM RUNTIME — instalar dá acesso, desinstalar NÃO apaga dado
-- =============================================================================
--
-- Roda depois de `01_rls_isolation.sql` (tenants Alfa e Beta, três usuários) e
-- de `03_marketing_consumption.sql` (campanhas nos dois tenants).
--
-- ⭐ A prova central é o **Cenário 5**: depois de desinstalar, a campanha
-- continua no banco e some da vista do usuário. Um instalador que apagasse
-- dado transformaria um clique em perda irreversível de dado contábil.
--
-- Dado 100% fabricado. Script descartável, banco efêmero.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert4(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  ✅ %', p_label;
  else raise exception '  ❌ FALHOU: %', p_label;
  end if;
end;
$$;

\echo ''
\echo '=== MONTAGEM: um papel DE TENANT e o poder de instalar ==='

-- O papel que vai receber as permissões do módulo. É do tenant, não de sistema.
insert into core.roles (tenant_id, key, name, description) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'operacao',
   'Operação', 'Papel de tenant que recebe as permissões dos módulos instalados.')
on conflict (tenant_id, key) do nothing;

-- `user-a` é admin do Alfa. O seed dá `core.module.install` só ao `owner`,
-- então damos ao papel de tenant dele — é a fronteira que o seed desenhou.
insert into core.roles (tenant_id, key, name, description) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dono-do-tenant',
   'Dono do tenant', 'Pode instalar módulos.')
on conflict (tenant_id, key) do nothing;

insert into core.role_permissions (role_id, role_key, permission_key, module_id)
select r.id, r.key, 'core.module.install', 'core'
  from core.roles r
 where r.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and r.key = 'dono-do-tenant'
on conflict (role_id, permission_key) do nothing;

-- ⚠️ user-c NÃO ganha `core.module.install` — é ele quem prova o cenário 1.

-- Os testes 01 e 03 inserem `tenant_modules` à mão, como o mundo antes do
-- instalador existir. Este teste é sobre instalar DE VERDADE, então o Alfa
-- começa limpo. O Beta mantém a linha do fixture — é ele que prova, no
-- cenário 7, que desinstalar num tenant não mexe no outro.
delete from core.tenant_modules where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

\echo 'montagem concluída.'

-- =============================================================================
-- CENÁRIO 1 — ⛔ QUEM NÃO PODE, NÃO INSTALA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 1: instalar sem core.module.install ==='

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';  -- user-c, sem a permissão

  begin
    perform core.install_module(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon', 'operacao');
    raise exception '  ❌ FALHOU: instalou sem a permissão';
  exception
    when insufficient_privilege then
      raise notice '  ✅ recusado por falta de core.module.install';
    when others then
      get stacked diagnostics v_erro = message_text;
      if v_erro like '%FALHOU%' then raise; end if;
      raise notice '  ✅ recusado (%)', left(v_erro, 70);
  end;
end
$$;

do $$
declare v_n int;
begin
  select count(*) into v_n from core.tenant_modules
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and module_id = 'recon';
  perform pg_temp.assert4(v_n = 0, 'nada foi instalado');
end
$$;

-- =============================================================================
-- CENÁRIO 2 — ⛔ PAPEL DE SISTEMA É RECUSADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 2: instalar concedendo a um papel de SISTEMA ==='
\echo '    (é o vazamento que a ponte do seed criava: papel de sistema vale'
\echo '     em TODO tenant, e o módulo chegaria a quem não instalou)'

-- user-a passa a ser o dono do tenant, com poder de instalar.
insert into core.memberships (tenant_id, user_id, role_key, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111', 'dono-do-tenant', 'active')
on conflict (tenant_id, user_id) do update set role_key = excluded.role_key;

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    -- `owner` existe SÓ como papel de sistema (tenant_id null) — nenhum
    -- fixture cria um `owner` de tenant. É o caso puro.
    perform core.install_module(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon', 'owner');
    raise exception '  ❌ FALHOU: concedeu permissão de módulo a papel de sistema';
  exception
    when others then
      get stacked diagnostics v_erro = message_text;
      if v_erro like '%FALHOU%' then raise; end if;
      raise notice '  ✅ recusado: %', left(v_erro, 90);
  end;
end
$$;

-- =============================================================================
-- CENÁRIO 3 — ⛔ SÓ O QUE ESTÁ PUBLICADO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 3: instalar um módulo em rascunho ==='

insert into core.module_registry (
  module_id, name, version, summary, layer, domain_key, requires_core, status)
values ('rascunho', 'Módulo em rascunho', '0.0.1',
        'Existe no catálogo, não está na vitrine.', 'domain', 'finance', '0.0.x', 'draft')
on conflict (module_id) do nothing;

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform core.install_module(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rascunho', 'operacao');
    raise exception '  ❌ FALHOU: instalou um módulo não publicado';
  exception
    when others then
      get stacked diagnostics v_erro = message_text;
      if v_erro like '%FALHOU%' then raise; end if;
      raise notice '  ✅ recusado: %', left(v_erro, 80);
  end;
end
$$;

do $$
declare v_visivel int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select count(*) into v_visivel from core.module_registry where module_id = 'rascunho';
  perform pg_temp.assert4(v_visivel = 0,
    'e o rascunho nem aparece na vitrine — a policy já o esconde');
end
$$;

-- =============================================================================
-- CENÁRIO 4 — ⭐ INSTALAR DE VERDADE
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 4: instalar dá acesso ==='

do $$
declare v_antes boolean; v_depois boolean; v_id uuid; v_perms int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  -- ⚠️ user-a agora é `dono-do-tenant`, que NÃO tem as permissões do recon.
  select core.has_permission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon.match.manage')
    into v_antes;
  perform pg_temp.assert4(not v_antes, 'antes de instalar, não tem a permissão do módulo');

  select core.install_module(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon', 'dono-do-tenant') into v_id;
  perform pg_temp.assert4(v_id is not null, 'instalou e devolveu o id da instalação');

  select core.has_permission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'recon.match.manage')
    into v_depois;
  perform pg_temp.assert4(v_depois, 'depois de instalar, TEM a permissão — sem ninguém digitar');

  -- ⚠️ Filtra pelo PAPEL, não só pelo tenant: o fixture do teste 01 já criara
  -- um papel `conciliador` com duas permissões do recon. Contar o tenant
  -- inteiro misturava as duas coisas e reprovava uma instalação correta.
  select count(*) into v_perms from core.role_permissions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and module_id = 'recon'
     and role_key  = 'dono-do-tenant';
  perform pg_temp.assert4(v_perms = 3, 'as 3 permissões do manifesto foram concedidas ao papel indicado');
end
$$;

do $$
declare v_status text; v_tipo text;
begin
  select status into v_status from core.tenant_modules
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and module_id = 'recon';
  perform pg_temp.assert4(v_status = 'active', 'o módulo ficou ativo para o tenant');

  select event_type into v_tipo from core.event_outbox
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   order by occurred_at desc limit 1;
  perform pg_temp.assert4(v_tipo = 'core.module.installed',
    'o fato foi para a caixa de saída — o correio o levará à trilha');
end
$$;

-- =============================================================================
-- CENÁRIO 5 — ⭐⭐ DESINSTALAR CORTA O ACESSO E **NÃO APAGA DADO**
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 5: a prova que mais importa ==='

-- Instala o marketing e garante que há dado dele no tenant.
do $$
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  perform core.install_module(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'marketing', 'dono-do-tenant');
end
$$;

do $$
declare v_campanhas int; v_ve int;
begin
  -- Quantas campanhas o tenant tem, olhando de fora da RLS.
  select count(*) into v_campanhas from marketing.campaigns
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert4(v_campanhas > 0, 'há dado de marketing no tenant antes de desinstalar');
  raise notice '  campanhas no banco: %', v_campanhas;

  -- E o usuário as enxerga, porque agora tem permissão.
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select count(*) into v_ve from marketing.campaigns;
  perform pg_temp.assert4(v_ve = v_campanhas, 'e o usuário as enxerga');
end
$$;

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  perform core.uninstall_module('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'marketing');
  raise notice '  ✅ desinstalou';
end
$$;

do $$
declare v_no_banco int; v_ve int; v_status text; v_perms int;
begin
  -- ⭐ O DADO CONTINUA LÁ. Visto de fora da RLS.
  select count(*) into v_no_banco from marketing.campaigns
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.assert4(v_no_banco > 0,
    'O DADO CONTINUA NO BANCO depois de desinstalar');
  raise notice '  campanhas no banco depois de desinstalar: %', v_no_banco;

  select status into v_status from core.tenant_modules
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and module_id = 'marketing';
  perform pg_temp.assert4(v_status = 'uninstalled',
    'a linha da instalação continua, com status uninstalled — o histórico sobrevive');

  select count(*) into v_perms from core.role_permissions
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and module_id = 'marketing';
  perform pg_temp.assert4(v_perms = 0, 'as permissões foram revogadas');
end
$$;

do $$
declare v_ve int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  select count(*) into v_ve from marketing.campaigns;
  raise notice '  o usuário agora enxerga % campanha(s)', v_ve;
  perform pg_temp.assert4(v_ve = 0,
    'e o usuário NÃO as enxerga mais — o acesso foi cortado, não o dado');
end
$$;

-- =============================================================================
-- CENÁRIO 6 — REINSTALAR REENCONTRA A HISTÓRIA
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 6: reinstalar devolve o acesso ao mesmo dado ==='

do $$
declare v_ve int; v_linhas int;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  perform core.install_module(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'marketing', 'dono-do-tenant');

  select count(*) into v_ve from marketing.campaigns;
  perform pg_temp.assert4(v_ve > 0, 'o cliente reencontra as campanhas dele');
end
$$;

do $$
declare v_linhas int;
begin
  select count(*) into v_linhas from core.tenant_modules
   where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and module_id = 'marketing';
  perform pg_temp.assert4(v_linhas = 1,
    'e continua existindo UMA linha de instalação — reinstalar é update, não linha nova');
end
$$;

-- =============================================================================
-- CENÁRIO 7 — DESINSTALAR NUM TENANT NÃO AFETA O OUTRO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 7: o isolamento vale para a instalação também ==='

do $$
declare v_beta int;
begin
  -- O Beta tem o marketing ativo desde o teste 03.
  select count(*) into v_beta from core.tenant_modules
   where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     and module_id = 'marketing' and status = 'active';
  perform pg_temp.assert4(v_beta = 1, 'o Beta continua com o módulo ativo');
end
$$;

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';  -- do Alfa

  begin
    perform core.uninstall_module('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'marketing');
    raise exception '  ❌ FALHOU: desinstalou módulo de OUTRO tenant';
  exception
    when insufficient_privilege then
      raise notice '  ✅ não dá para desinstalar o módulo de outro tenant';
    when others then
      get stacked diagnostics v_erro = message_text;
      if v_erro like '%FALHOU%' then raise; end if;
      raise notice '  ✅ recusado (%)', left(v_erro, 70);
  end;
end
$$;

-- =============================================================================
-- CENÁRIO 8 — O TETO DO PLANO
-- =============================================================================
\echo ''
\echo '=== CENÁRIO 8: plan_limits ganha o primeiro consumidor ==='

do $$
declare v_erro text; v_plano text;
begin
  -- Aperta o teto do plano do Alfa para 1 módulo.
  select plan_code into v_plano from core.tenants
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  update core.plan_limits set limit_value = 1, on_exceed = 'block'
   where plan_code = v_plano and metric = 'modules';

  -- O Alfa já tem recon + marketing ativos. Tentar um terceiro tem de falhar.
  insert into core.module_registry (
    module_id, name, version, summary, layer, domain_key, requires_core, status)
  values ('terceiro', 'Terceiro módulo', '0.1.0', 'Para provar o teto.',
          'domain', 'finance', '0.0.x', 'published')
  on conflict (module_id) do nothing;
end
$$;

do $$
declare v_erro text;
begin
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

  begin
    perform core.install_module(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'terceiro', 'dono-do-tenant');
    raise exception '  ❌ FALHOU: instalou além do teto do plano';
  exception
    when configuration_limit_exceeded then
      raise notice '  ✅ o teto do plano barrou a instalação';
    when others then
      get stacked diagnostics v_erro = message_text;
      if v_erro like '%FALHOU%' then raise; end if;
      raise notice '  ✅ recusado (%)', left(v_erro, 80);
  end;
end
$$;

\echo ''
\echo '======================================================================'
\echo ' ✅ O INSTALADOR PASSOU'
\echo '    Sem permissão não instala · papel de sistema recusado ·'
\echo '    só publicado · instalar concede · DESINSTALAR NÃO APAGA DADO ·'
\echo '    reinstalar reencontra · tenant não mexe no outro · o teto vale.'
\echo '======================================================================'
