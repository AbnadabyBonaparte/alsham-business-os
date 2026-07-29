-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0017_po.sql
-- Módulo 6: Compras (Pedidos). Schema `po`.
-- =============================================================================
--
-- NÃO APLICADO. `0001`→`0010` (+ seed) em produção (informado); `0011`→`0014`
-- são arquivo na main. Lacuna `0015`/`0016` proposital. Aplicar é ato do dono.
--
-- Taxonomia: Domain Compras — capacidades *Pedidos* e *Recebimento*.
-- Spec: docs/canon/MODULO-PO-SPEC.md
--
-- -----------------------------------------------------------------------------
-- POR QUE O `module_id` É `po`
-- -----------------------------------------------------------------------------
-- Cinto de emit_event: eventos `po.*` ⇒ id `po`. Pacote @alsham/purchase-orders.
--
-- -----------------------------------------------------------------------------
-- ESPELHO CONSCIENTE (AP/AR) — MANTIDO × DIVERGE
-- -----------------------------------------------------------------------------
-- MANTIDO: external_ref único; currency sem default; supplier_name +
--   counterparty_tax_id; cancelar=status; received→cancelled NÃO existe;
--   payload autossuficiente; emit só quando muda o FATO.
-- DIVERGE: nasce draft (não open); 3ª permissão receive; over-receive de qty
--   PERMITIDO (espírito AR); itens texto sem catálogo/SKU/NCM.
-- =============================================================================

create schema if not exists po;

comment on schema po is
  'Módulo Compras (Pedidos). Domain procurement da Taxonomia. Não cria objeto em core nem lê schema alheio; fala só por core.event_outbox.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function po.emit_event(
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
  if p_event_type not like 'po.%' then
    raise exception 'po.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'po',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function po.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function po.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'po.order.manage')
      or core.has_permission(p_tenant_id, 'po.order.cancel')
      or core.has_permission(p_tenant_id, 'po.order.receive');
$$;

create or replace function po.touch_updated_at()
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
-- 2. ORDERS — o pedido de compra
-- =============================================================================

create table po.orders (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  external_ref        text        not null check (length(btrim(external_ref)) > 0),
  currency            char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  supplier_name       text,
  counterparty_tax_id text,
  description         text        not null default '',
  -- Soma das linhas. Mantida por trigger em order_items.
  total_cents         bigint      not null default 0 check (total_cents >= 0),
  status              text        not null default 'draft'
                      check (status in (
                        'draft', 'submitted', 'partially_received',
                        'received', 'cancelled'
                      )),
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint orders_unique_ref unique (tenant_id, external_ref),
  constraint orders_id_tenant unique (id, tenant_id)
);

create index orders_open_idx
  on po.orders (tenant_id, created_at desc)
  where status in ('draft', 'submitted', 'partially_received');

create trigger orders_touch
  before update on po.orders
  for each row execute function po.touch_updated_at();

alter table po.orders enable row level security;
alter table po.orders force row level security;

create policy orders_select on po.orders
  for select to authenticated
  using (po.can_access(tenant_id));

create policy orders_insert on po.orders
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'po.order.manage'));

create policy orders_update on po.orders
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'po.order.manage')
    or core.has_permission(tenant_id, 'po.order.cancel')
    or core.has_permission(tenant_id, 'po.order.receive')
  )
  with check (
    core.has_permission(tenant_id, 'po.order.manage')
    or core.has_permission(tenant_id, 'po.order.cancel')
    or core.has_permission(tenant_id, 'po.order.receive')
  );

-- ⛔ Sem policy / grant de DELETE.

-- -----------------------------------------------------------------------------
-- 2.1 Transições — espelho de ALLOWED_TRANSITIONS no pacote
-- -----------------------------------------------------------------------------

create or replace function po.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft',              'submitted'),
    ('draft',              'cancelled'),
    ('submitted',          'partially_received'),
    ('submitted',          'received'),
    ('submitted',          'cancelled'),
    ('partially_received', 'received'),
    ('partially_received', 'cancelled')
  );
$$;

comment on function po.allowed_transition(text, text) is
  'Ciclo de vida do pedido. Espelho de ALLOWED_TRANSITIONS em @alsham/purchase-orders.';

-- O porteiro que lê order_items nasce DEPOIS da tabela de itens (§3).

-- =============================================================================
-- 3. ORDER_ITEMS — linhas do pedido (texto + qty + unitário; sem catálogo)
-- =============================================================================

