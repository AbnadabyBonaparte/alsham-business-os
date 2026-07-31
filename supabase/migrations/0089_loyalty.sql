-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0089_loyalty.sql
-- Módulo 74: Fidelidade. Schema `loyalty`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §31, o
-- QUARTO e ÚLTIMO módulo da Onda Dezoito (Fase 2 — o Vertical 🛒 Varejo &
-- Supermercados). Nasce sob `vertical_key='retail'` (confirmado na
-- store-taxonomy).
--
-- Taxonomia: Vertical 🛒 Varejo & Supermercados — capacidade *Fidelidade* (§6).
-- Spec: docs/canon/MODULO-LOYALTY-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE É — O LIVRO DE PONTOS, LANÇAMENTO IMUTÁVEL (a física do timesheet)
-- -----------------------------------------------------------------------------
-- Cada movimento de pontos é um FATO CONSUMADO: o cliente ganhou X pontos numa
-- compra, ou resgatou Y numa troca. O registro nasce pronto — para sempre. É a
-- MESMA física do `timesheet`/`pcost`/`cash`: NÃO tem coluna de status, não tem
-- ciclo de vida, não tem transição, não tem `updated_at`. O cliente não tem
-- porta de UPDATE nem DELETE (nem policy, nem grant); e o gatilho recusa a
-- reescrita até para o dono do banco. Corrigir é lançar OUTRO movimento (o ato
-- inverso), nunca reescrever.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O DIVERGE ASSINADO — loyalty × pcost/timesheet: a DIREÇÃO mora no TIPO
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O que
-- se MANTÉM do `timesheet`/`pcost`: livro imutável, número estritamente > 0,
-- carimbo do servidor. O que DIVERGE:
--
--   • O `timesheet` acumula numa direção só (horas somam); o `pcost` é livro de
--     gasto (`<> 0`). O `loyalty` tem DUAS direções — GANHAR e RESGATAR — e a
--     direção mora numa coluna de TIPO (`entry_type` CHECK `earn`/`redeem`), não
--     no sinal do número. É a "sinal do tipo" do `cash`, re-perguntada para os
--     pontos: `points` é SEMPRE > 0, e o que soma ou subtrai é o TIPO.
--   • Consequência: o saldo é `Σ(earn) − Σ(redeem)`, uma VIEW calculada do livro
--     (a física do `cash`/`inv` — saldo é view, nunca coluna).
--
-- ⭐⭐ E A TERCEIRA RESPOSTA AO "PODE FICAR NEGATIVO?" — RESGATAR MAIS QUE O
-- SALDO É RECUSADO. O `inv` permite saldo negativo (físico), o `bank` permite
-- (cheque especial), o `fund` recusa (dinheiro de terceiros). Ponto de
-- fidelidade é PROMESSA da casa: ninguém resgata o que não tem. O gatilho soma
-- o saldo do cliente (INTRA-schema — o próprio livro, nunca schema alheio) e
-- recusa o resgate que passa do saldo. É a física do `invest` (resgatar mais
-- que a posição é recusado), re-perguntada e assinada.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o cliente por ID SOLTO ao `crm` (uuid, OBRIGATÓRIO — não há ponto
--      sem dono) + nome carimbado pela TELA; o tipo (earn/redeem); os pontos
--      (> 0); o motivo TEXTO LIVRE opcional; a origem por id solto OPCIONAL (a
--      venda que gerou — `source_id`, sem FK cruzada).
--   ❌ NÃO ENTRA conversão pontos↔dinheiro / regra de acúmulo (quantos pontos por
--      real — é configuração de campanha, capacidade futura); expiração
--      automática de pontos por relógio (sem cron fingido — Lei 7; a baixa por
--      validade é um `redeem` com motivo, quando construída); catálogo de
--      recompensas. `consumes` VAZIO.
--
-- 🔴 O `loyalty` NÃO LÊ o `crm` nem o `pdv`: cliente e venda são ID SOLTO, sem
-- FK cruzada e sem uma linha que toque schema alheio — a Lei do Lego.
-- =============================================================================

