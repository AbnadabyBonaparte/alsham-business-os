-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0001_core.sql
-- O schema do Core. Fase 1 do ROADMAP-TECNICO-V1.
-- =============================================================================
--
-- NÃO APLICADO EM NENHUM PROJETO SUPABASE. Nenhum projeto foi criado, nenhum
-- segredo existe neste repositório. Aplicar em produção é ato do dono —
-- ver docs/runbook/APLICAR.md.
--
-- MAS PROVADO: este arquivo é aplicado de verdade, a cada push, num
-- PostgreSQL 17 limpo e efêmero (.github/workflows/db-verify.yml), seguido do
-- 0002, do seed e de um teste de isolamento com usuário real. Ele sobe.
--
-- Stack SELADA pelo dono em 27/07/2026: Linha A — Postgres/Supabase.
--
-- -----------------------------------------------------------------------------
-- AS TRÊS REGRAS INVIOLÁVEIS DESTE ARQUIVO
-- -----------------------------------------------------------------------------
--   1. `tenant_id` em toda tabela de dados de tenant.
--   2. RLS habilitada em TODAS as tabelas, com policy real. Nunca `USING (true)`
--      — lição paga P0 do suna-core, que nasceu com RLS aberta.
--   3. Nenhum dado semeado. Nem tenant de teste, nem papel de exemplo, nem
--      módulo fictício. Seed é ato de operação, não de migration.
--
-- -----------------------------------------------------------------------------
-- ORIGEM MINERADA (Lei do Reaproveitamento — nada aqui começou do zero)
-- -----------------------------------------------------------------------------
--   tenants · memberships · plan_limits  <- esqueleto kraken-v2      (PROVADO)
--   auditoria (audit_log)                <- padrão peritus           (PROVADO)
--   idempotência (processed_events)      <- casa-bonaparte + forensic(PROVADO)
--   outbox + reentrega                   <- casa-bonaparte pg_cron   (PROVADO)
--   RBAC (roles/role_permissions)        <- pedreira alsham-core, SÓ o schema
--   marketplace (module_registry)        <- cognitive-mirror-ai      (PROVADO
--                                           no schema; tabelas vazias hoje)
--
--   Sobre a pedreira: minerar o SCHEMA do alsham-core, JAMAIS reutilizar o
--   BANCO. Banco-mãe compartilhado entre sistemas é a lição paga nº 2.
--
-- -----------------------------------------------------------------------------
-- DECISÕES DE PROJETO QUE O REVISOR PRECISA CONFERIR
-- -----------------------------------------------------------------------------
--   a) Schema dedicado `core`, e não `public`. Segue a separação
--      public/private exemplar da casa-bonaparte. Consequência: as tabelas
--      NÃO ficam expostas via PostgREST por padrão — o acesso passa pela
--      camada de API, que é exatamente o que o Roadmap manda ("toda
--      comunicação ocorre através do Core").
--
--   b) DUAS tabelas não têm `tenant_id`, deliberadamente: `module_registry` e
--      `plan_limits`. Elas não são dados de tenant — são o catálogo da
--      plataforma, igual para todo mundo. Dar `tenant_id` a elas seria
--      duplicar dado canônico por tenant, o oposto do Sol Único. As duas
--      continuam com RLS ligada e policy real. Está sinalizado em cada uma.
--
--   c) Escrita no catálogo (`module_registry`, `plan_limits`) e nas tabelas de
--      encanamento (`event_outbox`, `processed_events`) não tem policy nenhuma
--      para `authenticated`. Sem policy, RLS nega. O acesso é por `service_role`,
--      a partir do servidor. É negação por ausência, e é intencional.
--
--   d) `audit_log` é append-only de verdade: além de não ter policy de UPDATE
--      ou DELETE, três triggers STATEMENT-LEVEL bloqueiam UPDATE, DELETE e
--      TRUNCATE — inclusive para o `service_role` e para superusuário, que
--      passam por cima da RLS mas não por cima de trigger.
--      ⚠️ Foram row-level até o apply real mostrar que `TRUNCATE` apagava a
--      trilha inteira em silêncio. Ver a nota no corpo do arquivo.
--
-- =============================================================================
create schema if not exists core;

