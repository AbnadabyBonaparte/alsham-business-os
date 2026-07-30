-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0052_pol.sql
-- Módulo 37: Políticas. Schema `pol`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §21,
-- depois do `0051_...sql` (a peça anterior da Missão Oito). Vigésima
-- primeira peça da Missão Oito (Onda 5 — o BLOCO DE PESSOAS).
--
-- Taxonomia: Domain 👥 RH — capacidade *Políticas* (a política interna de
-- pessoal que o membro dá ciência). Spec: docs/canon/MODULO-POL-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O DIVERGE — a razão de existir deste módulo, não uma cópia do comm
-- -----------------------------------------------------------------------------
-- comm: publicar congela; a ciência é ÚNICA e ETERNA por DOCUMENTO. pol
-- DIVERGE: política tem VERSÃO — a ciência é por (política, VERSÃO).
-- Publicar uma versão nova exige que quem deu ciência da anterior dê
-- ciência DE NOVO. É isto que o torna diferente do comm, não uma cópia.
--
-- Onde a física é a MESMA do comm: publicar CONGELA o corpo (aqui, o corpo
-- da VERSÃO); a ciência é ato PRÓPRIO (o gatilho força auth.uid()), forjada
-- pelo servidor, e IMUTÁVEL em 3 camadas; arquivado é TERMINAL.
--
-- Onde a física DIVERGE: a unicidade da ciência não é (documento, membro) —
-- é (VERSÃO, membro). Cada versão nova nasce sem ciência nenhuma, mesmo
-- que a versão anterior da MESMA política já tivesse 100% de cobertura. A
-- identidade do que se dá ciência é a versão, não a política.
--
-- -----------------------------------------------------------------------------
-- ⚠️ O HOMÔNIMO — declarado, como o comm declarou Condomínios
-- -----------------------------------------------------------------------------
-- A *Políticas* de GRC (compliance corporativo — políticas antifraude,
-- políticas de risco, matriz de conformidade) é o homônimo declarado; aqui
-- é a política INTERNA DE PESSOAL que o membro dá ciência (código de
-- conduta, política de home office, política de uso de equipamento). Sol
-- Único: o recorte fica escrito, como o comm fez com Condomínios.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o corpo da versão em texto — e PUBLICAR exige corpo (política
--      sem corpo não vale; o rascunho pode nascer vazio).
--   ✅ ENTRA a numeração de versão CALCULADA pelo servidor — nunca digitada
--      (o tenant não escolhe o próprio número de versão; o livro escolhe).
--   ❌ NÃO ENTRA distribuição/e-mail (integração declarada — Lei 3),
--      assinatura eletrônica com validade jurídica (matéria jurídica à
--      parte, não se constrói por atalho), anexos (Storage do Core, não
--      construído), aprovação em fluxo (o `ops` resolve esteira — este
--      módulo não redesenha aprovação).
-- =============================================================================

create schema if not exists pol;

comment on schema pol is
  'Módulo Políticas. Domain hr da Taxonomia (RH). DIVERGE do comm: política tem VERSÃO — a ciência é por (política, versão), não por documento; versão nova exige ciência de novo. Publicar congela o corpo da versão; a ciência é ato próprio, único por versão e eterna; archived é terminal. Homônimo declarado: a Políticas de GRC é matéria distinta. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima sétima vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function pol.emit_event(
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
  if p_event_type not like 'pol.%' then
    raise exception 'pol.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'pol',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function pol.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function pol.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'pol.policy.manage')
      or core.has_permission(p_tenant_id, 'pol.policy.ack');
$$;

create or replace function pol.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 2. POLICIES — a política em si (o título vive aqui; o corpo vive na versão)
-- =============================================================================

create table pol.policies (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint pol_policies_id_tenant unique (id, tenant_id)
);

create index pol_policies_roster_idx
  on pol.policies (tenant_id, status, name);

create trigger pol_policies_touch
  before update on pol.policies
  for each row execute function pol.touch_updated_at();

alter table pol.policies enable row level security;
alter table pol.policies force row level security;

create policy pol_policies_select on pol.policies
  for select to authenticated
  using (pol.can_access(tenant_id));

create policy pol_policies_insert on pol.policies
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pol.policy.manage'));

create policy pol_policies_update on pol.policies
  for update to authenticated
  using (core.has_permission(tenant_id, 'pol.policy.manage'))
  with check (core.has_permission(tenant_id, 'pol.policy.manage'));

-- ⛔ Sem policy / grant de DELETE. Política arquivada é história.

create or replace function pol.guard_policy_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger pol_policies_stamp
  before insert on pol.policies
  for each row execute function pol.guard_policy_insert();

-- =============================================================================
-- 3. VERSIONS — ⭐ a identidade do que se dá ciência é a VERSÃO
-- =============================================================================