create schema if not exists loyalty;

comment on schema loyalty is
  'Módulo Fidelidade. Vertical retail (Varejo & Supermercados) da Taxonomia. O livro de pontos: cada movimento é LANÇAMENTO IMUTÁVEL (a física do timesheet), a direção mora no entry_type (earn/redeem — a sinal do tipo do cash), points sempre > 0, e o saldo é VIEW (Σ earn − Σ redeem). Resgatar mais que o saldo é RECUSADO (a física do invest — o guarda soma INTRA-schema). Cliente e venda por ID SOLTO. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function loyalty.emit_event(
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
  if p_event_type not like 'loyalty.%' then
    raise exception 'loyalty.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'loyalty',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function loyalty.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function loyalty.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'loyalty.entry.manage');
$$;

-- =============================================================================
-- 2. ENTRIES — ⭐⭐ O MOVIMENTO DE PONTOS: LANÇAMENTO IMUTÁVEL, SEM CICLO
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA allowed_transition. NENHUM updated_at. O
-- registro nasce pronto — e nunca mais muda. A direção mora no entry_type.
-- =============================================================================

create table loyalty.entries (
  id            uuid          primary key default gen_random_uuid(),
  tenant_id     uuid          not null references core.tenants (id) on delete cascade,
  -- ⭐ O cliente por ID SOLTO ao crm — SEM FK cruzada (Lei do Lego), OBRIGATÓRIO
  -- (não há ponto sem dono). O nome carimbado pela TELA sobrevive ao redesenho.
  customer_id   uuid          not null,
  customer_name text          not null default '',
  -- ⭐ A DIREÇÃO mora no tipo (a sinal do tipo do cash): earn soma, redeem subtrai.
  entry_type    text          not null check (entry_type in ('earn', 'redeem')),
  -- ⭐ Os pontos: SEMPRE > 0. O sinal é o TIPO, nunca o número (o DIVERGE do
  -- timesheet, que acumula numa direção só; e do pcost, livro de gasto <> 0).
  points        integer       not null check (points > 0),
  -- Motivo TEXTO LIVRE e OPCIONAL ("compra", "resgate — brinde", "expiração").
  reason        text          not null default '',
  -- ⭐ A origem por ID SOLTO, OPCIONAL: a venda que gerou os pontos (pdv), sem
  -- FK cruzada. Nem todo movimento tem origem (um ajuste manual não tem venda).
  source_id     uuid,
  -- ⭐ Os carimbos do FATO — sempre do servidor, nunca do formulário.
  created_at    timestamptz   not null default now(),
  created_by    uuid          references auth.users (id) on delete set null,
  constraint loyalty_entries_id_tenant unique (id, tenant_id)
);

create index loyalty_entries_book_idx
  on loyalty.entries (tenant_id, created_at desc);
create index loyalty_entries_by_customer_idx
  on loyalty.entries (tenant_id, customer_id, created_at desc);

alter table loyalty.entries enable row level security;
alter table loyalty.entries force row level security;

create policy loyalty_entries_select on loyalty.entries
  for select to authenticated
  using (loyalty.can_access(tenant_id));

create policy loyalty_entries_insert on loyalty.entries
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'loyalty.entry.manage'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o movimento é fato consumado.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — E o resgate confere o saldo (INTRA-schema)
-- -----------------------------------------------------------------------------
-- ⭐⭐ A TERCEIRA RESPOSTA: resgatar mais que o saldo é RECUSADO. O guarda soma o
-- saldo do cliente NO PRÓPRIO LIVRO (loyalty.entries) — nunca schema alheio.

