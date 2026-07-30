-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0041_media.sql
-- Módulo 26: Biblioteca de Mídia. Schema `media`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §19,
-- depois do `0040_edcal.sql`.
--
-- Taxonomia: Domain 📢 Marketing — capacidade *Mídia* (a linha do
-- Marketing na Taxonomia §5). Terceira peça minerada da mesma linha (evt,
-- edcal, media): cada capacidade é um módulo, como manda o Lego.
-- Spec: docs/canon/MODULO-MEDIA-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ HONESTIDADE ESTRUTURAL — isto é CATÁLOGO, não cofre
-- -----------------------------------------------------------------------------
-- *Storage & Arquivos* é capacidade do CORE (Taxonomia §3) e está NÃO
-- CONSTRUÍDA. Este módulo NÃO guarda arquivo nenhum — ele cataloga: o
-- ativo é um REGISTRO (título, descrição, tipo, ONDE VIVE), e o "onde
-- vive" é TEXTO LIVRE (`location`): uma URL, "HD externo da sala 2", "o
-- drive da agência". Fingir um cofre sem Storage seria a Lei 7 quebrada
-- na cara do cliente.
--
-- ⭐ E a coluna já nasce pronta para o FUTURO sem migration corretiva:
-- quando o Storage do Core existir, o endereço canônico do arquivo
-- continua sendo TEXTO (a URL que o Storage der) — nada aqui muda de
-- tipo, nada se renomeia. O catálogo aponta; quem hospeda é detalhe.
--
-- -----------------------------------------------------------------------------
-- ⭐ O ACERVO VOLTA DO ARQUIVO — o DIVERGE do pat, assinado
-- -----------------------------------------------------------------------------
-- O pat re-perguntou o crm e decidiu: a baixa do BEM é terminal (o bem
-- que volta é aquisição nova). Aqui a MESMA pergunta tem a OUTRA
-- resposta: o ativo de mídia arquivado VOLTA (`archived → active`),
-- porque o logo de 2024 que sai de linha e volta na campanha retrô é o
-- MESMO ativo — obrigá-lo a renascer partiria o histórico de USO em dois
-- (o argumento do crm). Patrimônio tem identidade fiscal; mídia tem
-- identidade de OBRA. Há teste de contraste que assina os dois lados.
-- ⚠️ Fora do acervo não se usa: ativo arquivado recusa USO novo (a física
-- do spc/comm) — devolva-o ao ativo para usar.
--
-- -----------------------------------------------------------------------------
-- ⭐ O USO É LIVRO — ato imutável, com vínculo SOLTO
-- -----------------------------------------------------------------------------
-- Onde este ativo já foi usado? `media.usages` é LIVRO: cada uso é ato
-- carimbado pelo servidor (quem, quando), com o "em quê" em TEXTO LIVRE
-- ("campanha de natal", "post do dia 12") e um id SOLTO opcional
-- (`reference_id`, sem FK — a guarda da matriz reprovaria FK para
-- campanha/pauta de outro módulo). Imutável em 3 camadas: uso registrado
-- errado se corrige registrando outro, com nota.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA tipo TEXTO LIVRE (foto, vetor, áudio, "peça de vitrine" —
--      congelar os formatos de uma década numa coluna envelheceria o
--      produto); tags como TABELA DO TENANT, N:N.
--   ❌ NÃO ENTRA upload/storage (capacidade do Core, não construída),
--      thumbnail/preview (idem), gestão de direitos autorais (Domain
--      jurídico — o ctr é o lugar de contrato), busca dentro do conteúdo
--      (exigiria ler o arquivo que este módulo não guarda).
-- =============================================================================

create schema if not exists media;

comment on schema media is
  'Módulo Biblioteca de Mídia. Domain marketing da Taxonomia (capacidade Mídia). CATÁLOGO, não cofre: o ativo é registro com o onde-vive em texto livre; o acervo volta do arquivo (o DIVERGE assinado do pat); o uso é livro imutável com vínculo solto. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — vigésima sexta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function media.emit_event(
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
  if p_event_type not like 'media.%' then
    raise exception 'media.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'media',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function media.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function media.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'media.asset.manage')
      or core.has_permission(p_tenant_id, 'media.usage.record');
$$;

create or replace function media.touch_updated_at()
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
-- 2. ASSETS — o catálogo do acervo
-- =============================================================================

