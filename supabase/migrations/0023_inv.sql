-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0023_inv.sql
-- Módulo 8: Estoque. Schema `inv`.
-- =============================================================================
--
-- NÃO APLICADO. `0001`→`0014` (+ seed) em produção (informado pelo dono);
-- `0017`→`0022` são arquivo na main. Lacuna `0015`/`0016` proposital.
-- Aplicar é ato do dono — ver docs/runbook/APLICAR.md §16.
--
-- Taxonomia: Domain 🏭 Operações — capacidade *Estoque*.
-- Spec: docs/canon/MODULO-INV-SPEC.md
--
-- -----------------------------------------------------------------------------
-- A LEI DESTE MÓDULO: O ESTOQUE É UM LIVRO, NÃO UM NÚMERO
-- -----------------------------------------------------------------------------
-- **O saldo NÃO é coluna. Não existe `items.quantity` neste arquivo, e não
-- pode existir em nenhum futuro.** O que existe é `inv.movements` — um LIVRO
-- DE MOVIMENTOS imutável, no padrão do `usage_ledger` do kraken-v2 (PROVADO,
-- com assinante pagante) e da trilha do `ops` (três camadas). O saldo é a SOMA
-- do livro, calculada na leitura (`inv.balances`).
--
-- A razão é a mesma do livro-caixa (`0003_billing.sql`): um número editável
-- esquece como chegou lá. Corrigir não é editar — é lançar um movimento de
-- AJUSTE, com razão obrigatória, que fica no livro para sempre.
--
-- -----------------------------------------------------------------------------
-- POR QUE O `module_id` É `inv`
-- -----------------------------------------------------------------------------
-- Cinto de emit_event: eventos `inv.*` ⇒ id `inv`. Pacote @alsham/inventory.
-- `estoque` seria impossível de manter no padrão `<moduleId>.<agregado>.<fato>`
-- em inglês do CORE-SPEC, e `stock` colide com vocabulário de mercado
-- financeiro. `inv` é curto, greppável e não é palavra do idioma da casa.
--
-- -----------------------------------------------------------------------------
-- ESPELHO CONSCIENTE (kraken-ledger / ops / crm / ar) — MANTIDO × DIVERGE
-- -----------------------------------------------------------------------------
-- MANTIDO do ledger (0003): linha imutável; correção é lançamento novo, nunca
--   edição; o total é soma, nunca coluna.
-- MANTIDO do crm: `archived → active` existe — o item que volta é o MESMO
--   item, e obrigá-lo a nascer de novo partiria o livro em dois.
-- MANTIDO do ops: imutabilidade em TRÊS camadas (sem policy, sem grant,
--   trigger que recusa até para o dono do banco).
-- ⭐ DIVERGE (re-perguntando o overpay do `ar`): **SALDO NEGATIVO É
--   PERMITIDO.** Ver §4.1 — é a decisão mais importante deste arquivo.
-- ⭐ DIVERGE do po: aqui NÃO há pedido, cotação nem fornecedor. Item é
--   descrição + unidade + SKU OPCIONAL do tenant. Catálogo rico (NCM,
--   categoria em árvore, foto) é capacidade futura DECLARADA (spec §6).
-- =============================================================================

create schema if not exists inv;

comment on schema inv is
  'Módulo Estoque. Domain operations da Taxonomia. Livro de movimentos imutável; saldo calculado. Não cria objeto em core nem lê schema alheio; fala só por core.event_outbox.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — oitava vez que este bloco aparece. O padrão é lei.
-- =============================================================================

