-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0046_invest.sql
-- Módulo 31: Investimentos. Schema `invest`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §20,
-- depois do `0045_bank.sql`.
--
-- Taxonomia: Domain 💰 Financeiro — capacidade *Investimentos*.
-- Spec: docs/canon/MODULO-INVEST-SPEC.md
--
-- -----------------------------------------------------------------------------
-- A LEI DESTE MÓDULO: A POSIÇÃO É A SOMA DOS ATOS — SEM COTAÇÃO AUTOMÁTICA
-- -----------------------------------------------------------------------------
-- `invest.movements` é um LIVRO de atos imutáveis: APLICAÇÃO (dinheiro que
-- entra), RENDIMENTO (juro/lucro creditado, ENTRADO POR GENTE) e RESGATE
-- (dinheiro que sai). A posição de um investimento é a SOMA desses atos —
-- calculada na leitura, nunca coluna.
--
-- ⭐ **SEM COTAÇÃO AUTOMÁTICA (Lei 3 e Lei 7).** O rendimento NÃO se calcula de
-- uma taxa nem se busca de um provedor de mercado: ele é REGISTRADO quando o
-- extrato do investimento o mostra. Marcar a mercado, projetar rentabilidade e
-- comparar com índice (CDI, Ibovespa) são capacidades de PROVEDOR DE DADOS —
-- integração (Lei 3), declaradas FORA na spec §5. Um número de rendimento que
-- o sistema inventasse de uma taxa seria promessa sem fonte (Lei 7).
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ RESGATAR MAIS QUE A POSIÇÃO É RECUSADO — a TERCEIRA resposta, assinada
-- -----------------------------------------------------------------------------
-- Dois precedentes foram re-perguntados:
--   · o `ar` PERMITE receber a maior (o dinheiro já entrou na conta; recusar
--     obrigaria a mentir sobre o que chegou);
--   · o `inv`/`bank` PERMITEM saldo negativo (o físico e o cheque especial são
--     estados reais).
-- A resposta do investimento é a TERCEIRA, e DIFERENTE das duas: resgatar mais
-- do que a posição é RECUSADO. Não é "o dinheiro já entrou" (não entrou) nem
-- "o saldo pode ficar negativo" (a posição de um fundo NÃO fica negativa — não
-- existe resgatar dinheiro que não está no papel; o custodiante recusa).
-- Permitir seria o livro afirmar dinheiro que nunca esteve lá. Gatilho confere
-- a posição ANTES do resgate. Há teste de contraste ar×inv×invest que assina.
--
-- ⭐ O investimento é DADO DO TENANT: nome, tipo e instituição em texto livre
-- (CDB de um banco, cota de um fundo, um imóvel) — nunca enum de produto. Volta
-- do arquivo (o argumento do crm). `consumes` VAZIO: rendimento é ato de gente.
-- =============================================================================

create schema if not exists invest;

comment on schema invest is
  'Módulo Investimentos. Domain finance da Taxonomia. Livro de atos imutáveis (aplicação, rendimento, resgate); a posição é a soma dos atos, calculada — sem cotação automática. Resgatar mais que a posição é recusado. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima primeira vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function invest.emit_event(
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
  if p_event_type not like 'invest.%' then
    raise exception 'invest.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'invest',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function invest.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function invest.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'invest.holding.manage')
      or core.has_permission(p_tenant_id, 'invest.movement.register');
$$;

create or replace function invest.touch_updated_at()
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
-- 2. HOLDINGS — os investimentos que o tenant cadastra; voltam do arquivo
-- =============================================================================

create table invest.holdings (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  name         text        not null check (length(btrim(name)) > 0),
  -- ⭐ Tipo e instituição em texto livre — nunca enum de produto.
  kind         text        not null default '',
  institution  text        not null default '',
  currency     char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  status       text        not null default 'active'
               check (status in ('active', 'archived')),
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint invest_holdings_id_tenant unique (id, tenant_id)
);

create unique index invest_holdings_unique_active_name
  on invest.holdings (tenant_id, lower(btrim(name)))
  where status = 'active';

create trigger invest_holdings_touch
  before update on invest.holdings
  for each row execute function invest.touch_updated_at();

