-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0029_cash.sql
-- Módulo 14: Fluxo de Caixa. Schema `cash`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §17,
-- depois do `0028_ctr.sql`.
--
-- Taxonomia: Domain 💰 Financeiro — capacidade *Fluxo de caixa*.
-- Spec: docs/canon/MODULO-CASH-SPEC.md
--
-- -----------------------------------------------------------------------------
-- A LEI DESTE MÓDULO: O CAIXA É O LIVRO DO inv NO DINHEIRO
-- -----------------------------------------------------------------------------
-- `cash.entries` é um LIVRO de lançamentos imutável em três camadas (o padrão
-- do `usage_ledger`/`inv.movements`): entrada, saída e ajuste-com-razão. O
-- saldo é SOMA do livro, calculada na leitura — nunca coluna. Corrigir é
-- lançar AJUSTE com razão; **corrigir classificação é estornar e relançar —
-- o livro não se rasura.**
--
-- ⭐ **ESTE MÓDULO É CAIXA, NÃO COMPETÊNCIA** — e a decisão está escrita:
-- `occurred_on` é o dia em que o dinheiro MOVEU. Regime de competência
-- (apropriação, DRE, provisão) é ofício do contador e capacidade própria do
-- Domain (DRE/Balancete na Taxonomia §5) — capacidade futura DECLARADA, nunca
-- meia-entrega aqui.
--
-- ⭐ **O FUTURO É RECUSADO — o DIVERGE consciente do inv.** O livro do
-- estoque aceita qualquer data (o físico já aconteceu quando se registra);
-- aqui um lançamento datado de amanhã não é caixa — é PREVISÃO, e previsão é
-- a capacidade *Orçamento* (Taxonomia §5), não construída. Um caixa que
-- mistura realizado com previsto mente para quem decide com ele.
--
-- -----------------------------------------------------------------------------
-- ⭐ CATEGORIA É DADO DO TENANT — a Lei das Etapas na CLASSIFICAÇÃO
-- -----------------------------------------------------------------------------
-- `cash.categories`: nome LIVRE, ativa/arquivada. JAMAIS plano de contas
-- fixo: plano de contas é do contador (Lei 3 vizinha), e "aluguel/folha/
-- marketing" é vocabulário de uma casa. **Lançamento SEM categoria é
-- PERMITIDO** — obrigar categoria inventa dado: o operador que não sabe
-- classifica errado só para o formulário passar, e o relatório mente melhor
-- do que um "sem categoria" honesto na tela.
--
-- -----------------------------------------------------------------------------
-- ⭐ POR QUE `consumes` É VAZIO — a decisão contra a DUPLA CONTAGEM
-- -----------------------------------------------------------------------------
-- Consumir `ap.payable.*` (liquidação) e `ar.receivable.*` (recebimento) para
-- virar lançamento sozinho é tentador — e é exatamente onde um caixa quebra:
-- o MESMO dinheiro chega por três portas (o fato do módulo, o lançamento
-- manual do operador, e o extrato conciliado no `recon`), e sem uma REGRA DE
-- EXCLUSIVIDADE de fonte + idempotência por documento entre as três, o caixa
-- conta duas vezes SEM ERRO NENHUM. Essa regra ninguém desenhou. Lei 7: sem
-- handler completo, sem promessa — caminho declarado na spec §5.
-- =============================================================================

create schema if not exists cash;

comment on schema cash is
  'Módulo Fluxo de Caixa. Domain finance da Taxonomia. Livro de lançamentos imutável (caixa realizado, nunca previsão); categoria é dado do tenant; saldo calculado. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — décima quarta vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function cash.emit_event(
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
  if p_event_type not like 'cash.%' then
    raise exception 'cash.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'cash',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function cash.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function cash.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'cash.entry.register')
      or core.has_permission(p_tenant_id, 'cash.entry.adjust')
      or core.has_permission(p_tenant_id, 'cash.category.manage');
$$;

create or replace function cash.touch_updated_at()
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
-- 2. CATEGORIES — a classificação que o tenant desenha
-- =============================================================================

create table cash.categories (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references core.tenants (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  status     text        not null default 'active'
             check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint categories_id_tenant unique (id, tenant_id)
);

-- Duas categorias ATIVAS com o mesmo nome só geram engano.
create unique index categories_unique_active_name
  on cash.categories (tenant_id, lower(name))
  where status = 'active';

create trigger categories_touch
  before update on cash.categories
  for each row execute function cash.touch_updated_at();

alter table cash.categories enable row level security;
alter table cash.categories force row level security;

create policy categories_select on cash.categories
  for select to authenticated
  using (cash.can_access(tenant_id));

create policy categories_insert on cash.categories
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'cash.category.manage'));

create policy categories_update on cash.categories
  for update to authenticated
  using (core.has_permission(tenant_id, 'cash.category.manage'))
  with check (core.has_permission(tenant_id, 'cash.category.manage'));

-- ⛔ Sem policy / grant de DELETE. Categoria com livro é história; arquivar
-- é status — e `archived → active` existe (a decisão do crm/inv mantida): a
-- categoria que volta é a MESMA classificação, e partir a série em duas
-- mentiria no gráfico.

