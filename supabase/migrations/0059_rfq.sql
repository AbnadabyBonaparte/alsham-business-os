-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0059_rfq.sql
-- Módulo 44: Cotações / RFQ (Request For Quotation). Schema `rfq`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §24, o
-- segundo módulo da Onda Dez (Fase 2 — completar o Domain Compras). Nasce ao
-- lado do `po` (pedidos) e do `vendor` (fornecedores) sob `domain_key='procurement'`.
--
-- Taxonomia: Domain 📦 Compras — capacidade *Cotações* (§5). A Store o exibe na
-- galeria "Domínios Universais", na seção Compras.
-- Spec: docs/canon/MODULO-RFQ-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A IDENTIDADE É A DO `quote` — RE-PERGUNTADA — E O DIVERGE ASSINADO
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A RFQ
-- REUSA a física do `quote`: nasce `draft`, ENVIAR CONGELA o conteúdo (título e
-- itens não mudam mais depois da mesa), e os fins são TERMINAIS (uma cotação
-- decidida é aquele documento, com aquelas linhas — refazer é cotação nova).
--
-- ⭐ O DIVERGE do `quote`: o terminal do `quote` é a RESPOSTA DO CLIENTE
-- (`accepted`/`declined` — quem responde é a contraparte). O terminal da RFQ é
-- a ESCOLHA DO COMPRADOR: `awarded` (o comprador PREMIA um fornecedor, via
-- `awarded_supplier_id` id-solto) ou `cancelled` (nenhum vencedor). No `quote`
-- a empresa PROPÕE e espera a resposta; na RFQ a empresa PERGUNTA ao mercado e
-- DECIDE. O contraste é assinado no `lifecycle.test.ts`: o `quote` tem
-- `sent → accepted`; a RFQ tem `open → awarded`.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA título e itens da cotação em TEXTO LIVRE (item + quantidade +
--      unidade). O que se cota — "cimento CP-II", "hora de consultoria", "sacas
--      de ração" — é vocabulário de cada compra.
--   ❌ NÃO ENTRA catálogo/SKU/NCM, preço-alvo, tabela de preço do fornecedor,
--      recebimento das propostas de preço de cada fornecedor (capacidade
--      futura: a coleta estruturada de cotações por fornecedor é integração/UI
--      própria — aqui a RFQ registra O QUE se pede e QUEM ganhou).
--   ❌ NÃO ENTRA vínculo FK a `vendor` — o vencedor é ID SOLTO + nome carimbado
--      (o `deal` re-perguntado): a RFQ não conhece o schema do fornecedor.
-- =============================================================================

create schema if not exists rfq;

comment on schema rfq is
  'Módulo Cotações (RFQ). Domain procurement (Compras) da Taxonomia. A cotação nasce draft, ENVIAR (draft→open) CONGELA título e itens, e o comprador PREMIA um fornecedor (awarded, id solto) ou CANCELA — os dois fins são terminais. O DIVERGE do quote: lá quem decide é o cliente (accepted/declined); aqui é o comprador (awarded). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — quadragésima quarta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function rfq.emit_event(
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
  if p_event_type not like 'rfq.%' then
    raise exception 'rfq.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'rfq',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function rfq.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function rfq.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'rfq.request.manage')
      or core.has_permission(p_tenant_id, 'rfq.request.award');
$$;

create or replace function rfq.touch_updated_at()
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
-- 2. REQUESTS — o cabeçalho da cotação
-- =============================================================================

