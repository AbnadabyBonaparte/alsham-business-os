-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0006_install.sql
-- O INSTALADOR DE MÓDULO EM RUNTIME. Fecha os passos 3 e 4 do CORE-SPEC §3.
-- =============================================================================
--
-- NÃO APLICADO. `0001`→`0005` e o seed estão aplicados em produção (informado
-- pelo dono; ver CLAUDE.md §5.4.1). Esta é a próxima da fila, e aplicar é ato
-- do dono — ver docs/runbook/APLICAR.md §7.
--
-- MAS PROVADO: aplicado a cada push, depois de 0001→0005, num PostgreSQL 17
-- limpo, com teste de permissão negada e de desinstalação preservando dado.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTE ARQUIVO FECHA
-- -----------------------------------------------------------------------------
-- Desde a Etapa 1 o CORE-SPEC descreve o ciclo de vida do módulo, e os passos
-- 3 (tenant instala) e 4 (recebe permissões) estavam **NÃO CONSTRUÍDOS**. Sem
-- eles, "o cliente monta o sistema dele" era desenho.
--
-- -----------------------------------------------------------------------------
-- ⚠️ O VAZAMENTO QUE ESTE ARQUIVO EXISTE PARA FECHAR
-- -----------------------------------------------------------------------------
-- O seed concedia as permissões de `recon` e `marketing` ao papel de sistema
-- `admin` (`tenant_id is null`), como ponte provisória — e o próprio seed dizia
-- *"quando o instalador nascer, este bloco sai"*.
--
-- A ponte tem um efeito que só aparece com o segundo tenant: `has_permission`
-- casa `rp.tenant_id is null OR rp.tenant_id = m.tenant_id`. Um papel de
-- sistema vale em **todo** tenant. Ou seja: qualquer tenant novo cujo usuário
-- tenha `role_key = 'admin'` já nasce com as permissões dos dois módulos —
-- **sem instalar nada**.
--
-- Por isso `core.install_module()` **recusa papel de sistema**. Conceder ali
-- seria recriar o vazamento pela via oficial.
--
-- ⛔ Remover o bloco do seed NÃO apaga as linhas que já existem em produção.
-- A limpeza é ato do dono e está no runbook §7.3 — com o aviso do que ela
-- muda para quem já usa.
--
-- =============================================================================

-- =============================================================================
-- 1. A PORTA DE SAÍDA DO PRÓPRIO CORE
-- -----------------------------------------------------------------------------
-- Os módulos têm `recon.emit_event` e `marketing.emit_event`. O Core não tinha
-- — porque até aqui ele não emitia nada. Instalar e desinstalar são fatos da
-- plataforma, e fato da plataforma também passa pela caixa de saída: é assim
-- que a trilha os registra sem ninguém escrever auditoria à mão.
--
-- Mesmo cinto dos módulos, com o prefixo do Core.
-- =============================================================================