create table media.assets (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  title       text        not null check (length(btrim(title)) > 0),
  description text        not null default '',
  -- ⭐ Tipo TEXTO LIVRE — e vazio é permitido e honesto (o precedente da
  -- categoria do cash): melhor sem tipo do que com tipo inventado.
  asset_type  text        not null default '',
  -- ⭐ ONDE VIVE — texto livre, obrigatório: catálogo que não diz onde a
  -- obra mora não cataloga nada. Pronto para o Storage futuro (cabeçalho).
  location    text        not null check (length(btrim(location)) > 0),
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint media_assets_id_tenant unique (id, tenant_id)
);

create index media_assets_shelf_idx
  on media.assets (tenant_id, status, title);

create trigger media_assets_touch
  before update on media.assets
  for each row execute function media.touch_updated_at();

alter table media.assets enable row level security;
alter table media.assets force row level security;

create policy media_assets_select on media.assets
  for select to authenticated
  using (media.can_access(tenant_id));

create policy media_assets_insert on media.assets
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'media.asset.manage'));

create policy media_assets_update on media.assets
  for update to authenticated
  using (core.has_permission(tenant_id, 'media.asset.manage'))
  with check (core.has_permission(tenant_id, 'media.asset.manage'));

-- ⛔ Sem policy / grant de DELETE. Obra com história de uso não se apaga —
-- arquiva-se, e o livro de usos fica.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: no acervo (active) — e o carimbo de quem catalogou
-- -----------------------------------------------------------------------------

create or replace function media.guard_asset_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'a obra entra no acervo ao ser catalogada: arquivar é ato posterior'
      using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger media_assets_stamp
  before insert on media.assets
  for each row execute function media.guard_asset_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/media
-- -----------------------------------------------------------------------------

create or replace function media.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function media.allowed_transition(text, text) is
  'Ciclo de vida do ativo de mídia. Espelho de ALLOWED_TRANSITIONS em @alsham/media. IDA E VOLTA de propósito — o DIVERGE assinado do pat: a baixa do BEM é terminal (identidade fiscal); o ativo de mídia que volta é a MESMA obra, e renascer partiria o histórico de uso em dois (o argumento do crm).';

create or replace function media.guard_asset_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not media.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no acervo', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger media_assets_guard_status
  before update on media.assets
  for each row execute function media.guard_asset_transition();

-- =============================================================================
-- 3. TAGS — ⭐ tabela do tenant, N:N — nunca enum
-- =============================================================================

create table media.tags (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  constraint media_tags_id_tenant unique (id, tenant_id)
);

create unique index media_tags_name_unique
  on media.tags (tenant_id, lower(btrim(name)));

create table media.asset_tags (
  tenant_id uuid not null references core.tenants (id) on delete cascade,
  asset_id  uuid not null,
  tag_id    uuid not null,
  primary key (asset_id, tag_id),
  constraint media_asset_tags_asset_fk
    foreign key (asset_id, tenant_id)
    references media.assets (id, tenant_id)
    on delete restrict,
  -- Apagar a etiqueta desfaz a classificação em cascata: etiqueta é
  -- METADADO do catálogo, não fato — o livro de usos não passa por aqui.
  constraint media_asset_tags_tag_fk
    foreign key (tag_id, tenant_id)
    references media.tags (id, tenant_id)
    on delete cascade
);

create index media_asset_tags_by_tag
  on media.asset_tags (tenant_id, tag_id);

alter table media.tags enable row level security;
alter table media.tags force row level security;
alter table media.asset_tags enable row level security;
alter table media.asset_tags force row level security;

create policy media_tags_select on media.tags
  for select to authenticated
  using (media.can_access(tenant_id));

create policy media_tags_write on media.tags
  for all to authenticated
  using (core.has_permission(tenant_id, 'media.asset.manage'))
  with check (core.has_permission(tenant_id, 'media.asset.manage'));

create policy media_asset_tags_select on media.asset_tags
  for select to authenticated
  using (media.can_access(tenant_id));

create policy media_asset_tags_write on media.asset_tags
  for all to authenticated
  using (core.has_permission(tenant_id, 'media.asset.manage'))
  with check (core.has_permission(tenant_id, 'media.asset.manage'));

-- ⚠️ Etiqueta e vínculo TÊM porta de DELETE (as únicas do schema):
-- classificar é metadado vivo do catálogo — desfazer uma etiqueta não
-- apaga história nenhuma. O que é fato (o USO) vive no livro, sem DELETE.

-- =============================================================================
-- 4. USAGES — ⭐ o livro de uso: ato imutável, vínculo solto
-- =============================================================================