create or replace function cash.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function cash.allowed_transition(text, text) is
  'Ciclo de vida da categoria. Espelho de ALLOWED_TRANSITIONS em @alsham/cashflow — há teste que lê este arquivo e compara.';

create or replace function cash.guard_category_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not cash.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da categoria', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger categories_guard_status
  before update of status on cash.categories
  for each row execute function cash.guard_category_transition();

-- =============================================================================
-- 3. ENTRIES — ⭐ O LIVRO, E ELE É IMUTÁVEL (três camadas)
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS:
--   ✅ ENTRA `account` TEXTO LIVRE opcional ("caixa loja", "conta principal").
--      Multi-conta ESTRUTURADA (banco, agência, saldo por conta bancária) é
--      capacidade própria — *Bancos*, Taxonomia §5 — e não se cria FK para
--      módulo que não existe.
--   ✅ ENTRA `category_id` OPCIONAL — ver o cabeçalho.
--   ❌ NÃO ENTRA débito/crédito contábil, plano de contas, centro de custo,
--      rateio, competência, conciliação. Cada um é capacidade PRÓPRIA do
--      Domain Financeiro na Taxonomia — declaradas na spec, nunca meia-entrega.
-- =============================================================================

create table cash.entries (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  kind                text        not null check (kind in ('in', 'out', 'adjustment')),
  amount_cents        bigint      not null,
  -- O sinal é do TIPO, nunca do operador (o desenho do inv).
  signed_amount_cents bigint      generated always as (
                        case when kind = 'out' then -amount_cents else amount_cents end
                      ) stored,
  currency            char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  description         text        not null default '',
  reason              text        not null default '',
  category_id         uuid,
  account             text,
  external_ref        text,
  -- ⭐ O dia em que o dinheiro MOVEU. Aceita passado; RECUSA futuro — ver o
  -- cabeçalho: previsão é Orçamento, não caixa.
  occurred_on         date        not null default current_date,
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users (id) on delete set null,
  constraint entries_category_fk
    foreign key (category_id, tenant_id)
    references cash.categories (id, tenant_id) on delete restrict,
  constraint entries_amount_signal check (
    (kind in ('in', 'out') and amount_cents > 0) or
    (kind = 'adjustment'   and amount_cents <> 0)
  ),
  -- Ajuste sem razão é a linha muda que esconde o desvio (a lição do inv).
  constraint entries_adjustment_reason check (
    kind <> 'adjustment' or length(btrim(reason)) > 0
  ),
  constraint entries_account_not_blank check (
    account is null or length(btrim(account)) > 0
  ),
  constraint entries_not_future check (occurred_on <= current_date)
);

create index entries_ledger_idx
  on cash.entries (tenant_id, occurred_on desc, created_at desc);
create index entries_category_idx
  on cash.entries (tenant_id, category_id)
  where category_id is not null;

alter table cash.entries enable row level security;
alter table cash.entries force row level security;

create policy entries_select on cash.entries
  for select to authenticated
  using (cash.can_access(tenant_id));

-- ⭐ A permissão depende do TIPO (o desenho do inv): registrar entrada/saída
-- é operação; AJUSTAR reescreve a conta — quem conta não é quem confere.
create policy entries_insert on cash.entries
  for insert to authenticated
  with check (
    (kind in ('in', 'out') and core.has_permission(tenant_id, 'cash.entry.register'))
    or
    (kind = 'adjustment'   and core.has_permission(tenant_id, 'cash.entry.adjust'))
  );

-- ⛔ Sem policy de UPDATE e sem policy de DELETE — camada 1 da imutabilidade.

create or replace function cash.guard_ledger_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o livro-caixa é registro de fato consumado: não se edita nem se apaga. Corrigir é lançar um AJUSTE com a razão; reclassificar é estornar e relançar.'
    using errcode = '42501';
end;
$$;

create trigger entries_immutable
  before update or delete on cash.entries
  for each row execute function cash.guard_ledger_immutable();

-- Categoria arquivada não recebe lançamento novo (o desenho do inv).
create or replace function cash.guard_category_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.category_id is null then
    return new;
  end if;

  select status into v_status
    from cash.categories
   where id = new.category_id and tenant_id = new.tenant_id;

  if v_status is distinct from 'active' then
    raise exception 'categoria arquivada não recebe lançamento: reative-a ou lance sem categoria'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger entries_guard_category_active
  before insert on cash.entries
  for each row execute function cash.guard_category_active();

-- =============================================================================
-- 4. O SALDO E AS VISÕES — CONSEQUÊNCIA CALCULADA, JAMAIS COLUNA
-- -----------------------------------------------------------------------------
-- ⚠️ `security_invoker = true` NÃO é detalhe: sem ela a view somaria o caixa
-- de todos os tenants para qualquer um que a lesse.
-- =============================================================================

create view cash.balances
  with (security_invoker = true)