create table pol.versions (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  policy_id    uuid        not null,
  -- ⭐ Calculado pelo servidor (guard_version_insert) — nunca digitado.
  version_no   integer     not null check (version_no > 0),
  body         text        not null default '',
  status       text        not null default 'draft'
               check (status in ('draft', 'published', 'archived')),
  -- ⭐ O ATO de publicar: quem e quando — do servidor.
  published_at timestamptz,
  published_by uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint pol_versions_id_tenant unique (id, tenant_id),
  constraint pol_versions_policy_fk
    foreign key (policy_id, tenant_id)
    references pol.policies (id, tenant_id) on delete restrict,
  -- Uma política não tem dois "número 3": a numeração é por política.
  constraint pol_versions_policy_no_unique unique (policy_id, version_no),
  -- Publicado (e arquivado) tem carimbo; rascunho não tem.
  constraint pol_versions_publish_coherent check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'archived') and published_at is not null)
  )
);

create index pol_versions_policy_idx
  on pol.versions (tenant_id, policy_id, version_no desc);

create trigger pol_versions_touch
  before update on pol.versions
  for each row execute function pol.touch_updated_at();

alter table pol.versions enable row level security;
alter table pol.versions force row level security;

create policy pol_versions_select on pol.versions
  for select to authenticated
  using (pol.can_access(tenant_id));

create policy pol_versions_insert on pol.versions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pol.policy.manage'));

create policy pol_versions_update on pol.versions
  for update to authenticated
  using (core.has_permission(tenant_id, 'pol.policy.manage'))
  with check (core.has_permission(tenant_id, 'pol.policy.manage'));

-- ⛔ Sem policy / grant de DELETE. Versão publicada é fato consumado.

-- -----------------------------------------------------------------------------
-- 3.1 O nascimento: sempre rascunho, e o NÚMERO é do servidor — nunca do tenant
-- -----------------------------------------------------------------------------

create or replace function pol.guard_version_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
begin
  if new.status <> 'draft' then
    raise exception 'a versão nasce no rascunho — publicar é dar a palavra, e é decisão à parte'
      using errcode = '22023';
  end if;

  -- ⭐ O número de versão é CALCULADO pelo servidor — ignora qualquer
  -- valor enviado pela tela. O tenant não escolhe o próprio número.
  select max(version_no) into v_max
    from pol.versions
   where policy_id = new.policy_id and tenant_id = new.tenant_id;

  new.version_no := coalesce(v_max, 0) + 1;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger pol_versions_stamp
  before insert on pol.versions
  for each row execute function pol.guard_version_insert();

-- -----------------------------------------------------------------------------
-- 3.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/policies
-- -----------------------------------------------------------------------------

create or replace function pol.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft',     'published'),
    ('published', 'archived')
  );
$$;

comment on function pol.allowed_transition(text, text) is
  'Ciclo de vida da versão. Espelho de ALLOWED_TRANSITIONS em @alsham/policies. DOIS pares: publicar congela o corpo; arquivar é TERMINAL — a política volta com versão NOVA, nunca reabrindo a antiga.';

create or replace function pol.guard_version_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- ⭐ Publicado (e arquivado) CONGELA: o corpo e o número não mudam.
    if old.status <> 'draft'
       and (new.body is distinct from old.body
            or new.version_no is distinct from old.version_no
            or new.policy_id is distinct from old.policy_id) then
      raise exception 'a versão publicada não se edita: corrigir é publicar versão nova'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not pol.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: o arquivado é terminal — a política volta com versão nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'published' then
    if not core.has_permission(new.tenant_id, 'pol.policy.manage') then
      raise exception 'publicar uma versão exige a permissão pol.policy.manage'
        using errcode = '42501';
    end if;
    if length(btrim(new.body)) = 0 then
      raise exception 'política sem corpo não vale: escreva antes de publicar'
        using errcode = '22023';
    end if;
    new.published_at := now();
    new.published_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger pol_versions_guard_status
  before update on pol.versions
  for each row execute function pol.guard_version_transition();

-- =============================================================================
-- 4. ACKNOWLEDGEMENTS — ⭐⭐ a ciência é POR VERSÃO, o coração do DIVERGE
-- =============================================================================

create table pol.acknowledgements (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  version_id uuid        not null,
  user_id    uuid        not null,
  acked_at   timestamptz not null default now(),
  constraint pol_acks_version_fk
    foreign key (version_id, tenant_id)
    references pol.versions (id, tenant_id)
    on delete restrict,
  -- A ciência prende o membro à história: membro com ciências não se apaga.
  constraint pol_acks_member_fk
    foreign key (tenant_id, user_id)
    references core.memberships (tenant_id, user_id)
    on delete restrict,
  -- ⭐⭐ POR VERSÃO — não por política. É esta linha, e só esta, que faz uma
  -- versão nova exigir ciência de novo, mesmo da mesma pessoa.
  constraint pol_acks_once_per_version unique (version_id, user_id)
);