create table po.order_items (
  id                uuid           primary key default gen_random_uuid(),
  tenant_id         uuid           not null,
  order_id          uuid           not null,
  line_no           integer        not null check (line_no > 0),
  description       text           not null check (length(btrim(description)) > 0),
  quantity          numeric(18, 4) not null check (quantity > 0),
  unit_amount_cents bigint         not null check (unit_amount_cents > 0),
  qty_received      numeric(18, 4) not null default 0 check (qty_received >= 0),
  line_total_cents  bigint         generated always as
                      ((round(quantity * unit_amount_cents))::bigint) stored,
  created_at        timestamptz    not null default now(),
  constraint order_items_line unique (order_id, line_no),
  constraint order_items_order_fk
    foreign key (order_id, tenant_id)
    references po.orders (id, tenant_id) on delete cascade
);

create index order_items_order_idx on po.order_items (order_id);

alter table po.order_items enable row level security;
alter table po.order_items force row level security;

create policy order_items_select on po.order_items
  for select to authenticated
  using (po.can_access(tenant_id));

create policy order_items_insert on po.order_items
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'po.order.manage'));

create policy order_items_update on po.order_items
  for update to authenticated
  using (
    core.has_permission(tenant_id, 'po.order.manage')
    or core.has_permission(tenant_id, 'po.order.receive')
  )
  with check (
    core.has_permission(tenant_id, 'po.order.manage')
    or core.has_permission(tenant_id, 'po.order.receive')
  );

-- DELETE de linha só em rascunho, via manage — e só enquanto draft.
-- Sem grant genérico de delete em orders; itens podem ser removidos no draft.
create policy order_items_delete on po.order_items
  for delete to authenticated
  using (
    core.has_permission(tenant_id, 'po.order.manage')
    and exists (
      select 1 from po.orders o
       where o.id = order_id and o.tenant_id = tenant_id and o.status = 'draft'
    )
  );

-- Porteiro do status (depois de order_items existir — checa itens no submit).
create or replace function po.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not po.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do pedido',
      old.status, new.status
      using errcode = '22023';
  end if;

  if new.status = 'cancelled'
     and not core.has_permission(new.tenant_id, 'po.order.cancel') then
    raise exception 'cancelar pedido exige a permissão po.order.cancel'
      using errcode = '42501';
  end if;

  if new.status in ('partially_received', 'received')
     and not core.has_permission(new.tenant_id, 'po.order.receive') then
    raise exception 'registrar recebimento exige a permissão po.order.receive'
      using errcode = '42501';
  end if;

  if new.status = 'submitted' and old.status = 'draft' then
    if not exists (
      select 1 from po.order_items i
       where i.order_id = new.id and i.tenant_id = new.tenant_id
    ) then
      raise exception 'enviar pedido exige ao menos um item'
        using errcode = '22023';
    end if;
    if new.total_cents <= 0 then
      raise exception 'enviar pedido exige total_cents > 0'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_guard_status
  before update of status on po.orders
  for each row execute function po.guard_status_transition();

create or replace function po.sync_order_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_tenant   uuid;
  v_total    bigint;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  v_tenant   := coalesce(new.tenant_id, old.tenant_id);

  select coalesce(sum(i.line_total_cents), 0)
    into v_total
    from po.order_items i
   where i.order_id = v_order_id
     and i.tenant_id = v_tenant;

  update po.orders
     set total_cents = v_total,
         updated_at  = now()
   where id = v_order_id
     and tenant_id = v_tenant;

  return coalesce(new, old);
end;
$$;

create trigger order_items_sync_total
  after insert or update of quantity, unit_amount_cents or delete
  on po.order_items
  for each row execute function po.sync_order_total();

create or replace function po.guard_item_receive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.qty_received is not distinct from old.qty_received then
    return new;
  end if;

  select status into v_status
    from po.orders
   where id = new.order_id and tenant_id = new.tenant_id;

  if v_status in ('draft', 'cancelled') then
    raise exception 'não se registra recebimento em pedido %', v_status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'po.order.receive') then
    raise exception 'registrar recebimento exige a permissão po.order.receive'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger order_items_guard_receive
  before update of qty_received on po.order_items
  for each row execute function po.guard_item_receive();

-- Após mudar qty_received, recalcula o status do cabeçalho (se ainda aberto).
create or replace function po.recompute_receipt_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_next   text;
  v_lines  int;
  v_done   int;
  v_any    int;