create or replace function loyalty.guard_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  new.created_by := (select auth.uid());

  if new.entry_type = 'redeem' then
    select coalesce(sum(case when entry_type = 'earn' then points else -points end), 0)
      into v_balance
      from loyalty.entries
     where tenant_id = new.tenant_id
       and customer_id = new.customer_id;

    if new.points > v_balance then
      raise exception 'saldo de pontos insuficiente: o cliente tem % ponto(s), resgate de % recusado', v_balance, new.points
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger loyalty_entries_stamp
  before insert on loyalty.entries
  for each row execute function loyalty.guard_entry_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve o movimento lançado
-- -----------------------------------------------------------------------------

create or replace function loyalty.guard_entry_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o movimento de pontos é fato consumado: não se edita nem se apaga. Corrigir é lançar outro (o ato inverso), com motivo.'
    using errcode = '42501';
end;
$$;

create trigger loyalty_entries_immutable
  before update or delete on loyalty.entries
  for each row execute function loyalty.guard_entry_immutable();

-- =============================================================================
-- 3. O SALDO — ⭐ VIEW calculada do livro, NUNCA coluna (a física do cash/inv)
-- =============================================================================
-- security_invoker: a VIEW lê sob a RLS de quem consulta — o saldo do tenant do
-- usuário, nunca do vizinho.

create view loyalty.customer_balances
  with (security_invoker = true) as
  select
    tenant_id,
    customer_id,
    sum(case when entry_type = 'earn' then points else -points end)::bigint as balance_points,
    count(*) filter (where entry_type = 'earn')   as earn_count,
    count(*) filter (where entry_type = 'redeem') as redeem_count
  from loyalty.entries
  group by tenant_id, customer_id;

comment on view loyalty.customer_balances is
  'O saldo de pontos por cliente — VIEW calculada do livro (Σ earn − Σ redeem), NUNCA coluna. security_invoker: lê sob a RLS de quem consulta.';

-- =============================================================================
-- 4. OS FATOS — payload AUTOSSUFICIENTE (cliente pelo nome, id solto)
-- =============================================================================

create or replace function loyalty.entry_payload(p loyalty.entries)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'entryId',      p.id,
    'customerId',   p.customer_id,
    'customerName', p.customer_name,
    'entryType',    p.entry_type,
    'points',       p.points,
    'reason',       p.reason,
    'sourceId',     p.source_id
  );
$$;

comment on function loyalty.entry_payload(loyalty.entries) is
  'O envelope de um movimento de pontos — AUTOSSUFICIENTE, com o cliente pelo NOME carimbado (id solto). Quem escuta não faz join.';

create or replace function loyalty.on_entry_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform loyalty.emit_event(
    new.tenant_id,
    case when new.entry_type = 'earn' then 'loyalty.points.earned'
         else 'loyalty.points.redeemed' end,
    loyalty.entry_payload(new)
  );
  return new;
end;
$$;

create trigger loyalty_entries_emit_registered
  after insert on loyalty.entries
  for each row execute function loyalty.on_entry_registered();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema loyalty                  from public, anon, authenticated;
revoke all on all tables    in schema loyalty from public, anon, authenticated;
revoke all on all functions in schema loyalty from public, anon, authenticated;

grant usage on schema loyalty to authenticated;

-- ⛔ SÓ SELECT e INSERT na tabela: reescrever/apagar não existe (fato consumado).
grant select, insert on loyalty.entries to authenticated;
grant select on loyalty.customer_balances to authenticated;

grant execute on function loyalty.can_access(uuid) to authenticated;

-- `loyalty.emit_event` NÃO é concedida. `loyalty.entry_payload` é encanamento do
-- gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma allowed_transition. Nenhum updated_at.
-- Nenhum saldo em coluna (é VIEW). Nenhuma conversão pontos↔dinheiro (config
-- futura). Nenhum objeto fora de `loyalty`. Nenhuma leitura de schema alheio
-- (cliente e venda por id solto). `consumes` VAZIO (Lei 7).
-- =============================================================================