comment on schema core is
  'Núcleo do ALSHAM Business OS: tenancy, RBAC, registro de módulos, auditoria e barramento de eventos. Nenhum módulo cria tabela aqui.';

-- Trigger genérico de `updated_at`.
create or replace function core.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Guarda de append-only para a trilha de auditoria.
create or replace function core.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'core.audit_log é append-only: % bloqueado. A trilha não se edita e não se apaga — corrigir um erro é escrever uma nova entrada.',
    tg_op;
end;
$$;

-- =============================================================================
-- 2. TENANTS
-- Minerado de: `workspaces` do kraken-v2 (PROVADO, em produção).
-- Complemento de schema: `organizations` da pedreira alsham-core.
-- -----------------------------------------------------------------------------
-- Esta tabela É o tenant: aqui o `tenant_id` chama-se `id`.
-- =============================================================================
create table core.tenants (
  id         uuid        primary key default gen_random_uuid(),
  slug       text        not null unique
             constraint tenants_slug_format
             check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  -- ⚠️ Lei anti-viés: preenchido em runtime pelo cliente. NUNCA literal em
  -- migration, seed, fixture ou teste deste repositório.
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'active'
             check (status in ('active', 'suspended', 'archived')),
  plan_code  text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tenants_status_idx on core.tenants (status);

create trigger tenants_touch
  before update on core.tenants
  for each row execute function core.touch_updated_at();

alter table core.tenants enable row level security;

alter table core.tenants force row level security;

-- Sem policy de INSERT/DELETE: criar e destruir tenant é ato de plataforma,
-- por `service_role`. Nenhum usuário se auto-provisiona.

-- =============================================================================
-- 3. MEMBERSHIPS
-- Minerado de: `workspace_members` + `invite_codes`/`invite_redemptions` do
-- kraken-v2 (PROVADO — o ciclo convite → resgate → membro já roda lá).
-- =============================================================================
create table core.memberships (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role_key   text        not null,
  status     text        not null default 'invited'
             check (status in ('invited', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Uma pessoa tem no máximo um vínculo por tenant. Papel é por tenant,
  -- nunca global.
  constraint memberships_unique_per_tenant unique (tenant_id, user_id)
);

create index memberships_user_idx   on core.memberships (user_id) where status = 'active';

create index memberships_tenant_idx on core.memberships (tenant_id, status);

create trigger memberships_touch
  before update on core.memberships
  for each row execute function core.touch_updated_at();

alter table core.memberships enable row level security;

alter table core.memberships force row level security;

-- =============================================================================
-- 4. ROLES
-- Minerado de: `user_roles` + `org_policies` da pedreira alsham-core (só o
-- schema), casados com o padrão de RLS do peritus/forensic (PROVADO).
-- -----------------------------------------------------------------------------
-- `tenant_id NULL` = papel de sistema, idêntico em todo tenant (owner, admin).
-- É a única exceção ao `tenant_id NOT NULL`, e é o oposto de um vazamento:
-- duplicar o papel `owner` em cada tenant é que quebraria o Sol Único.
-- =============================================================================
create table core.roles (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        references core.tenants (id) on delete cascade,
  key         text        not null
              constraint roles_key_format check (key ~ '^[a-z0-9][a-z0-9-]*$'),
  name        text        not null,
  description text        not null default '',
  is_system   boolean     not null generated always as (tenant_id is null) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- NULLS NOT DISTINCT (Postgres 15+): impede dois papéis de sistema com a
  -- mesma chave. Os 12 bancos do império são Postgres 17 (Balanço Supabase).
  constraint roles_unique_key unique nulls not distinct (tenant_id, key)
);

create trigger roles_touch
  before update on core.roles
  for each row execute function core.touch_updated_at();

alter table core.roles enable row level security;

alter table core.roles force row level security;

-- =============================================================================
-- 5. ROLE_PERMISSIONS
-- A concessão. `permission_key` é sempre `<module_id>.<recurso>.<ação>` — o
-- prefixo é o que permite revogar tudo de um módulo de uma vez quando o
-- tenant o desinstala.
-- =============================================================================
create table core.role_permissions (
  id             uuid        primary key default gen_random_uuid(),
  role_id        uuid        not null references core.roles (id) on delete cascade,
  -- Espelha `roles.tenant_id` para que a policy decida sem join extra.
  -- Mantido coerente pelo trigger abaixo, não pela boa vontade de quem grava.
  tenant_id      uuid        references core.tenants (id) on delete cascade,
  role_key       text        not null,
  permission_key text        not null
                 constraint role_permissions_key_format
                 check (permission_key ~ '^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$'),
  module_id      text        not null,
  granted_at     timestamptz not null default now(),
  constraint role_permissions_unique unique (role_id, permission_key)
);

create index role_permissions_lookup_idx
  on core.role_permissions (role_key, permission_key);

create index role_permissions_module_idx
  on core.role_permissions (module_id);

-- Garante que tenant_id/role_key nunca divirjam do papel de origem.
create or replace function core.sync_role_permission_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_key       text;
begin
  select r.tenant_id, r.key into v_tenant_id, v_key
    from core.roles r where r.id = new.role_id;

  if not found then
    raise exception 'core.roles % inexistente', new.role_id;
  end if;

  new.tenant_id := v_tenant_id;
  new.role_key  := v_key;
  return new;
end;
$$;

create trigger role_permissions_sync_scope
  before insert or update on core.role_permissions
  for each row execute function core.sync_role_permission_scope();

alter table core.role_permissions enable row level security;

alter table core.role_permissions force row level security;

-- Concessão não se edita: revoga e concede de novo. Sem policy de UPDATE.

-- =============================================================================
-- 6. MODULE_REGISTRY  — o catálogo da ALSHAM Store™
-- Minerado de: schema de marketplace do cognitive-mirror-ai (PROVADO no
-- schema; ⚠️ tabelas vazias hoje — Balanço Supabase §1 manda verificar antes
-- de ancorar a Store de Agentes nele).
-- -----------------------------------------------------------------------------
-- ⚠️ SEM `tenant_id` DE PROPÓSITO: é o catálogo da plataforma, igual para
-- todos. Duplicá-lo por tenant violaria o Sol Único.
-- ⚠️ SEM preço: o que o módulo É mora aqui; quanto custa é @alsham/billing,
-- na Etapa 2. Separar as duas coisas é o que permite preço por plano sem
-- reescrever o catálogo.
-- =============================================================================
create table core.module_registry (
  module_id     text        primary key
                constraint module_registry_id_format check (module_id ~ '^[a-z0-9][a-z0-9-]*$'),
  name          text        not null,
  version       text        not null,
  summary       text        not null,
  -- Referência à Taxonomia (Sol Único). A camada decide qual coluna vale.
  layer         text        not null check (layer in ('domain', 'vertical')),
  domain_key    text,
  vertical_key  text,
  -- Manifesto declarado pelo módulo. Espelha `ModuleManifest` de @alsham/core.
  capabilities  jsonb       not null default '[]'::jsonb,
  permissions   jsonb       not null default '[]'::jsonb,
  events_emits  jsonb       not null default '[]'::jsonb,
  events_consumes jsonb     not null default '[]'::jsonb,
  agents        jsonb       not null default '[]'::jsonb,
  -- A ÚNICA dependência que um módulo pode declarar. Não existe coluna de
  -- dependência entre módulos, e a ausência é a regra de arquitetura.
  requires_core text        not null,
  status        text        not null default 'draft'
                check (status in ('draft', 'published', 'deprecated')),
  registered_at timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint module_registry_layer_coherent check (
    (layer = 'domain'   and domain_key   is not null and vertical_key is null) or
    (layer = 'vertical' and vertical_key is not null and domain_key   is null)
  )
);

create index module_registry_published_idx
  on core.module_registry (layer, status) where status = 'published';

create trigger module_registry_touch
  before update on core.module_registry
  for each row execute function core.touch_updated_at();

alter table core.module_registry enable row level security;

alter table core.module_registry force row level security;

-- Sem policy de escrita: publicar módulo é ato de plataforma, por
-- `service_role`, a partir do servidor. RLS nega tudo o mais por ausência.

-- =============================================================================
-- 7. TENANT_MODULES — o "instalar" da Store
-- Minerado de: cadeia tenant→plano→limite→consumo do kraken-v2 (PROVADO).
-- É a linha que materializa a tese: o cliente monta o próprio sistema como
-- quem instala aplicativos.
-- =============================================================================
create table core.tenant_modules (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  module_id    text        not null references core.module_registry (module_id) on delete restrict,
  version      text        not null,
  status       text        not null default 'installing'
               check (status in ('installing', 'active', 'suspended', 'uninstalled')),
  -- ⚠️ AQUI VIVE A LEI ANTI-VIÉS. Requisito que não passa no teste "outra
  -- empresa do mesmo setor usaria isso exatamente como está?" não vira código
  -- no módulo: vira uma chave neste jsonb, ou serviço cobrado à parte.
  settings     jsonb       not null default '{}'::jsonb,
  installed_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint tenant_modules_unique unique (tenant_id, module_id)
);

create index tenant_modules_active_idx
  on core.tenant_modules (tenant_id) where status = 'active';

create trigger tenant_modules_touch
  before update on core.tenant_modules
  for each row execute function core.touch_updated_at();

alter table core.tenant_modules enable row level security;

alter table core.tenant_modules force row level security;

-- Sem policy de DELETE: desinstalar é mudar o status para 'uninstalled', não
-- apagar a linha. O histórico do que o tenant já teve instalado sobrevive.

-- =============================================================================
-- 8. PLAN_LIMITS
-- Minerado de: `plan_limits` (5 planos) + `usage_ledger` do kraken-v2
-- (PROVADO — 95+ lançamentos reais, economia unitária calculada).
-- -----------------------------------------------------------------------------
-- ⚠️ SEM `tenant_id` DE PROPÓSITO: é a definição do plano, não o consumo do
-- tenant. O consumo (`usage_ledger`) é da Etapa 2, junto com billing.
-- =============================================================================
create table core.plan_limits (
  plan_code   text        not null,
  metric      text        not null,
  -- NULL = ilimitado neste plano.
  limit_value bigint      check (limit_value is null or limit_value >= 0),
  on_exceed   text        not null default 'block'
              check (on_exceed in ('block', 'meter')),
  updated_at  timestamptz not null default now(),
  primary key (plan_code, metric)
);

create trigger plan_limits_touch
  before update on core.plan_limits
  for each row execute function core.touch_updated_at();

alter table core.plan_limits enable row level security;

alter table core.plan_limits force row level security;

-- Sem policy de escrita: definir plano é ato de plataforma (`service_role`).

-- =============================================================================
-- 9. AUDIT_LOG
-- Minerado de: `audit_log` + `timeline` do peritus (PROVADO — 11 tabelas
-- limpas com dados reais; a régua de auditoria do império).
-- -----------------------------------------------------------------------------
-- Append-only de verdade: sem policy de UPDATE/DELETE **e** com trigger que
-- bloqueia as duas — inclusive para `service_role`, que passaria por cima da
-- RLS.
-- ⚠️ NUNCA gravar segredo em `before`/`after`. Senha, token e chave são
-- redigidos antes de chegar aqui.
-- =============================================================================
create table core.audit_log (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete restrict,
  actor_kind      text        not null check (actor_kind in ('user', 'agent', 'system')),
  actor_user_id   uuid        references auth.users (id) on delete set null,
  actor_agent_key text,
  actor_process   text,
  action          text        not null,
  resource_type   text        not null,
  -- Solto de propósito: a trilha sobrevive ao apagamento do recurso.
  resource_id     text,
  -- NULL = a entrada é do próprio Core.
  module_id       text,
  occurred_at     timestamptz not null default now(),
  before_state    jsonb,
  after_state     jsonb,
  ip              inet,
  user_agent      text,
  constraint audit_log_actor_coherent check (
    (actor_kind = 'user'   and actor_user_id   is not null) or
    (actor_kind = 'agent'  and actor_agent_key is not null) or
    (actor_kind = 'system' and actor_process   is not null)
  )
);

create index audit_log_tenant_time_idx
  on core.audit_log (tenant_id, occurred_at desc);

create index audit_log_resource_idx
  on core.audit_log (tenant_id, resource_type, resource_id);

-- Os três guardas do append-only. São FOR EACH STATEMENT, não FOR EACH ROW, e
-- a diferença foi paga em susto:
--
--   · row-level não dispara em tabela vazia — um `delete from core.audit_log`
--     numa trilha ainda sem linhas devolvia "DELETE 0", dando a impressão de
--     que o guarda não existia;
--   · row-level NUNCA vê `TRUNCATE`. E `truncate core.audit_log` apagava a
--     trilha inteira, em silêncio, sem erro nenhum. Foi o apply real que
--     mostrou; o parser não tinha como.
--
-- Statement-level fecha os dois casos, e vale inclusive para o `service_role`
-- e para superusuário, que passam por cima da RLS mas não por cima de trigger.
create trigger audit_log_no_update
  before update on core.audit_log
  for each statement execute function core.reject_mutation();

create trigger audit_log_no_delete
  before delete on core.audit_log
  for each statement execute function core.reject_mutation();

create trigger audit_log_no_truncate
  before truncate on core.audit_log
  for each statement execute function core.reject_mutation();

alter table core.audit_log enable row level security;

alter table core.audit_log force row level security;

-- Sem policy de INSERT: quem escreve a trilha é a plataforma (`service_role`).
-- Ator nenhum escreve a própria auditoria.

-- =============================================================================
-- 10. EVENT_OUTBOX — a caixa de saída
-- Minerado de: pg_cron + pg_net com job de reentrega por minuto do
-- casa-bonaparte-saas, e o pipeline de jobs com estados do kraken-v2
-- (PROVADO nos dois).
-- -----------------------------------------------------------------------------
-- O evento é gravado na MESMA transação do dado que ele descreve, e entregue
-- depois. É o que impede o modo de falha clássico: o dado gravou e o evento
-- não saiu, ou o evento saiu e o dado não gravou.
-- `dead` não é descarte — a linha fica, com o erro, para conferência humana.
-- =============================================================================
create table core.event_outbox (
  event_id        uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  event_type      text        not null
                  constraint event_outbox_type_format
                  check (event_type ~ '^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$'),
  event_version   integer     not null default 1 check (event_version >= 1),
  produced_by     text        not null,
  occurred_at     timestamptz not null default now(),
  correlation_id  uuid,
  causation_id    uuid,
  payload         jsonb       not null default '{}'::jsonb,
  status          text        not null default 'pending'
                  check (status in ('pending', 'delivered', 'failed', 'dead')),
  attempts        integer     not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);

-- Índice do trabalho da fila: só o que ainda tem que sair.
create index event_outbox_due_idx
  on core.event_outbox (next_attempt_at)
  where status in ('pending', 'failed');

create index event_outbox_tenant_idx
  on core.event_outbox (tenant_id, occurred_at desc);

alter table core.event_outbox enable row level security;

alter table core.event_outbox force row level security;

-- Nenhuma policy, de propósito: RLS nega tudo para `authenticated`. A caixa
-- de saída é encanamento — só o `service_role` a toca.

-- =============================================================================
-- 11. PROCESSED_EVENTS — a idempotência
-- Minerado de: `private.eventos_processados` da casa-bonaparte + `stripe_events`
-- do alsham-forensic-ai (PROVADO ponta a ponta em 24/07 — foi esta tabela que
-- segurou uma falha real).
-- -----------------------------------------------------------------------------
-- A PK composta é o contrato: o mesmo evento pode e deve ser processado uma
-- vez POR CONSUMIDOR. O consumidor grava aqui ANTES de agir; se o mesmo
-- event_id voltar (reentrega, retry, replay), o insert falha e ele desiste.
-- =============================================================================
create table core.processed_events (
  event_id     uuid        not null,
  consumer     text        not null,
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  processed_at timestamptz not null default now(),
  primary key (event_id, consumer)
);

create index processed_events_tenant_idx
  on core.processed_events (tenant_id, processed_at desc);

alter table core.processed_events enable row level security;

alter table core.processed_events force row level security;

-- ============================================================================
-- FUNÇÕES DE AUTORIZAÇÃO
-- ----------------------------------------------------------------------------
-- Definidas DEPOIS das tabelas, não antes — e essa ordem foi ensinada pelo
-- apply real, não pelo parser. Função `language sql` tem o corpo VALIDADO no
-- momento da criação: declarada no topo do arquivo, `core.is_tenant_member`
-- falhava com "relation core.memberships does not exist". O parser de sintaxe
-- aprova; o Postgres recusa.
--
-- São SECURITY DEFINER de propósito: precisam ler `core.memberships` sem
-- disparar a RLS da própria `core.memberships`, que causaria recursão infinita
-- na policy. `search_path` fixo para que a função não possa ser sequestrada
-- por um schema plantado na frente.
-- ============================================================================

-- 1. FUNÇÕES DE AUTORIZAÇÃO
-- -----------------------------------------------------------------------------
-- São SECURITY DEFINER de propósito: precisam ler `core.memberships` sem
-- disparar a RLS da própria `core.memberships`, que é o que causaria recursão
-- infinita na policy. `search_path` fixo para que a função não possa ser
-- sequestrada por um schema plantado na frente.
create or replace function core.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from core.memberships m
     where m.tenant_id = p_tenant_id
       and m.user_id   = (select auth.uid())
       and m.status    = 'active'
  );
$$;

comment on function core.is_tenant_member(uuid) is
  'O usuário autenticado é membro ATIVO deste tenant? Base de toda policy de leitura.';

create or replace function core.has_permission(
  p_tenant_id  uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from core.memberships    m
      join core.role_permissions rp
        on rp.role_key = m.role_key
       and (rp.tenant_id is null or rp.tenant_id = m.tenant_id)
     where m.tenant_id      = p_tenant_id
       and m.user_id        = (select auth.uid())
       and m.status         = 'active'
       and rp.permission_key = p_permission
  );
$$;

comment on function core.has_permission(uuid, text) is
  'O usuário autenticado tem esta permissão NESTE tenant? RLS no banco nunca substitui autorização na aplicação — as duas camadas coexistem.';

-- ============================================================================
-- AS POLICIES
-- ----------------------------------------------------------------------------
-- Todas juntas, e depois das funções de autorização, porque toda policy aqui
-- chama uma delas. Nenhuma é `USING (true)`: a lição paga P0 do suna-core foi
-- exatamente um banco que nasceu com RLS aberta.
-- ============================================================================

create policy tenants_select_member on core.tenants
  for select to authenticated
  using (core.is_tenant_member(id));

create policy tenants_update_admin on core.tenants
  for update to authenticated
  using      (core.has_permission(id, 'core.tenant.manage'))
  with check (core.has_permission(id, 'core.tenant.manage'));

-- Vejo os meus vínculos, e vejo os colegas dos tenants em que estou.
create policy memberships_select_self_or_member on core.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or core.is_tenant_member(tenant_id)
  );

create policy memberships_insert_manager on core.memberships
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'core.membership.manage'));