create index pol_acks_idx
  on pol.acknowledgements (tenant_id, version_id);

alter table pol.acknowledgements enable row level security;
alter table pol.acknowledgements force row level security;

create policy pol_acks_select on pol.acknowledgements
  for select to authenticated
  using (pol.can_access(tenant_id));

create policy pol_acks_insert on pol.acknowledgements
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pol.policy.ack'));

create or replace function pol.guard_ack_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from pol.versions
   where id = new.version_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'a versão não existe neste tenant' using errcode = '22023';
  end if;

  if v_status = 'draft' then
    raise exception 'a versão ainda não foi publicada: não há o que acusar de ciência'
      using errcode = '22023';
  end if;
  if v_status = 'archived' then
    raise exception 'versão fora de circulação não recebe ciência nova: dê ciência da versão vigente'
      using errcode = '22023';
  end if;

  -- ⭐ A ciência é PRÓPRIA: o gatilho força quem assina — não se dá
  -- ciência por outro, nem mandando outro user_id no INSERT.
  new.user_id  := (select auth.uid());
  new.acked_at := now();

  return new;
end;
$$;

create trigger pol_acks_stamp
  before insert on pol.acknowledgements
  for each row execute function pol.guard_ack_insert();

create or replace function pol.guard_acks_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a ciência é registro de fato consumado: o que foi dado ciência foi — não se edita nem se retira.'
    using errcode = '42501';
end;
$$;

create trigger pol_acks_immutable
  before update or delete on pol.acknowledgements
  for each row execute function pol.guard_acks_immutable();

-- =============================================================================
-- 5. OS FATOS — o envelope leva o nome da política e o número da versão
-- =============================================================================

create or replace function pol.version_payload(p pol.versions)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select name into v_name from pol.policies where id = p.policy_id and tenant_id = p.tenant_id;

  -- ⚠️ SEM o corpo — de propósito: o envelope entrega o fato, não a
  -- política inteira (payload leve; quem quiser o texto lê no módulo,
  -- sob RLS).
  return jsonb_build_object(
    'versionId',   p.id,
    'policyId',    p.policy_id,
    'policyName',  v_name,
    'versionNo',   p.version_no,
    'status',      p.status,
    'publishedAt', p.published_at
  );
end;
$$;

comment on function pol.version_payload(pol.versions) is
  'O envelope de uma versão de política — AUTOSSUFICIENTE e SEM o corpo: o envelope entrega o fato, não a política inteira.';

create or replace function pol.on_version_drafted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pol.emit_event(new.tenant_id, 'pol.version.drafted', pol.version_payload(new));
  return new;
end;
$$;

create trigger pol_versions_emit_drafted
  after insert on pol.versions
  for each row execute function pol.on_version_drafted();

create or replace function pol.on_version_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform pol.emit_event(
      new.tenant_id,
      case when new.status = 'published' then 'pol.version.published'
           else 'pol.version.archived' end,
      pol.version_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger pol_versions_emit_changed
  after update on pol.versions
  for each row execute function pol.on_version_changed();

create or replace function pol.on_ack_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_no int;
  v_policy_name text;
begin
  select v.version_no, p.name into v_version_no, v_policy_name
    from pol.versions v
    join pol.policies p on p.id = v.policy_id and p.tenant_id = v.tenant_id
   where v.id = new.version_id and v.tenant_id = new.tenant_id;

  perform pol.emit_event(new.tenant_id, 'pol.version.acknowledged', jsonb_build_object(
    'versionId',  new.version_id,
    'policyName', v_policy_name,
    'versionNo',  v_version_no,
    'memberId',   new.user_id,
    'ackedAt',    new.acked_at
  ));
  return new;
end;
$$;

create trigger pol_acks_emit
  after insert on pol.acknowledgements
  for each row execute function pol.on_ack_recorded();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema pol                  from public, anon, authenticated;
revoke all on all tables    in schema pol from public, anon, authenticated;
revoke all on all functions in schema pol from public, anon, authenticated;

grant usage on schema pol to authenticated;

grant select, insert, update on pol.policies to authenticated;
grant select, insert, update on pol.versions  to authenticated;

-- ⭐ SÓ INSERT+SELECT: a ciência não se retira.
grant select, insert on pol.acknowledgements to authenticated;

grant execute on function pol.can_access(uuid) to authenticated;

-- `pol.emit_event` NÃO é concedida. `pol.version_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma distribuição. Nenhuma assinatura eletrônica.
-- Nenhum anexo. Nenhuma ciência por procuração. Nenhum objeto fora de `pol`.
-- Nenhuma leitura de schema alheio. `consumes` VAZIO — nenhum handler de
-- Políticas nesta onda (Lei 7).
-- =============================================================================