create table media.usages (
  id           uuid        primary key default gen_random_uuid(),
  -- A ordem dos atos é a do LIVRO (identidade), nunca a do relógio — dois
  -- usos no mesmo instante não empatam (a lição do pat).
  seq          bigint      generated always as identity,
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  asset_id     uuid        not null,
  -- ⭐ Em quê — TEXTO LIVRE: campanha, pauta, evento, "vitrine de agosto".
  used_in      text        not null check (length(btrim(used_in)) > 0),
  note         text        not null default '',
  -- ⭐ Vínculo SOLTO opcional — id sem FK (a guarda da matriz reprovaria
  -- FK para objeto de outro módulo). O nome fica em `used_in`.
  reference_id uuid,
  used_at      timestamptz not null default now(),
  used_by      uuid        references auth.users (id) on delete set null,
  constraint media_usages_asset_fk
    foreign key (asset_id, tenant_id)
    references media.assets (id, tenant_id)
    on delete restrict
);

create index media_usages_book_idx
  on media.usages (tenant_id, asset_id, seq desc);

alter table media.usages enable row level security;
alter table media.usages force row level security;

create policy media_usages_select on media.usages
  for select to authenticated
  using (media.can_access(tenant_id));

create policy media_usages_insert on media.usages
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'media.usage.record'));

create or replace function media.guard_usage_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from media.assets
   where id = new.asset_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'o ativo não existe neste tenant' using errcode = '22023';
  end if;

  -- ⭐ Fora do acervo não se usa (a física do spc/comm): devolva ao ativo.
  if v_status = 'archived' then
    raise exception 'ativo arquivado não recebe uso novo: devolva-o ao acervo para usar'
      using errcode = '22023';
  end if;

  -- O ato é carimbado pelo servidor — o digitado é descartado.
  new.used_at := now();
  new.used_by := (select auth.uid());

  return new;
end;
$$;

create trigger media_usages_stamp
  before insert on media.usages
  for each row execute function media.guard_usage_insert();

create or replace function media.guard_usages_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o uso é registro de fato consumado: não se edita nem se apaga — registre outro, com nota.'
    using errcode = '42501';
end;
$$;

create trigger media_usages_immutable
  before update or delete on media.usages
  for each row execute function media.guard_usages_immutable();

-- =============================================================================
-- 5. OS FATOS
-- =============================================================================

create or replace function media.asset_payload(p media.assets)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'assetId',   p.id,
    'title',     p.title,
    'assetType', p.asset_type,
    'location',  p.location,
    'status',    p.status
  );
$$;

comment on function media.asset_payload(media.assets) is
  'O envelope de um ativo de mídia — AUTOSSUFICIENTE: título, tipo e o onde-vive. Catálogo, não conteúdo.';

create or replace function media.on_asset_cataloged()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform media.emit_event(new.tenant_id, 'media.asset.cataloged', media.asset_payload(new));
  return new;
end;
$$;

create trigger media_assets_emit_cataloged
  after insert on media.assets
  for each row execute function media.on_asset_cataloged();

create or replace function media.on_asset_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform media.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'media.asset.archived'
           else 'media.asset.restored' end,
      media.asset_payload(new)
    );
  end if;
  return new;
end;
$$;

create trigger media_assets_emit_changed
  after update on media.assets
  for each row execute function media.on_asset_changed();

create or replace function media.on_usage_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  select title into v_title
    from media.assets where id = new.asset_id and tenant_id = new.tenant_id;

  perform media.emit_event(new.tenant_id, 'media.usage.recorded', jsonb_build_object(
    'assetId',     new.asset_id,
    'assetTitle',  v_title,
    'usedIn',      new.used_in,
    'referenceId', new.reference_id,
    'usedAt',      new.used_at
  ));
  return new;
end;
$$;

create trigger media_usages_emit
  after insert on media.usages
  for each row execute function media.on_usage_recorded();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema media                  from public, anon, authenticated;
revoke all on all tables    in schema media from public, anon, authenticated;
revoke all on all functions in schema media from public, anon, authenticated;

grant usage on schema media to authenticated;

grant select, insert, update on media.assets to authenticated;

-- ⚠️ As ÚNICAS portas de DELETE do schema: etiqueta é metadado vivo do
-- catálogo, não fato.
grant select, insert, update, delete on media.tags       to authenticated;
grant select, insert, delete         on media.asset_tags to authenticated;

-- ⭐ SÓ INSERT+SELECT: o livro de uso não se rasura.
grant select, insert on media.usages to authenticated;

grant execute on function media.can_access(uuid) to authenticated;

-- `media.emit_event` NÃO é concedida. `media.asset_payload` é encanamento
-- dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum arquivo hospedado. Nenhuma miniatura. Nenhuma
-- gestão de direitos. Nenhuma busca de conteúdo. Nenhum objeto fora de
-- `media`. Nenhuma leitura de schema alheio.
-- =============================================================================