create policy memberships_update_manager on core.memberships
  for update to authenticated
  using      (core.has_permission(tenant_id, 'core.membership.manage'))
  with check (core.has_permission(tenant_id, 'core.membership.manage'));

create policy memberships_delete_manager on core.memberships
  for delete to authenticated
  using (core.has_permission(tenant_id, 'core.membership.manage'));

-- Papel de sistema é legível por qualquer autenticado (é o vocabulário comum
-- da plataforma); papel de tenant, só por quem é membro dele.
create policy roles_select_system_or_member on core.roles
  for select to authenticated
  using (
    tenant_id is null
    or core.is_tenant_member(tenant_id)
  );

-- Tenant só mexe nos papéis que ele mesmo criou. Papel de sistema é
-- imutável para o cliente: `tenant_id is not null` é parte da condição.
create policy roles_insert_manager on core.roles
  for insert to authenticated
  with check (
    tenant_id is not null
    and core.has_permission(tenant_id, 'core.role.manage')
  );

create policy roles_update_manager on core.roles
  for update to authenticated
  using (
    tenant_id is not null
    and core.has_permission(tenant_id, 'core.role.manage')
  )
  with check (
    tenant_id is not null
    and core.has_permission(tenant_id, 'core.role.manage')
  );

create policy roles_delete_manager on core.roles
  for delete to authenticated
  using (
    tenant_id is not null
    and core.has_permission(tenant_id, 'core.role.manage')
  );