create table rfq.requests (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references core.tenants (id) on delete cascade,
  title                text        not null check (length(btrim(title)) > 0),
  description          text        not null default '',
  status               text        not null default 'draft'
                       check (status in ('draft', 'open', 'awarded', 'cancelled')),
  -- ⭐ O VENCEDOR — ID SOLTO (sem FK): a RFQ não conhece o schema do fornecedor.
  -- O nome é carimbado pela tela (o padrão do deal); o carimbo de quando/quem é
  -- do SERVIDOR (§2.2).
  awarded_supplier_id   uuid,
  awarded_supplier_name text        not null default '',
  awarded_at            timestamptz,
  awarded_by            uuid        references auth.users (id) on delete set null,
  cancel_reason         text        not null default '',
  created_at           timestamptz not null default now(),
  created_by           uuid        references auth.users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  constraint rfq_requests_id_tenant unique (id, tenant_id),
  -- ⭐ O estado e o carimbo do vencedor contam a MESMA história, ou um mente:
  -- awarded ⇔ tem fornecedor premiado E carimbo de quando. Fora de awarded,
  -- não há vencedor.
  constraint rfq_requests_award_coherent check (
    (status = 'awarded'
       and awarded_supplier_id is not null
       and awarded_at is not null)
    or
    (status <> 'awarded'
       and awarded_supplier_id is null
       and awarded_at is null)
  )
);

create index rfq_requests_open_idx
  on rfq.requests (tenant_id, created_at desc)
  where status in ('draft', 'open');

create trigger rfq_requests_touch
  before update on rfq.requests
  for each row execute function rfq.touch_updated_at();

alter table rfq.requests enable row level security;
alter table rfq.requests force row level security;

create policy rfq_requests_select on rfq.requests
  for select to authenticated
  using (rfq.can_access(tenant_id));

create policy rfq_requests_insert on rfq.requests
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'rfq.request.manage'));

-- ⚠️ USING = can_access (não award): assim quem só premia ALCANÇA a linha e
-- bate no gatilho, que decide — em vez de a RLS filtrar e o UPDATE afetar 0
-- linhas em silêncio. A decisão de cada transição vive no gatilho (§2.2).
create policy rfq_requests_update on rfq.requests
  for update to authenticated
  using (rfq.can_access(tenant_id))
  with check (rfq.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Cotação decidida é história de compra.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre RASCUNHO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function rfq.guard_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'a cotação nasce em rascunho — enviar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger rfq_requests_stamp
  before insert on rfq.requests
  for each row execute function rfq.guard_request_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/rfq
-- -----------------------------------------------------------------------------
-- ⭐ draft→open (enviar), draft→cancelled, open→awarded, open→cancelled.
-- awarded e cancelled são TERMINAIS (a identidade do quote). O DIVERGE do
-- quote: aqui o terminal é a ESCOLHA DO COMPRADOR (awarded), não a resposta do
-- cliente (accepted/declined).

create or replace function rfq.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft', 'open'),
    ('draft', 'cancelled'),
    ('open',  'awarded'),
    ('open',  'cancelled')
  );
$$;

comment on function rfq.allowed_transition(text, text) is
  'Ciclo de vida da cotação. Espelho de ALLOWED_TRANSITIONS em @alsham/rfq — há teste que lê este arquivo e compara. awarded e cancelled são TERMINAIS: refazer é cotação nova. O DIVERGE do quote: o terminal é a ESCOLHA DO COMPRADOR (awarded), não a resposta do cliente.';

-- O porteiro que lê request_lines nasce DEPOIS da tabela de linhas (§3).

-- =============================================================================
-- 3. REQUEST_LINES — os itens cotados (texto livre, sem catálogo — molde do quote)
-- =============================================================================

create table rfq.request_lines (
  id          uuid           primary key default gen_random_uuid(),
  tenant_id   uuid           not null,
  request_id  uuid           not null,
  line_no     integer        not null check (line_no > 0),
  item        text           not null check (length(btrim(item)) > 0),
  quantity    numeric(18, 4) not null check (quantity > 0),
  -- Unidade em TEXTO LIVRE ("kg", "h", "un", "m³") — opcional.
  unit        text           not null default '',
  created_at  timestamptz    not null default now(),
  constraint rfq_request_lines_line unique (request_id, line_no),
  constraint rfq_request_lines_request_fk
    foreign key (request_id, tenant_id)
    references rfq.requests (id, tenant_id) on delete cascade
);

