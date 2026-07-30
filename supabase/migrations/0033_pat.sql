-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0033_pat.sql
-- Módulo 18: Patrimônio. Schema `pat`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §18,
-- depois do `0032_mnt.sql`.
--
-- Taxonomia: Domain 🏭 Operações — capacidade *Patrimônio*.
-- Spec: docs/canon/MODULO-PAT-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A LOCALIZAÇÃO VIGENTE NÃO É COLUNA — o termo vigente do ctr, no LUGAR
-- -----------------------------------------------------------------------------
-- O cadastro CONGELA a localização ORIGINAL do bem. Mudar de lugar é ATO em
-- livro imutável (`pat.transfers`): de onde → para onde, quem, quando — e o
-- "de onde" é carimbado pelo SERVIDOR, nunca digitado (digitado, mentiria
-- sem dar erro). A localização vigente é CALCULADA: o último ato, ou a
-- original quando nunca se moveu (`pat.asset_locations`, security_invoker).
-- Uma coluna `current_location` seria a versão editável da história — e
-- história editável foi exatamente o que o ctr recusou para o contrato.
--
-- -----------------------------------------------------------------------------
-- ⭐ A BAIXA É TERMINAL — o crm re-perguntado, e a resposta DIVERGE
-- -----------------------------------------------------------------------------
-- `active → written_off` é o ÚNICO par. O crm deixa `archived → active`
-- porque a contraparte que volta é a MESMA pessoa — partir o histórico em
-- dois seria mentir. O bem baixado NÃO volta: a baixa (alienação, perda,
-- sucata) é fato patrimonial consumado, e o bem que "retorna" é AQUISIÇÃO
-- NOVA — outro ato, outro custo, outra data. Reativar a linha antiga
-- esconderia a baixa que aconteceu. A baixa exige RAZÃO escrita (a lição do
-- deal.lost) e carimba quem/quando pelo servidor; baixado, o registro
-- congela inteiro.
--
-- -----------------------------------------------------------------------------
-- ⭐ A PONTE QUE A QUADRA DEIXOU — e que continua SOLTA
-- -----------------------------------------------------------------------------
-- `mnt.orders.asset_id` aponta para cá desde o `0032` — uuid SOLTO + alvo
-- carimbado em texto. O pat NÃO lê o mnt, o mnt NÃO ganha FK, e nenhuma
-- linha do `0032` muda com este arquivo. A ponte fica de pé por id + nome
-- carimbado, como a matriz do CI exige dos dois lados.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA categoria como DADO DO TENANT (nome livre; "veículo",
--      "máquina", "mobiliário" são vocabulário de casa, nunca enum).
--   ✅ ENTRA localização TEXTO LIVRE ("sala 3", "obra da av. central",
--      "van 12") — congelar um cadastro de locais seria desenhar a planta
--      de UMA empresa no produto de todas.
--   ✅ ENTRA valor de aquisição OPCIONAL (valor+moeda juntos — a constraint
--      do deal/mnt) e data de aquisição que RECUSA o futuro: aquisição é
--      fato consumado (a física do occ/cash).
--   ✅ ENTRA etiqueta/código ÚNICO por tenant — inclusive dos baixados: a
--      etiqueta é do BEM, não do status; reusá-la confundiria o alvo
--      carimbado das ordens do mnt.
--   ❌ NÃO ENTRA depreciação/vida útil contábil (Lei 3: cálculo contábil é
--      ofício do contador ou integração), plano de manutenção (é do mnt),
--      QR/etiqueta física/leitor (integração), inventário físico com
--      contagem (capacidade vizinha, do inv).
-- =============================================================================

create schema if not exists pat;

comment on schema pat is
  'Módulo Patrimônio. Domain operations da Taxonomia. O cadastro de ativos do tenant: etiqueta única, categoria do tenant, localização vigente CALCULADA do livro de transferências (nunca coluna) e baixa terminal com razão. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima oitava vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function pat.emit_event(
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
  if p_event_type not like 'pat.%' then
    raise exception 'pat.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'pat',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function pat.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function pat.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'pat.asset.manage')
      or core.has_permission(p_tenant_id, 'pat.asset.decide')
      or core.has_permission(p_tenant_id, 'pat.setup.manage');
$$;

create or replace function pat.touch_updated_at()
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
-- 2. CATEGORIES — o vocabulário de bens que o tenant desenha
-- =============================================================================

create table pat.categories (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint pat_categories_id_tenant unique (id, tenant_id)
);

-- Duas categorias ATIVAS com o mesmo nome só geram engano.
create unique index pat_categories_unique_active_name
  on pat.categories (tenant_id, lower(name))
  where status = 'active';