create policy role_permissions_select_system_or_member on core.role_permissions
  for select to authenticated
  using (
    tenant_id is null
    or core.is_tenant_member(tenant_id)
  );

create policy role_permissions_insert_manager on core.role_permissions
  for insert to authenticated
  with check (
    tenant_id is not null
    and core.has_permission(tenant_id, 'core.role.manage')
  );

create policy role_permissions_delete_manager on core.role_permissions
  for delete to authenticated
  using (
    tenant_id is not null
    and core.has_permission(tenant_id, 'core.role.manage')
  );

-- A vitrine mostra o que está publicado — e só isso. Rascunho e depreciado
-- não vazam. Não é `USING (true)`: `draft` fica invisível.
create policy module_registry_select_published on core.module_registry
  for select to authenticated
  using (status = 'published');

create policy tenant_modules_select_member on core.tenant_modules
  for select to authenticated
  using (core.is_tenant_member(tenant_id));

create policy tenant_modules_insert_manager on core.tenant_modules
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'core.module.install'));

create policy tenant_modules_update_manager on core.tenant_modules
  for update to authenticated
  using      (core.has_permission(tenant_id, 'core.module.install'))
  with check (core.has_permission(tenant_id, 'core.module.install'));

-- Não é `USING (true)`: o usuário enxerga os limites dos planos dos tenants
-- de que participa, e nada além. A tabela de preços pública, se existir, é
-- servida pelo servidor, não por esta policy.
create policy plan_limits_select_own_plan on core.plan_limits
  for select to authenticated
  using (
    exists (
      select 1
        from core.tenants t
       where t.plan_code = plan_limits.plan_code
         and core.is_tenant_member(t.id)
    )
  );