alter table invest.holdings enable row level security;
alter table invest.holdings force row level security;

create policy invest_holdings_select on invest.holdings
  for select to authenticated
  using (invest.can_access(tenant_id));

create policy invest_holdings_insert on invest.holdings
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'invest.holding.manage'));

create policy invest_holdings_update on invest.holdings
  for update to authenticated
  using (core.has_permission(tenant_id, 'invest.holding.manage'))
  with check (core.has_permission(tenant_id, 'invest.holding.manage'));

-- ⛔ Sem DELETE. Investimento com livro é história; arquivar é status, e volta.

create or replace function invest.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function invest.allowed_transition(text, text) is
  'Ciclo de vida do investimento. Espelho de ALLOWED_TRANSITIONS em @alsham/investments — há teste que lê este arquivo e compara.';

create or replace function invest.guard_holding_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    if new.currency is distinct from old.currency then
      raise exception 'a moeda do investimento não muda: o investimento em outra moeda é outro investimento'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not invest.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do investimento', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger invest_holdings_guard_status
  before update on invest.holdings
  for each row execute function invest.guard_holding_transition();

-- =============================================================================
-- 3. MOVEMENTS — ⭐ O LIVRO DE ATOS, IMUTÁVEL (três camadas)
-- -----------------------------------------------------------------------------
-- APLICAÇÃO e RENDIMENTO somam; RESGATE subtrai. O rendimento é ENTRADO por
-- gente (sem cotação). O resgate não passa da posição (o gatilho confere).
-- =============================================================================

create table invest.movements (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  holding_id          uuid        not null,
  kind                text        not null check (kind in ('application', 'yield', 'redemption')),
  amount_cents        bigint      not null check (amount_cents > 0),
  signed_amount_cents bigint      generated always as (
                        case when kind = 'redemption' then -amount_cents else amount_cents end
                      ) stored,
  currency            char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  note                text        not null default '',
  external_ref        text,
  occurred_on         date        not null default current_date,
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users (id) on delete set null,
  constraint invest_movements_holding_fk
    foreign key (holding_id, tenant_id)
    references invest.holdings (id, tenant_id) on delete restrict,
  -- ⭐ O futuro é recusado (o DIVERGE do inv mantido com o cash/bank).
  constraint invest_movements_not_future check (occurred_on <= current_date)
);

create index invest_movements_ledger_idx
  on invest.movements (tenant_id, holding_id, occurred_on desc, created_at desc);

alter table invest.movements enable row level security;
alter table invest.movements force row level security;

create policy invest_movements_select on invest.movements
  for select to authenticated
  using (invest.can_access(tenant_id));

create policy invest_movements_insert on invest.movements
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'invest.movement.register'));

-- ⛔ Sem policy de UPDATE e sem policy de DELETE — camada 1 da imutabilidade.

create or replace function invest.guard_ledger_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o livro do investimento é registro de fato consumado: não se edita nem se apaga. Corrigir é lançar o ato inverso.'
    using errcode = '42501';
end;
$$;

create trigger invest_movements_immutable
  before update or delete on invest.movements
  for each row execute function invest.guard_ledger_immutable();

-- A holding arquivada não recebe ato; a moeda do ato é a do investimento; e
-- ⭐ o RESGATE não passa da posição (a TERCEIRA resposta).
create or replace function invest.guard_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_currency char(3);
  v_position bigint;
begin
  select status, currency into v_status, v_currency
    from invest.holdings where id = new.holding_id and tenant_id = new.tenant_id;

  if v_status is null then
    raise exception 'investimento % não existe neste tenant', new.holding_id using errcode = '23503';
  end if;
  if v_status <> 'active' then
    raise exception 'investimento arquivado não recebe ato: reative-o primeiro' using errcode = '22023';
  end if;
  if new.currency <> v_currency then
    raise exception 'a moeda do ato (%) não é a do investimento (%)', new.currency, v_currency using errcode = '22023';
  end if;

  -- ⭐⭐ A TERCEIRA RESPOSTA: resgatar mais que a posição é recusado.
  if new.kind = 'redemption' then
    select coalesce(sum(signed_amount_cents), 0) into v_position
      from invest.movements
     where holding_id = new.holding_id and tenant_id = new.tenant_id;
    if new.amount_cents > v_position then
      raise exception 'resgate de % excede a posição de %: não se resgata o que não está no papel', new.amount_cents, v_position
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger invest_movements_guard
  before insert on invest.movements
  for each row execute function invest.guard_movement();