create trigger pat_categories_touch
  before update on pat.categories
  for each row execute function pat.touch_updated_at();

alter table pat.categories enable row level security;
alter table pat.categories force row level security;

create policy pat_categories_select on pat.categories
  for select to authenticated using (pat.can_access(tenant_id));
create policy pat_categories_insert on pat.categories
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pat.setup.manage'));
create policy pat_categories_update on pat.categories
  for update to authenticated
  using (core.has_permission(tenant_id, 'pat.setup.manage'))
  with check (core.has_permission(tenant_id, 'pat.setup.manage'));

-- ⛔ Sem DELETE: categoria com bens é história; arquivar é status.

-- =============================================================================
-- 3. ASSETS — o bem
-- =============================================================================

create table pat.assets (
  id                     uuid        primary key default gen_random_uuid(),
  tenant_id              uuid        not null references core.tenants (id) on delete cascade,
  name                   text        not null check (length(btrim(name)) > 0),
  -- ⭐ A etiqueta: única por tenant, inclusive dos baixados (ver cabeçalho).
  code                   text        not null check (length(btrim(code)) > 0),
  description            text        not null default '',
  category_id            uuid,
  -- ⭐ A localização ORIGINAL, congelada no cadastro. A vigente é calculada.
  original_location      text        not null check (length(btrim(original_location)) > 0),
  -- Valor e moeda JUNTOS, ou nenhum (a constraint do deal/mnt).
  acquisition_cost_cents bigint      check (acquisition_cost_cents is null or acquisition_cost_cents >= 0),
  currency               char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  acquired_on            date,
  status                 text        not null default 'active'
                         check (status in ('active', 'written_off')),
  -- ⭐ O ATO da baixa: quem, quando e POR QUÊ. Terminal — não limpa nunca.
  written_off_at         timestamptz,
  written_off_by         uuid        references auth.users (id) on delete set null,
  write_off_reason       text        not null default '',
  created_at             timestamptz not null default now(),
  created_by             uuid        references auth.users (id) on delete set null,
  updated_at             timestamptz not null default now(),
  constraint pat_assets_id_tenant unique (id, tenant_id),
  constraint pat_assets_category_fk
    foreign key (category_id, tenant_id)
    references pat.categories (id, tenant_id) on delete restrict,
  constraint pat_assets_cost_currency check (
    (acquisition_cost_cents is null and currency is null) or
    (acquisition_cost_cents is not null and currency is not null)
  ),
  -- ⭐ Aquisição é fato consumado: não mora no futuro.
  constraint pat_assets_not_future check (
    acquired_on is null or acquired_on <= current_date
  ),
  -- Baixado tem carimbo e razão; ativo não tem nenhum dos dois.
  constraint pat_assets_write_off_coherent check (
    (status = 'written_off' and written_off_at is not null
      and length(btrim(write_off_reason)) > 0)
    or (status = 'active' and written_off_at is null and write_off_reason = '')
  )
);

create unique index pat_assets_code_unique
  on pat.assets (tenant_id, lower(btrim(code)));

create index pat_assets_book_idx
  on pat.assets (tenant_id, status, name);

create trigger pat_assets_touch
  before update on pat.assets
  for each row execute function pat.touch_updated_at();

alter table pat.assets enable row level security;
alter table pat.assets force row level security;

create policy pat_assets_select on pat.assets
  for select to authenticated
  using (pat.can_access(tenant_id));

create policy pat_assets_insert on pat.assets
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pat.asset.manage'));

create policy pat_assets_update on pat.assets
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'pat.asset.manage')
    or core.has_permission(tenant_id, 'pat.asset.decide')
  )
  with check (
    core.has_permission(tenant_id, 'pat.asset.manage')
    or core.has_permission(tenant_id, 'pat.asset.decide')
  );

-- ⛔ Sem policy / grant de DELETE. Bem que saiu é baixa com razão, não vazio.

-- -----------------------------------------------------------------------------
-- 3.1 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/assets
-- -----------------------------------------------------------------------------

create or replace function pat.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active', 'written_off')
  );
$$;

comment on function pat.allowed_transition(text, text) is
  'Ciclo de vida do bem. Espelho de ALLOWED_TRANSITIONS em @alsham/assets. UM par só: a baixa é terminal — o crm re-perguntado, e a resposta diverge de propósito (o bem que volta é aquisição nova; a contraparte que volta é a mesma pessoa).';

-- -----------------------------------------------------------------------------
-- 3.2 O PORTEIRO — a baixa exige razão e permissão própria; depois, congela
-- -----------------------------------------------------------------------------