create or replace function inv.emit_event(
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
  if p_event_type not like 'inv.%' then
    raise exception 'inv.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'inv',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function inv.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function inv.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'inv.item.manage')
      or core.has_permission(p_tenant_id, 'inv.movement.register')
      or core.has_permission(p_tenant_id, 'inv.movement.adjust');
$$;

create or replace function inv.touch_updated_at()
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
-- 2. ITEMS — o que se guarda
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS:
--   ✅ ENTRA `description` TEXTO LIVRE — o que é este item, nas palavras do
--      tenant. "Parafuso 8mm", "Tinta acrílica branca 18L", "Camiseta P".
--   ✅ ENTRA `unit` TEXTO LIVRE — "un", "kg", "caixa", "m²", "hora". Um enum
--      de unidades congelaria o comércio de um setor no schema de todos.
--   ✅ ENTRA `sku` OPCIONAL, do tenant, SEM FORMATO. Quem tem código usa o
--      seu; quem não tem não é obrigado a inventar um. Único por tenant
--      quando informado — dois itens com o mesmo código só geram engano.
--   ❌ NÃO ENTRA NCM, CEST, EAN/GTIN, categoria em árvore, foto, custo médio,
--      preço de venda, fornecedor preferencial, estoque mínimo. Cada um é uma
--      capacidade própria (catálogo rico, custeio, compras) — capacidades
--      futuras DECLARADAS na spec, nunca meia-entrega aqui. `Estoque mínimo`,
--      em particular, é capacidade de COMPRAS na Taxonomia, não deste Domain.
--   ❌ NÃO ENTRA depósito/local ESTRUTURADO. O local do MOVIMENTO é texto
--      livre opcional (§3); multi-depósito com cadastro é capacidade futura.
-- =============================================================================

create table inv.items (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  description text        not null check (length(btrim(description)) > 0),
  unit        text        not null check (length(btrim(unit)) > 0),
  sku         text,
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint items_id_tenant unique (id, tenant_id),
  constraint items_sku_not_blank check (sku is null or length(btrim(sku)) > 0)
);

-- SKU único por tenant QUANDO informado. Parcial: quem não usa SKU não paga
-- por ele. `lower()` porque "ABC-1" e "abc-1" no mesmo tenant são engano.
create unique index items_unique_sku
  on inv.items (tenant_id, lower(sku))
  where sku is not null;

create index items_active_idx
  on inv.items (tenant_id, description)
  where status = 'active';

create trigger items_touch
  before update on inv.items
  for each row execute function inv.touch_updated_at();

alter table inv.items enable row level security;
alter table inv.items force row level security;

create policy items_select on inv.items
  for select to authenticated
  using (inv.can_access(tenant_id));

create policy items_insert on inv.items
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'inv.item.manage'));

create policy items_update on inv.items
  for update to authenticated
  using (core.has_permission(tenant_id, 'inv.item.manage'))
  with check (core.has_permission(tenant_id, 'inv.item.manage'));

-- ⛔ Sem policy / grant de DELETE. Item com livro é história; arquivar é status.

-- -----------------------------------------------------------------------------
-- 2.1 Transições do item — espelho de ALLOWED_TRANSITIONS em @alsham/inventory
-- -----------------------------------------------------------------------------
-- ⭐ `archived → active` EXISTE, e é a decisão do Módulo 4 re-perguntada: o
-- item que volta ao catálogo é o MESMO item, e o livro dele é UM livro.
-- Obrigar um item novo partiria o histórico em dois — e o saldo junto.

create or replace function inv.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function inv.allowed_transition(text, text) is
  'Ciclo de vida do item. Espelho de ALLOWED_TRANSITIONS em @alsham/inventory — há teste que lê este arquivo e compara.';

create or replace function inv.guard_item_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not inv.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do item', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger items_guard_status
  before update of status on inv.items
  for each row execute function inv.guard_item_transition();

-- =============================================================================
-- 3. MOVEMENTS — ⭐ O LIVRO, E ELE É IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Cada entrada, saída e ajuste é UMA linha aqui, para sempre. É o padrão de
-- três camadas do `crm.interactions` e do `ops.order_events`:
--
--   1. sem policy de UPDATE nem de DELETE — a RLS nega por ausência;
--   2. sem GRANT de UPDATE nem de DELETE — a porta não existe;
--   3. um trigger que levanta erro nas duas — para quem rodar como dono do
--      banco, onde as duas primeiras não valem.
--
-- Diferente da trilha do `ops` e igual à interação do `crm`, o INSERT direto é
-- permitido: aqui o fato É o próprio dado, e a permissão do ato é conferível
-- na policy (o TIPO do movimento decide qual permissão — ver a policy).
--
-- ⭐ **O AJUSTE EXIGE RAZÃO.** "Ajuste" sem motivo é o buraco por onde todo
-- estoque do mundo vaza: a constraint recusa a linha muda. Entrada e saída
-- têm razão opcional — receber mercadoria é autoexplicativo; sumir 10 caixas
-- não é.
--
-- ⭐ **O SINAL É DO TIPO, nunca do operador.** `quantity` é sempre positiva em
-- entrada e saída — o sinal nasce de `signed_quantity`, coluna gerada. Só o
-- AJUSTE aceita quantidade negativa, porque ajustar para menos é o caso
-- clássico (quebra, perda, contagem que achou menos).
-- =============================================================================