create index rfq_request_lines_request_idx on rfq.request_lines (request_id);

alter table rfq.request_lines enable row level security;
alter table rfq.request_lines force row level security;

create policy rfq_request_lines_select on rfq.request_lines
  for select to authenticated
  using (rfq.can_access(tenant_id));

create policy rfq_request_lines_insert on rfq.request_lines
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'rfq.request.manage'));

create policy rfq_request_lines_update on rfq.request_lines
  for update to authenticated
  using (core.has_permission(tenant_id, 'rfq.request.manage'))
  with check (core.has_permission(tenant_id, 'rfq.request.manage'));

-- Linha sai SÓ do rascunho: o que foi enviado ao mercado não se apaga.
create policy rfq_request_lines_delete on rfq.request_lines
  for delete to authenticated
  using (
    core.has_permission(tenant_id, 'rfq.request.manage')
    and exists (
      select 1 from rfq.requests r
       where r.id = request_id and r.tenant_id = tenant_id and r.status = 'draft'
    )
  );

-- ⭐ E a linha da cotação ENVIADA não muda: mudar o item ou a quantidade depois
-- de a cotação ir ao mercado reescreveria o que foi perguntado. O porteiro
-- recusa INSERT/UPDATE/DELETE fora do rascunho.
create or replace function rfq.guard_line_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from rfq.requests
   where id = coalesce(new.request_id, old.request_id)
     and tenant_id = coalesce(new.tenant_id, old.tenant_id);

  if v_status is distinct from 'draft' then
    raise exception 'a cotação já foi enviada (%): os itens não mudam mais — refazer é cotação nova', v_status
      using errcode = '22023';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger rfq_request_lines_frozen
  before insert or update or delete on rfq.request_lines
  for each row execute function rfq.guard_line_frozen();

-- =============================================================================
-- 3.1 O PORTEIRO DO ESTADO — e o carimbo do prêmio (depois de request_lines)
-- =============================================================================

create or replace function rfq.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not rfq.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da cotação: refazer é cotação nova',
      old.status, new.status
      using errcode = '22023';
  end if;

  -- Enviar exige conteúdo: cotação sem item não vai ao mercado. (manage basta —
  -- a policy de UPDATE já garante can_access; enviar é ato de quem gere.)
  if new.status = 'open' and old.status = 'draft' then
    if not core.has_permission(new.tenant_id, 'rfq.request.manage') then
      raise exception 'enviar a cotação exige a permissão rfq.request.manage'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from rfq.request_lines l
       where l.request_id = new.id and l.tenant_id = new.tenant_id
    ) then
      raise exception 'enviar a cotação exige ao menos um item'
        using errcode = '22023';
    end if;
  end if;

  -- ⭐ PREMIAR é a decisão do comprador: exige `award`, o fornecedor vencedor
  -- (id solto) NÃO pode ser nulo, e o carimbo de quem/quando é do SERVIDOR — a
  -- tela não escolhe autor nem hora.
  if new.status = 'awarded' then
    if not core.has_permission(new.tenant_id, 'rfq.request.award') then
      raise exception 'premiar um fornecedor exige a permissão rfq.request.award'
        using errcode = '42501';
    end if;
    if new.awarded_supplier_id is null then
      raise exception 'premiar exige escolher o fornecedor vencedor (awarded_supplier_id)'
        using errcode = '22023';
    end if;
    new.awarded_at := now();
    new.awarded_by := (select auth.uid());
  end if;

  -- Cancelar (encerrar sem vencedor) exige razão — e é a ação de quem gere.
  if new.status = 'cancelled' then
    if not core.has_permission(new.tenant_id, 'rfq.request.manage') then
      raise exception 'cancelar a cotação exige a permissão rfq.request.manage'
        using errcode = '42501';
    end if;
    if length(btrim(new.cancel_reason)) = 0 then
      raise exception 'cancelar a cotação exige uma razão'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger rfq_requests_guard_status
  before update of status on rfq.requests
  for each row execute function rfq.guard_status_transition();