as
select e.tenant_id,
       e.currency,
       sum(e.signed_amount_cents)                                   as balance_cents,
       sum(case when e.signed_amount_cents > 0 then e.signed_amount_cents else 0 end) as inflow_cents,
       sum(case when e.signed_amount_cents < 0 then -e.signed_amount_cents else 0 end) as outflow_cents,
       count(*)                                                     as entry_count,
       max(e.occurred_on)                                           as last_entry_on
  from cash.entries e
 group by e.tenant_id, e.currency;

comment on view cash.balances is
  'O saldo por moeda = soma do livro. Calculado, nunca armazenado. security_invoker: a RLS de entries decide o que entra na soma.';

create view cash.monthly
  with (security_invoker = true)
as
select e.tenant_id,
       date_trunc('month', e.occurred_on)::date                     as month,
       e.currency,
       sum(case when e.signed_amount_cents > 0 then e.signed_amount_cents else 0 end) as inflow_cents,
       sum(case when e.signed_amount_cents < 0 then -e.signed_amount_cents else 0 end) as outflow_cents,
       sum(e.signed_amount_cents)                                   as net_cents
  from cash.entries e
 group by e.tenant_id, 2, e.currency;

comment on view cash.monthly is
  'O fluxo por mês e moeda — entradas, saídas e líquido. Consequência calculada do livro.';

create view cash.by_category
  with (security_invoker = true)
as
select e.tenant_id,
       e.category_id,
       c.name                                                       as category_name,
       e.currency,
       sum(e.signed_amount_cents)                                   as net_cents,
       count(*)                                                     as entry_count
  from cash.entries e
  left join cash.categories c
         on c.id = e.category_id and c.tenant_id = e.tenant_id
 group by e.tenant_id, e.category_id, c.name, e.currency;

comment on view cash.by_category is
  'O fluxo por categoria (o "sem categoria" aparece com category_id nulo — honesto, nunca escondido).';

-- =============================================================================
-- 5. OS FATOS — payload autossuficiente (categoria pelo NOME)
-- =============================================================================

create or replace function cash.category_payload(p cash.categories)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'categoryId', p.id,
    'name',       p.name,
    'status',     p.status
  );
$$;

create or replace function cash.entry_payload(p cash.entries)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category_name text;
begin
  select name into v_category_name
    from cash.categories where id = p.category_id;

  return jsonb_build_object(
    'entryId',           p.id,
    'kind',              p.kind,
    'amountCents',       p.amount_cents,
    'signedAmountCents', p.signed_amount_cents,
    'currency',          p.currency,
    'description',       p.description,
    'reason',            p.reason,
    'categoryId',        p.category_id,
    'categoryName',      v_category_name,
    'account',           p.account,
    'externalRef',       p.external_ref,
    'occurredOn',        p.occurred_on
  );
end;
$$;

comment on function cash.entry_payload(cash.entries) is
  'O envelope de um lançamento — AUTOSSUFICIENTE, com a categoria pelo NOME. Quem escuta não faz join.';

create or replace function cash.on_entry_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cash.emit_event(new.tenant_id, 'cash.entry.registered', cash.entry_payload(new));
  return new;
end;
$$;

create trigger entries_emit_registered
  after insert on cash.entries
  for each row execute function cash.on_entry_registered();

create or replace function cash.on_category_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cash.emit_event(new.tenant_id, 'cash.category.registered', cash.category_payload(new));
  return new;
end;
$$;

create trigger categories_emit_registered
  after insert on cash.categories
  for each row execute function cash.on_category_registered();

-- Reativar emite `updated` (a mesma régua do inv: um ato, um fato); arquivar
-- tem fato próprio porque é a ação "destrutiva" do módulo.
create or replace function cash.on_category_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    perform cash.emit_event(new.tenant_id, 'cash.category.archived', cash.category_payload(new));
    return new;
  end if;

  if new.name is distinct from old.name
     or new.status is distinct from old.status then
    perform cash.emit_event(new.tenant_id, 'cash.category.updated', cash.category_payload(new));
  end if;

  return new;
end;
$$;

create trigger categories_emit_updated
  after update on cash.categories
  for each row execute function cash.on_category_updated();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema cash                  from public, anon, authenticated;
revoke all on all tables    in schema cash from public, anon, authenticated;
revoke all on all functions in schema cash from public, anon, authenticated;

grant usage on schema cash to authenticated;

grant select, insert, update on cash.categories to authenticated;

-- ⛔ SÓ SELECT e INSERT no livro. Editar e apagar não existem — camada 2.
grant select, insert on cash.entries to authenticated;

grant select on cash.balances    to authenticated;
grant select on cash.monthly     to authenticated;
grant select on cash.by_category to authenticated;

grant execute on function cash.can_access(uuid) to authenticated;

-- `cash.emit_event` NÃO é concedida. Os payloads são encanamento dos
-- gatilhos, não API de tela. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhuma coluna de saldo. Nenhum plano de contas.
-- Nenhuma previsão. Nenhum objeto fora de `cash`. Nenhuma leitura de schema
-- alheio.
-- =============================================================================
