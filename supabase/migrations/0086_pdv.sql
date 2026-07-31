-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0086_pdv.sql
-- Módulo 71: Ponto de Venda (PDV). Schema `pdv`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §31, o
-- primeiro módulo da Onda Dezoito (Fase 2 — o Vertical 🛒 Varejo &
-- Supermercados, o PRIMEIRO vertical desde a Onda Nove). Nasce sob
-- `vertical_key='retail'` (confirmado na store-taxonomy).
--
-- Taxonomia: Vertical 🛒 Varejo & Supermercados — capacidade *PDV* (§6).
-- Spec: docs/canon/MODULO-PDV-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⚠️ PDV É "INTEGRA-SE POR PADRÃO" (Lei 3) — E ESTA É A DECISÃO DE DONO EXPLÍCITA
-- -----------------------------------------------------------------------------
-- A Lei 3 (README/CLAUDE.md) lista o PDV entre os que "integram-se por padrão;
-- construir só com decisão de dono explícita". O bastão da Onda Dezoito É essa
-- decisão: o cliente inaugural (um supermercado) tem o PDV como DOR VIVA. E o
-- recorte é honesto — ⛔ este módulo registra a VENDA COMERCIAL (o que se
-- vendeu, por quanto, para quem), NÃO o DOCUMENTO FISCAL: não emite NF-e/NFC-e,
-- não assina nada, não fala com a SEFAZ (isso é integração fiscal certificada —
-- a fronteira que a Onda Dezessete já demarcou). A venda vira, um dia, uma
-- NFC-e por integração; aqui ela é o registro do balcão.
--
-- -----------------------------------------------------------------------------
-- ⭐ A IDENTIDADE É A DO `rfq`/`quote` — RE-PERGUNTADA (cabeçalho + itens + congela)
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- venda REUSA a física do `rfq`: um cabeçalho (`pdv.sales`) com linhas
-- (`pdv.sale_items`, FK INTRA-schema), nasce `draft`, e **FINALIZAR CONGELA** os
-- itens — uma venda concluída é aquele cupom, com aquelas linhas. Os fins são
-- TERMINAIS (a física do `proj`/`bud`): venda cancelada não reabre — refazer é
-- venda NOVA.
--
-- ⭐ O DIVERGE do `rfq`: a RFQ tem um meio-termo `open` (foi ao mercado, espera
-- propostas) antes do fim. A VENDA não: ou está sendo montada (`draft`) ou
-- fechou (`completed`/`cancelled`). Não há "venda no mercado" — o cupom fecha na
-- hora. Por isso `draft → completed`/`cancelled`, sem estado intermediário.
--
-- -----------------------------------------------------------------------------
-- ⭐ PROMOÇÕES — um CAMPO, não um módulo (a decisão de recorte, assinada)
-- -----------------------------------------------------------------------------
-- A capacidade *Promoções* do vertical foi re-perguntada: um desconto simples
-- aplicado NA VENDA (valor fixo) é um CAMPO do cupom (`discount_cents`), não um
-- schema à parte. Uma campanha de promoção com VIGÊNCIA e CADASTRO independente
-- da venda (cupom reutilizável, "leve 3 pague 2", faixa de horário) é outra
-- coisa — capacidade FUTURA, declarada FORA. Aqui: só o desconto da venda.
--
-- ⛔ FORA: NF-e/NFC-e e qualquer documento fiscal (integração, Lei 3); *Estoque
-- de varejo* é o `inv` genérico (Módulo 8, saldo calculado do livro) por id
-- solto — não se refaz; *Marketplace próprio* é frente inteira (e-commerce),
-- capacidade futura. O cliente é ID SOLTO ao `crm` (opcional); o produto é ID
-- SOLTO ao `catalog` (opcional) ou texto livre.
-- =============================================================================

create schema if not exists pdv;