create table inv.movements (
  id              uuid           primary key default gen_random_uuid(),
  tenant_id       uuid           not null references core.tenants (id) on delete cascade,
  item_id         uuid           not null,
  kind            text           not null check (kind in ('in', 'out', 'adjustment')),
  quantity        numeric(18, 4) not null,
  -- O sinal vem do TIPO. Quem lê o livro soma esta coluna, e só esta.
  signed_quantity numeric(18, 4) generated always as (
                    case when kind = 'out' then -quantity else quantity end
                  ) stored,
  -- Por que este movimento existe. OBRIGATÓRIA no ajuste.
  reason          text           not null default '',
  -- Nota, pedido, ordem, romaneio — a referência do MUNDO, opaca para nós.
  external_ref    text,
  -- ⭐ TEXTO LIVRE opcional: "depósito 1", "loja centro", "prateleira B3".
  -- Multi-depósito estruturado é capacidade futura declarada (spec §6).
  location        text,
  -- Quando o movimento FÍSICO aconteceu. O livro aceita registrar o passado —
  -- a mercadoria entra no sábado e o registro acontece na segunda.
  occurred_at     timestamptz    not null default now(),
  created_at      timestamptz    not null default now(),
  created_by      uuid           references auth.users (id) on delete set null,
  constraint movements_item_fk
    foreign key (item_id, tenant_id)
    references inv.items (id, tenant_id) on delete restrict,
  -- Entrada e saída são sempre positivas; ajuste é qualquer coisa menos zero.
  constraint movements_quantity_signal check (
    (kind in ('in', 'out') and quantity > 0) or
    (kind = 'adjustment'   and quantity <> 0)
  ),
  -- Ajuste sem razão é a linha muda que esconde o desvio.
  constraint movements_adjustment_reason check (
    kind <> 'adjustment' or length(btrim(reason)) > 0
  ),
  constraint movements_location_not_blank check (
    location is null or length(btrim(location)) > 0
  )
);

create index movements_ledger_idx
  on inv.movements (tenant_id, item_id, occurred_at desc);
create index movements_location_idx
  on inv.movements (tenant_id, location)
  where location is not null;

alter table inv.movements enable row level security;
alter table inv.movements force row level security;

create policy movements_select on inv.movements
  for select to authenticated
  using (inv.can_access(tenant_id));

-- ⭐ A permissão depende do TIPO do movimento: registrar entrada/saída é
-- operação (`inv.movement.register`); AJUSTAR é mão mais pesada
-- (`inv.movement.adjust`) — ajuste é o movimento que reescreve a contagem, e
-- quem conta não é necessariamente quem confere.
create policy movements_insert on inv.movements
  for insert to authenticated
  with check (
    (kind in ('in', 'out') and core.has_permission(tenant_id, 'inv.movement.register'))
    or
    (kind = 'adjustment'   and core.has_permission(tenant_id, 'inv.movement.adjust'))
  );

-- ⛔ Sem policy de UPDATE e sem policy de DELETE — camada 1 da imutabilidade.

-- Camada 3: o erro com nome, para quem roda como dono do banco.
create or replace function inv.guard_ledger_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o livro de movimentos é registro de fato consumado: não se edita nem se apaga. Corrigir é lançar um AJUSTE com a razão.'
    using errcode = '42501';
end;
$$;

create trigger movements_immutable
  before update or delete on inv.movements
  for each row execute function inv.guard_ledger_immutable();