-- Ler a trilha é privilégio, não default de membro.
create policy audit_log_select_auditor on core.audit_log
  for select to authenticated
  using (core.has_permission(tenant_id, 'core.audit.read'));

-- Nenhuma policy, de propósito: encanamento, só `service_role`.

-- =============================================================================
-- 12. FECHAMENTO DE PRIVILÉGIOS
-- RLS decide linha a linha; GRANT decide se a porta existe. As duas coisas.
-- =============================================================================
revoke all on schema core           from public, anon, authenticated;

revoke all on all tables    in schema core from public, anon, authenticated;

revoke all on all functions in schema core from public, anon, authenticated;

grant usage on schema core to authenticated;

grant select, update                 on core.tenants          to authenticated;

grant select, insert, update, delete on core.memberships      to authenticated;

grant select, insert, update, delete on core.roles            to authenticated;

grant select, insert,         delete on core.role_permissions to authenticated;

grant select                         on core.module_registry  to authenticated;

grant select, insert, update         on core.tenant_modules   to authenticated;

grant select                         on core.plan_limits      to authenticated;

grant select                         on core.audit_log        to authenticated;

grant execute on function core.is_tenant_member(uuid)     to authenticated;

grant execute on function core.has_permission(uuid, text) to authenticated;
-- `anon` não recebe nada. Ninguém lê o Core sem estar autenticado.
-- `core.event_outbox` e `core.processed_events` não aparecem acima: são
-- inacessíveis a `authenticated` por GRANT **e** por RLS.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum dado semeado. Nenhum segredo.
-- =============================================================================