begin
  select status into v_status
    from po.orders
   where id = new.order_id and tenant_id = new.tenant_id;

  if v_status in ('draft', 'cancelled', 'received') then
    return new;
  end if;

  select count(*),
         count(*) filter (where i.qty_received >= i.quantity),
         count(*) filter (where i.qty_received > 0)
    into v_lines, v_done, v_any
    from po.order_items i
   where i.order_id = new.order_id
     and i.tenant_id = new.tenant_id;

  if v_lines = 0 then
    return new;
  end if;

  if v_done = v_lines then
    v_next := 'received';
  elsif v_any > 0 then
    v_next := 'partially_received';
  else
    v_next := 'submitted';
  end if;

  if v_next is distinct from v_status and po.allowed_transition(v_status, v_next) then
    update po.orders
       set status = v_next,
           updated_at = now()
     where id = new.order_id
       and tenant_id = new.tenant_id;
  end if;

  return new;
end;
$$;

create trigger order_items_recompute_status
  after update of qty_received on po.order_items
  for each row execute function po.recompute_receipt_status();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function po.order_payload(p_order_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order po.orders;
  v_items jsonb;
begin
  select * into v_order
    from po.orders
   where id = p_order_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineNo',          i.line_no,
      'description',     i.description,
      'quantity',        i.quantity,
      'unitAmountCents', i.unit_amount_cents,
      'qtyReceived',     i.qty_received,
      'lineTotalCents',  i.line_total_cents
    ) order by i.line_no
  ), '[]'::jsonb)
    into v_items
    from po.order_items i
   where i.order_id = p_order_id
     and i.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'externalRef',       v_order.external_ref,
    'currency',          v_order.currency,
    'supplierName',      v_order.supplier_name,
    'counterpartyTaxId', v_order.counterparty_tax_id,
    'description',       v_order.description,
    'totalCents',        v_order.total_cents,
    'status',            v_order.status,
    'items',             v_items
  );
end;
$$;

comment on function po.order_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE do pedido — inclui os itens. Quem escuta não faz join.';

create or replace function po.on_order_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Itens ainda podem não existir no INSERT do cabeçalho; o update seguinte
  -- (totais/itens) emite updated com o payload completo.
  perform po.emit_event(
    new.tenant_id,
    'po.order.registered',
    po.order_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger orders_emit_registered
  after insert on po.orders
  for each row execute function po.on_order_registered();

create or replace function po.on_order_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  if new.total_cents is distinct from old.total_cents
     or new.status is distinct from old.status
     or new.supplier_name is distinct from old.supplier_name
     or new.counterparty_tax_id is distinct from old.counterparty_tax_id
     or new.currency is distinct from old.currency then
    perform po.emit_event(
      new.tenant_id,
      'po.order.updated',
      po.order_payload(new.id, new.tenant_id)
    );
  end if;

  return new;
end;
$$;

create trigger orders_emit_updated
  after update on po.orders
  for each row execute function po.on_order_updated();

create or replace function po.on_order_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  perform po.emit_event(
    new.tenant_id,
    'po.order.cancelled',
    po.order_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger orders_emit_cancelled
  after update of status on po.orders
  for each row execute function po.on_order_cancelled();

-- Itens: mudança material (qty/preço/recebimento) emite updated no cabeçalho.
create or replace function po.on_item_fact_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_tenant   uuid := coalesce(new.tenant_id, old.tenant_id);
  v_status   text;
begin
  select status into v_status from po.orders where id = v_order_id and tenant_id = v_tenant;
  if v_status = 'cancelled' then
    return coalesce(new, old);
  end if;

  perform po.emit_event(
    v_tenant,
    'po.order.updated',
    po.order_payload(v_order_id, v_tenant)
  );
  return coalesce(new, old);
end;
$$;

create trigger order_items_emit_updated
  after insert or update of quantity, unit_amount_cents, qty_received, description
     or delete
  on po.order_items
  for each row execute function po.on_item_fact_changed();

-- =============================================================================
-- 5. PRIVILÉGIOS
-- =============================================================================

revoke all on schema po                from public, anon, authenticated;
revoke all on all tables    in schema po from public, anon, authenticated;
revoke all on all functions in schema po from public, anon, authenticated;

grant usage on schema po to authenticated;

grant select, insert, update on po.orders to authenticated;
grant select, insert, update, delete on po.order_items to authenticated;

grant execute on function po.can_access(uuid) to authenticated;
grant execute on function po.order_payload(uuid, uuid) to authenticated;

-- po.emit_event NÃO é concedida.
-- anon não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum objeto fora de `po`.
-- =============================================================================