-- Item arquivado não movimenta: o arquivo diz "este item saiu de uso", e um
-- livro que continua andando desdiz o arquivo. Reativar (`archived → active`)
-- é uma linha de UPDATE — e o livro continua sendo UM.
create or replace function inv.guard_item_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
    from inv.items
   where id = new.item_id and tenant_id = new.tenant_id;

  if v_status is distinct from 'active' then
    raise exception 'item arquivado não movimenta: reative-o para lançar no livro'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger movements_guard_item_active
  before insert on inv.movements
  for each row execute function inv.guard_item_active();

-- =============================================================================
-- 4. O SALDO — CONSEQUÊNCIA CALCULADA, JAMAIS COLUNA
-- -----------------------------------------------------------------------------
-- ⚠️ `security_invoker = true` NÃO é detalhe: view em Postgres roda como o
-- DONO por padrão, e o dono atravessa a RLS. Sem esta linha, a view somaria o
-- estoque de todos os tenants para qualquer um que a lesse.
-- =============================================================================

create view inv.balances
  with (security_invoker = true)
as
select m.tenant_id,
       m.item_id,
       sum(m.signed_quantity)  as balance,
       count(*)                as movement_count,
       max(m.occurred_at)      as last_movement_at
  from inv.movements m
 group by m.tenant_id, m.item_id;

comment on view inv.balances is
  'O saldo por item = soma do livro. Calculado, nunca armazenado. security_invoker: a RLS de movements decide o que entra na soma.';

-- Saldo por item E local, para quem informa o local. Movimento sem local cai
-- no local nulo — o que é honesto: o livro não sabe onde essa quantidade está.
create view inv.balances_by_location
  with (security_invoker = true)
as
select m.tenant_id,
       m.item_id,
       m.location,
       sum(m.signed_quantity)  as balance,
       count(*)                as movement_count,
       max(m.occurred_at)      as last_movement_at
  from inv.movements m
 group by m.tenant_id, m.item_id, m.location;

comment on view inv.balances_by_location is
  'O saldo por item e local (texto livre). Movimento sem local soma no local nulo.';

-- -----------------------------------------------------------------------------
-- 4.1 ⭐⭐ A DECISÃO: SALDO NEGATIVO É PERMITIDO
-- -----------------------------------------------------------------------------
-- O overpay do `ar` (0010 §2.1), re-perguntado para o físico — e a resposta é
-- a mesma, pelo mesmo teste: **recusar obrigaria o operador a MENTIR?**
--
-- A mercadoria saiu do balcão. O cliente levou. O registro da saída chega ao
-- sistema DEPOIS do fato — e às vezes chega antes da entrada que a cobriria,
-- porque a nota do fornecedor atrasou, porque a contagem inicial nunca foi
-- lançada, porque o livro começou no meio da vida da empresa. Se o banco
-- recusasse a saída "por falta de saldo", o operador teria de inventar uma
-- entrada falsa para conseguir registrar uma saída verdadeira.
--
-- Um sistema que obriga o operador a mentir para funcionar é pior do que um
-- sistema que aceita a verdade e a MOSTRA: o saldo negativo aparece na tela
-- com o estado `negative`, vermelho, dizendo "o livro está incompleto ou algo
-- sumiu — investigue". A correção é humana: um AJUSTE com razão, que fica no
-- livro para sempre.
--
-- ⚠️ Isto NÃO é "o po estava errado" ao recusar receber em pedido cancelado:
-- lá o sistema recusa o que ELE controla (o fluxo do pedido); aqui ele aceita
-- o que o MUNDO impõe (o físico já saiu). Mesmo critério do par ap × ar.
-- =============================================================================

-- =============================================================================
-- 5. OS FATOS QUE ESTE MÓDULO CONTA
-- -----------------------------------------------------------------------------
-- ⭐ O PAYLOAD É AUTOSSUFICIENTE. Quem escuta não pode fazer join: leva a
-- descrição e a unidade do item, nunca só o id — e o movimento leva o SALDO
-- RESULTANTE, somado no instante do fato, porque o ouvinte não tem como somar
-- um livro que não pode ler.
-- =============================================================================

create or replace function inv.item_payload(p inv.items)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'itemId',      p.id,
    'description', p.description,
    'unit',        p.unit,
    'sku',         p.sku,
    'status',      p.status
  );
$$;