-- ⭐ E o conteúdo (título/descrição) CONGELA quando a cotação sai do rascunho:
-- só editável enquanto draft. O status muda por caminho próprio (§3.1); aqui
-- barra-se a mudança de identidade fora da mesa.
create or replace function rfq.guard_content_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and (new.title is distinct from old.title
          or new.description is distinct from old.description) then
    raise exception 'a cotação já foi enviada (%): título e descrição não mudam mais', old.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger rfq_requests_content_frozen
  before update on rfq.requests
  for each row execute function rfq.guard_content_frozen();

-- =============================================================================
-- 4. PAYLOAD + EVENTOS
-- -----------------------------------------------------------------------------
-- ⭐ O PAYLOAD É AUTOSSUFICIENTE — inclui os itens e o carimbo do prêmio. Quem
-- escuta (um dia, o AP ou o vendor) não faz join.
-- =============================================================================

create or replace function rfq.request_payload(p_request_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request rfq.requests;
  v_lines   jsonb;
begin
  select * into v_request
    from rfq.requests
   where id = p_request_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'lineNo',   l.line_no,
      'item',     l.item,
      'quantity', l.quantity,
      'unit',     l.unit
    ) order by l.line_no
  ), '[]'::jsonb)
    into v_lines
    from rfq.request_lines l
   where l.request_id = p_request_id
     and l.tenant_id = p_tenant_id;

  return jsonb_build_object(
    'title',               v_request.title,
    'description',         v_request.description,
    'status',              v_request.status,
    'awardedSupplierId',   v_request.awarded_supplier_id,
    'awardedSupplierName', v_request.awarded_supplier_name,
    'awardedAt',           v_request.awarded_at,
    'cancelReason',        v_request.cancel_reason,
    'lines',               v_lines
  );
end;
$$;

comment on function rfq.request_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE da cotação — inclui os itens e o carimbo do prêmio. Quem escuta não faz join.';

create or replace function rfq.on_request_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Itens ainda podem não existir no INSERT do cabeçalho; o envio emite o
  -- payload completo depois.
  perform rfq.emit_event(
    new.tenant_id,
    'rfq.request.registered',
    rfq.request_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger rfq_requests_emit_registered
  after insert on rfq.requests
  for each row execute function rfq.on_request_registered();

-- Cada fim de linha tem fato próprio. Não há evento de edição de rascunho: só
-- os quatro fatos declarados no manifesto (Lei 7 — sem consumidor, sem excesso).
create or replace function rfq.on_request_changed()
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
                when 'open'      then 'rfq.request.opened'
                when 'awarded'   then 'rfq.request.awarded'
                when 'cancelled' then 'rfq.request.cancelled'
                else null
              end;
    if v_type is not null then
      perform rfq.emit_event(new.tenant_id, v_type, rfq.request_payload(new.id, new.tenant_id));
    end if;
  end if;

  return new;
end;
$$;

create trigger rfq_requests_emit_changed
  after update of status on rfq.requests
  for each row execute function rfq.on_request_changed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema rfq                  from public, anon, authenticated;
revoke all on all tables    in schema rfq from public, anon, authenticated;
revoke all on all functions in schema rfq from public, anon, authenticated;

grant usage on schema rfq to authenticated;

grant select, insert, update on rfq.requests to authenticated;
grant select, insert, update, delete on rfq.request_lines to authenticated;

grant execute on function rfq.can_access(uuid) to authenticated;

-- `rfq.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `rfq.request_payload` NÃO é concedida: é encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de item. Nenhum nome de cliente. Nenhum
-- objeto fora de `rfq`. Nenhuma leitura de schema alheio. `consumes` VAZIO.
-- =============================================================================
