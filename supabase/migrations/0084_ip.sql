-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0084_ip.sql
-- Módulo 69: Propriedade Intelectual. Schema `ip`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §29, o
-- segundo (e último) módulo da Onda Dezesseis (Fase 2 — o Domain 🔬 Pesquisa &
-- Desenvolvimento). Nasce sob `domain_key='rnd'`.
--
-- Taxonomia: Domain 🔬 Pesquisa & Desenvolvimento (§5) — capacidades
-- *Propriedade intelectual* e *Patentes*.
-- Spec: docs/canon/MODULO-IP-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CANON — DUAS CAPACIDADES, UM MÓDULO, COM O TIPO NUM CHECK
-- -----------------------------------------------------------------------------
-- *Propriedade intelectual* e *Patentes* são a MESMA coisa: uma patente é UM
-- TIPO de propriedade intelectual, ao lado da marca, do direito autoral e do
-- segredo industrial. Construir "Patentes" como módulo à parte seria criar uma
-- gaveta para uma das quatro categorias e deixar as outras três sem lar. Um
-- módulo só: `ip.assets`, com o `asset_type` num CHECK das quatro categorias
-- clássicas do direito de PI — física do método, não vocabulário do tenant (a
-- mesma disciplina do `capa` corrective/preventive e do `esg` carbon/water/...).
--
--   `patent`       — patente (invenção)
--   `trademark`    — marca
--   `copyright`    — direito autoral
--   `trade_secret` — segredo industrial
--
-- -----------------------------------------------------------------------------
-- ⭐ O CICLO DE VIDA — TERMINAL, SEM REABERTURA (a física do proj/nc)
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- ciclo foi re-perguntado contra os precedentes terminais:
--
--   `filed`   → depositado/registrado (o nascimento).
--   `granted` → concedido (a autoridade deferiu). NÃO é terminal: um direito
--               concedido vive até expirar.
--   `rejected`→ indeferido. TERMINAL.
--   `expired` → expirado (só a partir de `granted`). TERMINAL.
--
-- Transições: filed→granted, filed→rejected, granted→expired. ⭐⭐ NÃO HÁ
-- REABERTURA: um pedido indeferido ou um direito expirado que "volta" é um
-- depósito NOVO, com número novo e data nova — a física do `proj`/`nc` (encerrado
-- é história), o DIVERGE do `iso` (cuja conformidade é mutável) e do `idea`
-- (cujo `archived` reverte). Um direito de PI tem prazo legal; fingir que um
-- expirado reabre seria mentir sobre a proteção que a empresa realmente tem.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA `title` em TEXTO LIVRE; o `asset_type` (CHECK); o número de
--      registro em TEXTO LIVRE e OPCIONAL (cada órgão numera à sua maneira; nem
--      todo ativo tem número — o segredo industrial não se registra); a data de
--      depósito (`filed_on`, opcional); a nota TEXTO LIVRE; e a ORIGEM por ID
--      SOLTO (`source_id` + `source_name` carimbado — de qual `idea` ou `proj`
--      essa PI nasceu, se nasceu de algo rastreável).
--   ❌ NÃO ENTRA cálculo de prazo/anuidade, jurisdição/país como enum,
--      classificação de Nice/IPC, gestão de honorários de agente — cada um é o
--      processo jurídico de uma casa (config do tenant ou integração). `consumes`
--      VAZIO.
--
-- 🔴 A origem é ID SOLTO — SEM FK cruzada, SEM ler os schemas `idea`/`proj`. A
-- Lei do Lego. Não há referência a schema alheio em lugar nenhum deste arquivo.
-- =============================================================================

create schema if not exists ip;

comment on schema ip is
  'Módulo Propriedade Intelectual. Domain rnd (Pesquisa & Desenvolvimento) da Taxonomia. Duas capacidades, um módulo: PI e Patentes, com o tipo (patent/trademark/copyright/trade_secret) num CHECK — física do direito, não vocabulário do tenant. Ciclo TERMINAL sem reabertura: filed → granted/rejected, granted → expired (a física do proj/nc; o indeferido/expirado que volta é depósito novo). A origem (idea/proj) é ID SOLTO. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- =============================================================================

create or replace function ip.emit_event(
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
  if p_event_type not like 'ip.%' then
    raise exception 'ip.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'ip',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function ip.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado.';

create or replace function ip.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'ip.asset.manage');
$$;

create or replace function ip.touch_updated_at()
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
-- 2. ASSETS — o ativo de PI
-- =============================================================================

create table ip.assets (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  title               text        not null check (length(btrim(title)) > 0),
  -- ⭐ O tipo — CHECK das quatro categorias clássicas do direito de PI.
  asset_type          text        not null
                        check (asset_type in ('patent', 'trademark', 'copyright', 'trade_secret')),
  -- Número de registro: TEXTO LIVRE e OPCIONAL (nem todo ativo tem — o segredo
  -- industrial não se registra).
  registration_number text        not null default '',
  -- A data de depósito: OPCIONAL.
  filed_on            date,
  -- ⭐ O ciclo TERMINAL: filed → granted/rejected, granted → expired.
  status              text        not null default 'filed'
                        check (status in ('filed', 'granted', 'rejected', 'expired')),
  note                text        not null default '',
  -- ⭐ A ORIGEM por ID SOLTO — de qual idea/proj nasceu, se nasceu. Sem FK.
  source_id           uuid,
  source_name         text        not null default '',
  granted_at          timestamptz,
  granted_by          uuid        references auth.users (id) on delete set null,
  closed_at           timestamptz,
  closed_by           uuid        references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint ip_assets_id_tenant unique (id, tenant_id),
  -- ⭐ Coerência dos carimbos com o estado:
  -- concedido (e o expirado que veio dele) têm granted_at;
  -- os terminais (rejected/expired) têm closed_at.
  constraint ip_assets_granted_coherent check (
    (status in ('granted', 'expired')) = (granted_at is not null)
  ),
  constraint ip_assets_close_coherent check (
    (status in ('rejected', 'expired')) = (closed_at is not null)
  )
);