comment on function inv.item_payload(inv.items) is
  'O envelope de um item — AUTOSSUFICIENTE. Quem escuta não pode fazer join.';

create or replace function inv.movement_payload(p inv.movements)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item    inv.items;
  v_balance numeric;
begin
  select * into v_item from inv.items where id = p.item_id;

  select coalesce(sum(m.signed_quantity), 0) into v_balance
    from inv.movements m
   where m.item_id = p.item_id and m.tenant_id = p.tenant_id;

  return jsonb_build_object(
    'movementId',     p.id,
    'itemId',         p.item_id,
    'itemDescription', v_item.description,
    'unit',           v_item.unit,
    'sku',            v_item.sku,
    'kind',           p.kind,
    'quantity',       p.quantity,
    'signedQuantity', p.signed_quantity,
    'reason',         p.reason,
    'externalRef',    p.external_ref,
    'location',       p.location,
    'occurredAt',     p.occurred_at,
    -- O saldo do item DEPOIS deste movimento, somado agora, no livro inteiro.
    'balanceAfter',   v_balance
  );
end;
$$;

comment on function inv.movement_payload(inv.movements) is
  'O envelope de um movimento — AUTOSSUFICIENTE, com o item pelo NOME e o saldo resultante. Quem escuta não pode somar um livro que não lê.';

-- 5.1 `inv.item.registered`
create or replace function inv.on_item_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform inv.emit_event(new.tenant_id, 'inv.item.registered', inv.item_payload(new));
  return new;
end;
$$;

create trigger items_emit_registered
  after insert on inv.items
  for each row execute function inv.on_item_registered();

-- 5.2 `inv.item.updated` / `inv.item.archived` — só o que MUDA O FATO.
--
-- ⚠️ Reativar (`archived → active`) emite `updated`, não um fato próprio:
-- o item voltou ao catálogo com a MESMA identidade, e dois fatos para um ato
-- fariam todo consumidor contar duas vezes. Arquivar tem fato próprio porque
-- é a ação "destrutiva" do módulo — quem escuta precisa distingui-la.
create or replace function inv.on_item_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    perform inv.emit_event(new.tenant_id, 'inv.item.archived', inv.item_payload(new));
    return new;
  end if;

  if new.description is distinct from old.description
     or new.unit    is distinct from old.unit
     or new.sku     is distinct from old.sku
     or new.status  is distinct from old.status then
    perform inv.emit_event(new.tenant_id, 'inv.item.updated', inv.item_payload(new));
  end if;

  return new;
end;
$$;

create trigger items_emit_updated
  after update on inv.items
  for each row execute function inv.on_item_updated();

-- 5.3 `inv.movement.registered` — o fato central do módulo.
create or replace function inv.on_movement_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform inv.emit_event(new.tenant_id, 'inv.movement.registered', inv.movement_payload(new));
  return new;
end;
$$;

create trigger movements_emit_registered
  after insert on inv.movements
  for each row execute function inv.on_movement_registered();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- -----------------------------------------------------------------------------
-- ⛔ Lição do 0022, aplicada NO PRÓPRIO ARQUIVO: função nasce ABERTA a PUBLIC
-- no Postgres. O revoke abaixo vem DEPOIS de toda função deste schema — quem
-- acrescentar função depois dele revoga de novo antes de conceder.
-- =============================================================================

revoke all on schema inv                  from public, anon, authenticated;
revoke all on all tables    in schema inv from public, anon, authenticated;
revoke all on all functions in schema inv from public, anon, authenticated;

grant usage on schema inv to authenticated;

grant select, insert, update on inv.items to authenticated;

-- ⛔ SÓ SELECT e INSERT no livro. Editar e apagar não existem — camada 2.
grant select, insert on inv.movements to authenticated;

grant select on inv.balances             to authenticated;
grant select on inv.balances_by_location to authenticated;

grant execute on function inv.can_access(uuid) to authenticated;

-- `inv.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `inv.movement_payload` / `inv.item_payload` não são concedidas: são
-- encanamento dos gatilhos, não API de tela.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma coluna de saldo. Nenhum objeto fora de `inv`.
-- Nenhuma leitura de schema alheio.
-- =============================================================================