-- =============================================================================
-- 4. A POSIÇÃO — CONSEQUÊNCIA CALCULADA, JAMAIS COLUNA, SEM COTAÇÃO
-- -----------------------------------------------------------------------------
-- ⚠️ security_invoker: sem ela a view somaria a posição de todos os tenants.
-- A posição é a SOMA DOS ATOS registrados — nunca marcação a mercado.
-- =============================================================================

create view invest.positions
  with (security_invoker = true)
as
select m.tenant_id,
       m.holding_id,
       h.name                                                        as holding_name,
       m.currency,
       sum(m.signed_amount_cents)                                    as position_cents,
       sum(case when m.kind = 'application' then m.amount_cents else 0 end) as invested_cents,
       sum(case when m.kind = 'yield'       then m.amount_cents else 0 end) as yield_cents,
       sum(case when m.kind = 'redemption'  then m.amount_cents else 0 end) as redeemed_cents,
       count(*)                                                      as movement_count,
       max(m.occurred_on)                                            as last_movement_on
  from invest.movements m
  join invest.holdings h on h.id = m.holding_id and h.tenant_id = m.tenant_id
 group by m.tenant_id, m.holding_id, h.name, m.currency;

comment on view invest.positions is
  'A posição por investimento = soma dos atos (aplicação + rendimento − resgate). Calculada, nunca coluna. NUNCA marcação a mercado. security_invoker: a RLS decide o que entra.';

-- =============================================================================
-- 5. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function invest.holding_payload(p invest.holdings)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'holdingId',   p.id,
    'name',        p.name,
    'kind',        p.kind,
    'institution', p.institution,
    'currency',    p.currency,
    'status',      p.status
  );
$$;

create or replace function invest.movement_payload(p invest.movements)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'movementId',        p.id,
    'holdingId',         p.holding_id,
    'kind',              p.kind,
    'amountCents',       p.amount_cents,
    'signedAmountCents', p.signed_amount_cents,
    'currency',          p.currency,
    'note',              p.note,
    'externalRef',       p.external_ref,
    'occurredOn',        p.occurred_on
  );
$$;

create or replace function invest.on_holding_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform invest.emit_event(new.tenant_id, 'invest.holding.registered', invest.holding_payload(new));
  return new;
end;
$$;

create trigger invest_holdings_emit_registered
  after insert on invest.holdings
  for each row execute function invest.on_holding_registered();

create or replace function invest.on_holding_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    perform invest.emit_event(new.tenant_id, 'invest.holding.archived', invest.holding_payload(new));
  end if;
  return new;
end;
$$;

create trigger invest_holdings_emit_changed
  after update on invest.holdings
  for each row execute function invest.on_holding_changed();

create or replace function invest.on_movement_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform invest.emit_event(new.tenant_id, 'invest.movement.registered', invest.movement_payload(new));
  return new;
end;
$$;

create trigger invest_movements_emit_registered
  after insert on invest.movements
  for each row execute function invest.on_movement_registered();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema invest                  from public, anon, authenticated;
revoke all on all tables    in schema invest from public, anon, authenticated;
revoke all on all functions in schema invest from public, anon, authenticated;

grant usage on schema invest to authenticated;

grant select, insert, update on invest.holdings to authenticated;

-- ⛔ SÓ SELECT e INSERT no livro. Editar e apagar não existem — camada 2.
grant select, insert on invest.movements to authenticated;

grant select on invest.positions to authenticated;

grant execute on function invest.can_access(uuid) to authenticated;

-- `invest.emit_event` e os payloads são encanamento dos gatilhos, não API de
-- tela. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de posição. Nenhuma cotação de mercado. Nenhuma
-- rentabilidade projetada. Resgate não passa da posição. Nenhum objeto fora
-- de `invest`. Nenhuma leitura de schema alheio.
-- =============================================================================