comment on schema pdv is
  'Módulo Ponto de Venda (PDV). Vertical retail (Varejo & Supermercados) da Taxonomia. A VENDA COMERCIAL (não o documento fiscal — NF-e/NFC-e é integração, Lei 3): cabeçalho pdv.sales + linhas pdv.sale_items (FK intra-schema). Nasce draft, FINALIZAR congela os itens (a física do rfq), draft → completed/cancelled terminais (a física do proj: venda cancelada não reabre). Promoções = um desconto simples (campo discount_cents); campanha com vigência é FORA. Cliente por id solto ao crm; produto por id solto ao módulo de catálogo (sem FK cruzada). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function pdv.emit_event(
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
  if p_event_type not like 'pdv.%' then
    raise exception 'pdv.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'pdv',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function pdv.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function pdv.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'pdv.sale.manage');
$$;

create or replace function pdv.touch_updated_at()
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
-- 2. SALES — o cabeçalho da venda (o cupom)
-- =============================================================================

create table pdv.sales (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  -- Operador/caixa em TEXTO LIVRE (quem operou o balcão).
  operator       text        not null default '',
  -- ⭐ Método de pagamento em TEXTO LIVRE — dinheiro/cartão/pix é vocabulário do
  -- tenant, e as formas de pagamento mudam. Nunca enum fechado.
  payment_method text        not null default '',
  -- ⭐ Cliente por ID SOLTO ao crm — OPCIONAL (venda de balcão é anônima).
  customer_id    uuid,
  customer_name  text        not null default '',
  -- ⭐ O desconto da venda (a Promoção simples, como CAMPO). >= 0, em centavos.
  discount_cents bigint      not null default 0 check (discount_cents >= 0),
  currency       text        not null default 'BRL' check (length(btrim(currency)) > 0),
  status         text        not null default 'draft'
                 check (status in ('draft', 'completed', 'cancelled')),
  completed_at   timestamptz,
  completed_by   uuid        references auth.users (id) on delete set null,
  cancel_reason  text        not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint pdv_sales_id_tenant unique (id, tenant_id),
  -- ⭐ O estado e o carimbo contam a mesma história: concluída ⇔ tem carimbo de
  -- conclusão; fora de concluída, não há.
  constraint pdv_sales_completed_coherent check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create index pdv_sales_open_idx
  on pdv.sales (tenant_id, created_at desc)
  where status = 'draft';
create index pdv_sales_book_idx
  on pdv.sales (tenant_id, status, created_at desc);

create trigger pdv_sales_touch
  before update on pdv.sales
  for each row execute function pdv.touch_updated_at();

alter table pdv.sales enable row level security;
alter table pdv.sales force row level security;

create policy pdv_sales_select on pdv.sales
  for select to authenticated
  using (pdv.can_access(tenant_id));

create policy pdv_sales_insert on pdv.sales
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pdv.sale.manage'));

create policy pdv_sales_update on pdv.sales
  for update to authenticated
  using (pdv.can_access(tenant_id))
  with check (pdv.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Venda fechada é história de balcão.

create or replace function pdv.guard_sale_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'a venda nasce em rascunho — finalizar é decisão à parte'
      using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger pdv_sales_stamp
  before insert on pdv.sales
  for each row execute function pdv.guard_sale_insert();

-- =============================================================================
-- 3. SALE_ITEMS — as linhas da venda (produto por id solto OU texto livre)
-- =============================================================================

create table pdv.sale_items (
  id               uuid           primary key default gen_random_uuid(),
  tenant_id        uuid           not null,
  sale_id          uuid           not null,
  line_no          integer        not null check (line_no > 0),
  -- ⭐ Produto por ID SOLTO ao catalog — OPCIONAL (nem toda linha vem do
  -- catálogo; o supermercado pode bater um preço avulso).
  product_id       uuid,
  -- O nome do produto carimbado pela tela. Obrigatório (a linha precisa dizer o
  -- que vendeu, tenha ou não vindo do catálogo).
  product_name     text           not null check (length(btrim(product_name)) > 0),
  quantity         numeric(18, 4) not null check (quantity > 0),
  unit_price_cents bigint         not null check (unit_price_cents >= 0),
  created_at       timestamptz    not null default now(),
  constraint pdv_sale_items_line unique (sale_id, line_no),
  constraint pdv_sale_items_sale_fk
    foreign key (sale_id, tenant_id)
    references pdv.sales (id, tenant_id) on delete cascade
);

create index pdv_sale_items_sale_idx on pdv.sale_items (sale_id);

alter table pdv.sale_items enable row level security;
alter table pdv.sale_items force row level security;

create policy pdv_sale_items_select on pdv.sale_items
  for select to authenticated
  using (pdv.can_access(tenant_id));

create policy pdv_sale_items_insert on pdv.sale_items
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pdv.sale.manage'));

create policy pdv_sale_items_update on pdv.sale_items
  for update to authenticated
  using (core.has_permission(tenant_id, 'pdv.sale.manage'))
  with check (core.has_permission(tenant_id, 'pdv.sale.manage'));

create policy pdv_sale_items_delete on pdv.sale_items
  for delete to authenticated
  using (
    core.has_permission(tenant_id, 'pdv.sale.manage')
    and exists (
      select 1 from pdv.sales s
       where s.id = sale_id and s.tenant_id = tenant_id and s.status = 'draft'
    )
  );

-- ⭐ CONGELA: a linha da venda FINALIZADA não muda. Inserir/editar/apagar item
-- só no rascunho — depois de fechar o cupom, refazer é venda nova.
create or replace function pdv.guard_item_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from pdv.sales
   where id = coalesce(new.sale_id, old.sale_id)
     and tenant_id = coalesce(new.tenant_id, old.tenant_id);

  if v_status is distinct from 'draft' then
    raise exception 'a venda já foi fechada (%): os itens não mudam mais — refazer é venda nova', v_status
      using errcode = '22023';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger pdv_sale_items_frozen
  before insert or update or delete on pdv.sale_items
  for each row execute function pdv.guard_item_frozen();

-- =============================================================================
-- 3.1 O TOTAL — VIEW calculada do livro (nunca coluna; a física do inv/cash)
-- -----------------------------------------------------------------------------
-- O bruto é a soma das linhas; o líquido desconta o `discount_cents`. É VIEW
-- com security_invoker: a RLS das tabelas-base decide o que cada tenant vê.
-- =============================================================================

create view pdv.sale_totals
with (security_invoker = true)
as
  select
    s.id                                                   as sale_id,
    s.tenant_id,
    s.currency,
    coalesce(sum(i.quantity * i.unit_price_cents), 0)::bigint as gross_cents,
    s.discount_cents,
    greatest(coalesce(sum(i.quantity * i.unit_price_cents), 0)::bigint - s.discount_cents, 0) as net_cents,
    count(i.id)                                            as item_count
  from pdv.sales s
  left join pdv.sale_items i on i.sale_id = s.id and i.tenant_id = s.tenant_id
  group by s.id, s.tenant_id, s.currency, s.discount_cents;

comment on view pdv.sale_totals is
  'O total da venda — VIEW calculada do livro (bruto = soma das linhas; líquido = bruto − desconto), nunca coluna. security_invoker: a RLS das tabelas-base vale.';

-- =============================================================================
-- 3.2 O PORTEIRO DO ESTADO — finalizar exige itens; cancelar exige razão
-- =============================================================================

create or replace function pdv.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft', 'completed'),
    ('draft', 'cancelled')
  );
$$;

comment on function pdv.allowed_transition(text, text) is
  'Ciclo de vida da venda. Espelho de ALLOWED_TRANSITIONS em @alsham/pdv. draft → completed/cancelled, os dois TERMINAIS (a física do proj/bud: venda cancelada não reabre — refazer é venda nova). Sem estado intermediário (o DIVERGE do rfq, que tem open).';

create or replace function pdv.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not pdv.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da venda: venda cancelada não reabre',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'pdv.sale.manage') then
    raise exception 'mover a venda exige a permissão pdv.sale.manage'
      using errcode = '42501';
  end if;

  -- ⭐ Finalizar exige ao menos um item (não se fecha cupom vazio) e carimba.
  if new.status = 'completed' then
    if not exists (
      select 1 from pdv.sale_items i
       where i.sale_id = new.id and i.tenant_id = new.tenant_id
    ) then
      raise exception 'finalizar a venda exige ao menos um item'
        using errcode = '22023';
    end if;
    new.completed_at := now();
    new.completed_by := (select auth.uid());
  end if;

  -- Cancelar exige razão.
  if new.status = 'cancelled' then
    if length(btrim(new.cancel_reason)) = 0 then
      raise exception 'cancelar a venda exige uma razão'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger pdv_sales_guard_status
  before update of status on pdv.sales
  for each row execute function pdv.guard_status_transition();

-- ⭐ E o cabeçalho (cliente/pagamento/desconto) CONGELA fora do rascunho.
create or replace function pdv.guard_header_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and (new.operator is distinct from old.operator
          or new.payment_method is distinct from old.payment_method
          or new.customer_id is distinct from old.customer_id
          or new.customer_name is distinct from old.customer_name
          or new.discount_cents is distinct from old.discount_cents
          or new.currency is distinct from old.currency) then
    raise exception 'a venda já foi fechada (%): o cabeçalho não muda mais', old.status
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger pdv_sales_header_frozen
  before update on pdv.sales
  for each row execute function pdv.guard_header_frozen();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS — AUTOSSUFICIENTE (inclui as linhas e o total)
-- =============================================================================

create or replace function pdv.sale_payload(p_sale_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sale  pdv.sales;
  v_lines jsonb;
  v_net   bigint;
begin
  select * into v_sale from pdv.sales where id = p_sale_id and tenant_id = p_tenant_id;
  if not found then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineNo',         l.line_no,
      'productId',      l.product_id,
      'productName',    l.product_name,
      'quantity',       l.quantity,
      'unitPriceCents', l.unit_price_cents
    ) order by l.line_no
  ), '[]'::jsonb)
    into v_lines
    from pdv.sale_items l
   where l.sale_id = p_sale_id and l.tenant_id = p_tenant_id;

  select net_cents into v_net from pdv.sale_totals where sale_id = p_sale_id and tenant_id = p_tenant_id;

  return jsonb_build_object(
    'saleId',        v_sale.id,
    'operator',      v_sale.operator,
    'paymentMethod', v_sale.payment_method,
    'customerId',    v_sale.customer_id,
    'customerName',  v_sale.customer_name,
    'discountCents', v_sale.discount_cents,
    'currency',      v_sale.currency,
    'status',        v_sale.status,
    'netCents',      coalesce(v_net, 0),
    'lines',         v_lines
  );