create index ip_assets_by_type_idx
  on ip.assets (tenant_id, asset_type, created_at desc);
create index ip_assets_live_idx
  on ip.assets (tenant_id, created_at desc)
  where status in ('filed', 'granted');

create trigger ip_assets_touch
  before update on ip.assets
  for each row execute function ip.touch_updated_at();

alter table ip.assets enable row level security;
alter table ip.assets force row level security;

create policy ip_assets_select on ip.assets
  for select to authenticated
  using (ip.can_access(tenant_id));

create policy ip_assets_insert on ip.assets
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'ip.asset.manage'));

create policy ip_assets_update on ip.assets
  for update to authenticated
  using (core.has_permission(tenant_id, 'ip.asset.manage'))
  with check (core.has_permission(tenant_id, 'ip.asset.manage'));

-- ⛔ Sem DELETE: um ativo de PI é história (mesmo indeferido/expirado).

-- -----------------------------------------------------------------------------
-- 2.1 Nascimento: sempre `filed`, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function ip.guard_asset_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'filed' then
    raise exception 'o ativo de PI nasce depositado (filed) — conceder/indeferir/expirar são decisões à parte'
      using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger ip_assets_stamp
  before insert on ip.assets
  for each row execute function ip.guard_asset_insert();

-- -----------------------------------------------------------------------------
-- 2.2 O ciclo de vida — espelho de ALLOWED_TRANSITIONS em @alsham/ip
-- -----------------------------------------------------------------------------

create or replace function ip.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('filed',   'granted'),
    ('filed',   'rejected'),
    ('granted', 'expired')
  );
$$;

comment on function ip.allowed_transition(text, text) is
  'Ciclo de vida do ativo de PI. Espelho de ALLOWED_TRANSITIONS em @alsham/ip. rejected e expired são TERMINAIS e NÃO REABREM: o indeferido/expirado que volta é depósito novo (a física do proj/nc, o DIVERGE do iso mutável e do idea que reverte).';

create or replace function ip.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not ip.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da PI: indeferido/expirado não reabre',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'ip.asset.manage') then
    raise exception 'mover o ativo de PI exige a permissão ip.asset.manage'
      using errcode = '42501';
  end if;

  -- Conceder: carimba quem/quando.
  if new.status = 'granted' then
    new.granted_at := now();
    new.granted_by := (select auth.uid());
  end if;

  -- Indeferir/expirar: carimba o fechamento (terminal).
  if new.status in ('rejected', 'expired') then
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger ip_assets_guard_status
  before update of status on ip.assets
  for each row execute function ip.guard_status_transition();

-- ⭐ A identidade CONGELA quando o ativo sai do depósito: título e tipo não
-- mudam depois que a autoridade agiu (granted/rejected/expired). Editar em
-- `filed` é livre.
create or replace function ip.guard_identity_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'filed'
     and (new.title is distinct from old.title
          or new.asset_type is distinct from old.asset_type) then
    raise exception 'o ativo de PI já saiu do depósito (%): título e tipo não mudam mais', old.status
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger ip_assets_identity_frozen
  before update on ip.assets
  for each row execute function ip.guard_identity_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS — AUTOSSUFICIENTE
-- =============================================================================

create or replace function ip.asset_payload(p ip.assets)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'assetId',            p.id,
    'title',              p.title,
    'assetType',          p.asset_type,
    'registrationNumber', p.registration_number,
    'status',             p.status,
    'filedOn',            p.filed_on,
    'sourceId',           p.source_id,
    'sourceName',         p.source_name
  );
$$;

comment on function ip.asset_payload(ip.assets) is
  'Envelope AUTOSSUFICIENTE do ativo de PI, com a origem pelo NOME carimbado (id solto). Sem a nota texto livre. Quem escuta não faz join.';

create or replace function ip.on_asset_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ip.emit_event(new.tenant_id, 'ip.asset.registered', ip.asset_payload(new));
  return new;
end;
$$;

create trigger ip_assets_emit_registered
  after insert on ip.assets
  for each row execute function ip.on_asset_registered();

create or replace function ip.on_asset_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_type := case new.status
              when 'granted'  then 'ip.asset.granted'
              when 'rejected' then 'ip.asset.rejected'
              when 'expired'  then 'ip.asset.expired'
              else null
            end;

  if v_type is not null then
    perform ip.emit_event(new.tenant_id, v_type, ip.asset_payload(new));
  end if;
  return new;
end;
$$;

create trigger ip_assets_emit_status_changed
  after update of status on ip.assets
  for each row execute function ip.on_asset_status_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema ip                  from public, anon, authenticated;
revoke all on all tables    in schema ip from public, anon, authenticated;
revoke all on all functions in schema ip from public, anon, authenticated;

grant usage on schema ip to authenticated;

-- ⛔ SÓ SELECT, INSERT, UPDATE: o ativo de PI é história, não se apaga.
grant select, insert, update on ip.assets to authenticated;

grant execute on function ip.can_access(uuid) to authenticated;

-- `ip.emit_event` NÃO é concedida. `ip.asset_payload` é encanamento. `anon` nada.

-- =============================================================================
-- FIM. O tipo num CHECK (as quatro categorias de PI). Ciclo TERMINAL sem
-- reabertura (a física do proj/nc). Nenhum objeto fora de `ip`. Nenhuma leitura
-- de schema alheio (a origem por id solto). `consumes` VAZIO.
-- =============================================================================