create or replace function pat.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not pat.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe: a baixa é terminal — o bem que volta é aquisição nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'pat.asset.decide') then
    raise exception 'baixar o bem exige a permissão pat.asset.decide'
      using errcode = '42501';
  end if;

  if length(btrim(new.write_off_reason)) = 0 then
    raise exception 'a baixa exige a razão escrita — alienação, perda, sucata: o porquê fica no livro'
      using errcode = '22023';
  end if;

  new.written_off_at := now();
  new.written_off_by := (select auth.uid());

  return new;
end;
$$;

create trigger pat_assets_guard_status
  before update of status on pat.assets
  for each row execute function pat.guard_status_transition();

-- ⭐ Baixado, o registro congela INTEIRO — não há transição de volta, e não
-- há edição: o que volta é aquisição nova.
create or replace function pat.guard_asset_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'active' then
    return new;
  end if;

  if new.status is distinct from old.status then
    return new;   -- transição é com o porteiro acima (que recusará).
  end if;

  raise exception 'bem baixado não se edita: o que volta é aquisição nova'
    using errcode = '22023';
end;
$$;

create trigger pat_assets_frozen
  before update on pat.assets
  for each row
  when (old.* is distinct from new.*)
  execute function pat.guard_asset_frozen();

-- =============================================================================
-- 4. TRANSFERS — ⭐ O LIVRO DO LUGAR (o "de onde" é do SERVIDOR)
-- -----------------------------------------------------------------------------
-- O cliente diz só PARA ONDE. O gatilho carimba de onde saiu (a vigente no
-- instante do ato), quem moveu e quando — um "de onde" digitado é um livro
-- que mente sem dar erro. Linha eterna: sem UPDATE, sem DELETE, com gatilho
-- que recusa até para o dono do banco.
-- =============================================================================

create table pat.transfers (
  id            uuid        primary key default gen_random_uuid(),
  -- ⭐ A ordem do livro: dois atos na MESMA transação têm o mesmo now(), e
  -- desempatar por uuid seria loteria. A sequência de inserção é a verdade.
  seq           bigint      generated always as identity,
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  asset_id      uuid        not null,
  from_location text        not null default '',
  to_location   text        not null check (length(btrim(to_location)) > 0),
  note          text        not null default '',
  moved_at      timestamptz not null default now(),
  moved_by      uuid        references auth.users (id) on delete set null,
  constraint pat_transfers_asset_fk
    foreign key (asset_id, tenant_id)
    references pat.assets (id, tenant_id)
    on delete restrict
);

create index pat_transfers_idx
  on pat.transfers (tenant_id, asset_id, seq desc);

alter table pat.transfers enable row level security;
alter table pat.transfers force row level security;

create policy pat_transfers_select on pat.transfers
  for select to authenticated
  using (pat.can_access(tenant_id));

create policy pat_transfers_insert on pat.transfers
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pat.asset.manage'));

-- A localização vigente de UM bem — a mesma conta da view, para os gatilhos.
create or replace function pat.current_location_of(p_asset_id uuid, p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select t.to_location
       from pat.transfers t
      where t.asset_id = p_asset_id and t.tenant_id = p_tenant_id
      order by t.seq desc
      limit 1),
    (select a.original_location
       from pat.assets a
      where a.id = p_asset_id and a.tenant_id = p_tenant_id)
  );
$$;

create or replace function pat.guard_transfer_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  -- Tranca o bem: dois atos simultâneos sairiam do mesmo "de onde".
  select status into v_status
    from pat.assets
   where id = new.asset_id and tenant_id = new.tenant_id
   for update;

  if v_status is null then
    raise exception 'o bem não existe neste tenant' using errcode = '22023';
  end if;

  if v_status = 'written_off' then
    raise exception 'bem baixado não se transfere: a baixa encerrou o livro dele'
      using errcode = '22023';
  end if;

  -- ⭐ O carimbo é do servidor — o que o cliente mandou aqui é descartado.
  new.from_location := pat.current_location_of(new.asset_id, new.tenant_id);
  new.moved_at      := now();
  new.moved_by      := (select auth.uid());

  return new;
end;
$$;

create trigger pat_transfers_stamp
  before insert on pat.transfers
  for each row execute function pat.guard_transfer_insert();

create or replace function pat.guard_transfers_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o livro de transferências é registro de fato consumado: não se edita nem se apaga.'
    using errcode = '42501';
end;
$$;

create trigger pat_transfers_immutable
  before update or delete on pat.transfers
  for each row execute function pat.guard_transfers_immutable();