end;
$$;

comment on function pdv.sale_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE da venda — inclui as linhas e o total líquido. Quem escuta não faz join.';

create or replace function pdv.on_sale_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pdv.emit_event(new.tenant_id, 'pdv.sale.registered', pdv.sale_payload(new.id, new.tenant_id));
  return new;
end;
$$;

create trigger pdv_sales_emit_registered
  after insert on pdv.sales
  for each row execute function pdv.on_sale_registered();

create or replace function pdv.on_sale_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is distinct from old.status then
    v_type := case new.status
                when 'completed' then 'pdv.sale.completed'
                when 'cancelled' then 'pdv.sale.cancelled'
                else null
              end;
    if v_type is not null then
      perform pdv.emit_event(new.tenant_id, v_type, pdv.sale_payload(new.id, new.tenant_id));
    end if;
  end if;
  return new;
end;
$$;

create trigger pdv_sales_emit_changed
  after update of status on pdv.sales
  for each row execute function pdv.on_sale_changed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema pdv                  from public, anon, authenticated;
revoke all on all tables    in schema pdv from public, anon, authenticated;
revoke all on all functions in schema pdv from public, anon, authenticated;

grant usage on schema pdv to authenticated;

grant select, insert, update on pdv.sales to authenticated;
grant select, insert, update, delete on pdv.sale_items to authenticated;
grant select on pdv.sale_totals to authenticated;

grant execute on function pdv.can_access(uuid) to authenticated;

-- `pdv.emit_event` NÃO é concedida. `pdv.sale_payload` é encanamento. `anon` nada.

-- =============================================================================
-- FIM. Nenhum documento fiscal (é integração, Lei 3). Nenhum enum de pagamento.
-- Nenhum total em coluna (é VIEW). Nenhum objeto fora de `pdv`. Nenhuma leitura
-- de schema alheio (cliente/produto por id solto). `consumes` VAZIO.
-- =============================================================================