create or replace function core.emit_event(
  p_tenant_id      uuid,
  p_event_type     text,
  p_payload        jsonb,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if p_event_type not like 'core.%' then
    raise exception 'core.emit_event: tipo % não pertence ao Core', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'core',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function core.emit_event(uuid, text, jsonb, uuid) is
  'A porta de saída do Core. Só emite core.*; instalar e desinstalar passam por aqui e viram trilha.';

-- =============================================================================
-- 2. ⭐ INSTALAR
-- -----------------------------------------------------------------------------
-- Uma transação, cinco recusas e dois efeitos.
--
-- SECURITY DEFINER porque precisa escrever em `core.role_permissions` de um
-- papel do tenant — e a policy daquela tabela exige `core.role.manage`, que é
-- outra permissão. Quem instala tem `core.module.install`; a concessão é
-- **consequência** de instalar, não um ato separado de administração de papéis.
-- É exatamente o passo 4 do CORE-SPEC §3.
--
-- ⚠️ Sendo SECURITY DEFINER, ela **não pode confiar no `p_tenant_id` que
-- recebe**: a primeira coisa que faz é conferir a permissão NAQUELE tenant,
-- com `auth.uid()` da sessão. Função SECURITY DEFINER que pula essa checagem é
-- exatamente como se atravessa a RLS sem perceber.
-- =============================================================================

create or replace function core.install_module(
  p_tenant_id uuid,
  p_module_id text,
  p_role_key  text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status      text;
  v_version     text;
  v_permissoes  jsonb;
  v_role_id     uuid;
  v_role_tenant uuid;
  v_limite      bigint;
  v_on_exceed   text;
  v_instalados  bigint;
  v_id          uuid;
  v_concedidas  int;
begin
  -- (1) QUEM. A fronteira do seed: `owner` instala, `admin` não.
  if not core.has_permission(p_tenant_id, 'core.module.install') then
    raise exception 'instalar módulo exige a permissão core.module.install'
      using errcode = '42501';
  end if;

  -- (2) O QUÊ. Só o que está na vitrine. `draft` e `deprecated` não se instalam
  -- — e a policy de leitura já esconde os dois, mas quem chama a função com o
  -- id na mão não passa pela policy.
  select status, version, permissions
    into v_status, v_version, v_permissoes
    from core.module_registry
   where module_id = p_module_id;

  if not found then
    raise exception 'módulo % não existe no catálogo', p_module_id
      using errcode = '22023';
  end if;

  if v_status <> 'published' then
    raise exception 'módulo % está % — só se instala o que está publicado',
      p_module_id, v_status using errcode = '22023';
  end if;

  -- (3) ONDE AS PERMISSÕES VÃO PARAR. Papel DO TENANT, sempre.
  select id, tenant_id into v_role_id, v_role_tenant
    from core.roles
   where key = p_role_key
     and tenant_id = p_tenant_id;

  if not found then
    -- A mensagem diz o que fazer, porque a causa mais provável é o tenant
    -- ainda não ter criado nenhum papel próprio.
    raise exception
      'o tenant não tem o papel %. Instalar concede permissões a um papel DO TENANT — papel de sistema vale em todos os tenants e faria as permissões do módulo vazarem para quem não o instalou',
      p_role_key using errcode = '22023';
  end if;

  -- (4) QUANTO. O primeiro consumidor real de `core.plan_limits`.
  --
  -- ⚠️ A regra vive aqui e **só** aqui. A tela mostra "X de Y" como
  -- informação; quem decide é esta função. Duas implementações da mesma regra
  -- divergem no dia em que alguém corrigir uma só.
  select pl.limit_value, pl.on_exceed
    into v_limite, v_on_exceed
    from core.tenants t
    join core.plan_limits pl
      on pl.plan_code = t.plan_code
     and pl.metric    = 'modules'
   where t.id = p_tenant_id;

  if v_limite is not null and coalesce(v_on_exceed, 'block') = 'block' then
    select count(*) into v_instalados
      from core.tenant_modules
     where tenant_id = p_tenant_id
       and status in ('active', 'installing', 'suspended')
       and module_id <> p_module_id;   -- reinstalar o mesmo não conta duas vezes

    if v_instalados >= v_limite then
      raise exception
        'o plano deste tenant permite % módulo(s) e já há % instalado(s)',
        v_limite, v_instalados using errcode = '53400';
    end if;
  end if;

  -- (5) O EFEITO. Reinstalar um módulo desinstalado é `update`, não linha nova:
  -- o histórico do que o tenant já teve sobrevive (`settings` inclusive).
  insert into core.tenant_modules (tenant_id, module_id, version, status)
       values (p_tenant_id, p_module_id, v_version, 'active')
  on conflict (tenant_id, module_id) do update
       set status  = 'active',
           version = excluded.version
    returning id into v_id;

  -- (6) AS PERMISSÕES DO MANIFESTO. `module_id` é o que permite revogar tudo
  -- de um módulo de uma vez quando ele sair.
  insert into core.role_permissions (role_id, role_key, permission_key, module_id)
  select v_role_id, p_role_key, perm->>'key', p_module_id
    from jsonb_array_elements(coalesce(v_permissoes, '[]'::jsonb)) as perm
   where perm->>'key' is not null
  on conflict (role_id, permission_key) do nothing;

  get diagnostics v_concedidas = row_count;

  perform core.emit_event(
    p_tenant_id,
    'core.module.installed',
    jsonb_build_object(
      'moduleId',           p_module_id,
      'version',            v_version,
      'roleKey',            p_role_key,
      'permissionsGranted', v_concedidas,
      'tenantModuleId',     v_id
    )
  );

  return v_id;
end;
$$;

comment on function core.install_module(uuid, text, text) is
  'Instala um módulo para um tenant: grava tenant_modules e concede as permissões do manifesto a um papel DO TENANT. Exige core.module.install. Recusa módulo não publicado e papel de sistema.';

-- =============================================================================
-- 3. ⭐ DESINSTALAR — e a linha que este arquivo mais protege
-- -----------------------------------------------------------------------------
-- **Desinstalar corta o ACESSO. Não apaga dado.**
--
-- Nenhum `delete` nem `truncate` em `recon.*` ou `marketing.*` — nem poderia
-- haver: esta função não conhece schema de módulo nenhum, e há teste no CI que
-- prova que os dados continuam lá depois de desinstalar.
--
-- É decisão, não omissão. O cliente que desinstala hoje e reinstala em três
-- meses reencontra a conciliação dele. E o cliente que sai leva a própria
-- história — apagar por desinstalação transformaria um clique em perda
-- irreversível de dado contábil.
--
-- O que sai é a **permissão**: sem ela, `recon.can_access()` devolve falso e a
-- RLS fecha a porta. O dado existe e ninguém o alcança.
-- =============================================================================

create or replace function core.uninstall_module(
  p_tenant_id uuid,
  p_module_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revogadas int;
begin
  if not core.has_permission(p_tenant_id, 'core.module.install') then
    raise exception 'desinstalar módulo exige a permissão core.module.install'
      using errcode = '42501';
  end if;

  update core.tenant_modules
     set status = 'uninstalled'
   where tenant_id = p_tenant_id
     and module_id = p_module_id;

  if not found then
    raise exception 'o tenant não tem o módulo % instalado', p_module_id
      using errcode = '22023';
  end if;

  -- Revoga em bloco pelo prefixo do módulo. É para isto que `module_id` existe
  -- em `role_permissions`.
  --
  -- ⚠️ `tenant_id is not null` no filtro: papel de sistema não se toca por
  -- desinstalação de um tenant. Sem essa linha, um tenant desinstalando um
  -- módulo revogaria a permissão de TODOS os outros.
  delete from core.role_permissions
   where tenant_id = p_tenant_id
     and module_id = p_module_id;

  get diagnostics v_revogadas = row_count;

  perform core.emit_event(
    p_tenant_id,
    'core.module.uninstalled',
    jsonb_build_object(
      'moduleId',             p_module_id,
      'permissionsRevoked',   v_revogadas,
      -- Dito no próprio evento, para quem for ler a trilha daqui a dois anos.
      'dataPreserved',        true
    )
  );
end;
$$;

comment on function core.uninstall_module(uuid, text) is
  'Desinstala um módulo: status uninstalled e revoga as permissões dele naquele tenant. NÃO apaga dado do módulo — corta o acesso, preserva a história.';

-- =============================================================================
-- 4. QUEM PODE CHAMAR
-- -----------------------------------------------------------------------------
-- As duas são concedidas a `authenticated` **de propósito**: é o painel do
-- cliente que instala, com a sessão do usuário. A checagem de permissão está
-- dentro da função, na primeira linha, e é ela que decide.
--
-- `core.emit_event` NÃO é concedida: ninguém emite evento à mão, nem o Core.
-- =============================================================================

grant execute on function core.install_module(uuid, text, text) to authenticated;
grant execute on function core.uninstall_module(uuid, text)     to authenticated;

-- =============================================================================
-- FIM. Nenhuma tabela nova. Nenhum INSERT. Nenhum segredo.
-- Nenhum dado de módulo tocado.
-- =============================================================================