-- =============================================================================
-- 5. A LOCALIZAÇÃO VIGENTE — consequência calculada, nunca coluna
-- =============================================================================

create view pat.asset_locations
  with (security_invoker = true)
as
select a.id                                          as asset_id,
       a.tenant_id,
       coalesce(t.to_location, a.original_location)  as current_location,
       t.moved_at                                    as last_moved_at
  from pat.assets a
  left join lateral (
    select tr.to_location, tr.moved_at
      from pat.transfers tr
     where tr.asset_id = a.id and tr.tenant_id = a.tenant_id
     order by tr.seq desc
     limit 1
  ) t on true;

comment on view pat.asset_locations is
  'A localização VIGENTE de cada bem: o último ato do livro, ou a original quando nunca se moveu. Calculada — coluna editável seria história editável. security_invoker: a RLS de assets/transfers decide.';

-- =============================================================================
-- 6. OS FATOS — payload autossuficiente (categoria pelo NOME, lugar vigente)
-- =============================================================================

create or replace function pat.asset_payload(p pat.assets)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category text;
begin
  select name into v_category from pat.categories where id = p.category_id;

  return jsonb_build_object(
    'assetId',              p.id,
    'name',                 p.name,
    'code',                 p.code,
    'categoryId',           p.category_id,
    'categoryName',         v_category,
    'currentLocation',      pat.current_location_of(p.id, p.tenant_id),
    'acquisitionCostCents', p.acquisition_cost_cents,
    'currency',             p.currency,
    'acquiredOn',           p.acquired_on,
    'status',               p.status,
    'writtenOffAt',         p.written_off_at,
    'writeOffReason',       p.write_off_reason
  );
end;
$$;

comment on function pat.asset_payload(pat.assets) is
  'O envelope de um bem — AUTOSSUFICIENTE, com a categoria pelo NOME e o lugar vigente calculado. Quem escuta não faz join.';

create or replace function pat.on_asset_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pat.emit_event(new.tenant_id, 'pat.asset.registered', pat.asset_payload(new));
  return new;
end;
$$;

create trigger pat_assets_emit_registered
  after insert on pat.assets
  for each row execute function pat.on_asset_registered();

create or replace function pat.on_asset_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform pat.emit_event(new.tenant_id, 'pat.asset.retired', pat.asset_payload(new));
    return new;
  end if;

  if new.name is distinct from old.name
     or new.code is distinct from old.code
     or new.category_id is distinct from old.category_id
     or new.acquisition_cost_cents is distinct from old.acquisition_cost_cents
     or new.currency is distinct from old.currency
     or new.acquired_on is distinct from old.acquired_on then
    perform pat.emit_event(new.tenant_id, 'pat.asset.updated', pat.asset_payload(new));
  end if;

  return new;
end;
$$;

create trigger pat_assets_emit_changed
  after update on pat.assets
  for each row execute function pat.on_asset_changed();

create or replace function pat.on_transfer_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_code text;
begin
  select name, code into v_name, v_code
    from pat.assets where id = new.asset_id and tenant_id = new.tenant_id;

  perform pat.emit_event(new.tenant_id, 'pat.asset.transferred', jsonb_build_object(
    'assetId',      new.asset_id,
    'assetName',    v_name,
    'assetCode',    v_code,
    'fromLocation', new.from_location,
    'toLocation',   new.to_location,
    'note',         new.note,
    'movedAt',      new.moved_at
  ));
  return new;
end;
$$;

create trigger pat_transfers_emit
  after insert on pat.transfers
  for each row execute function pat.on_transfer_recorded();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema pat                  from public, anon, authenticated;
revoke all on all tables    in schema pat from public, anon, authenticated;
revoke all on all functions in schema pat from public, anon, authenticated;

grant usage on schema pat to authenticated;

grant select, insert, update on pat.categories to authenticated;
grant select, insert, update on pat.assets     to authenticated;

-- ⭐ SÓ INSERT+SELECT: o livro do lugar não se reescreve.
grant select, insert on pat.transfers to authenticated;

grant select on pat.asset_locations to authenticated;

grant execute on function pat.can_access(uuid) to authenticated;

-- `pat.emit_event` NÃO é concedida. `pat.asset_payload` e
-- `pat.current_location_of` são encanamento dos gatilhos. `anon` não recebe
-- nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma coluna de localização vigente. Nenhuma
-- depreciação. Nenhum objeto fora de `pat`. Nenhuma leitura de schema
-- alheio — nem do mnt, cuja ponte continua solta do lado de lá.
-- =============================================================================
