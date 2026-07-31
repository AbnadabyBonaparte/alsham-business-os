-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0097_subscription.sql
-- Módulo 82: Assinatura de Energia. Schema `subscription`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §33, o
-- SEGUNDO módulo da Onda Vinte (Fase 3 — o Vertical ☀️ ENERGIA). Nasce sob
-- `vertical_key='energy'` (confirmado na store-taxonomy).
--
-- Taxonomia: Vertical ☀️ Energia (§6) — capacidade *Assinatura de energia*.
-- Spec: docs/canon/MODULO-SUBSCRIPTION-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE É — O MODELO DE NEGÓCIO CENTRAL DA CURVA C SOLAR
-- -----------------------------------------------------------------------------
-- O consumidor assina uma FATIA (percentual) da geração de uma usina. A
-- assinatura é o vínculo comercial: quem assina (o cliente, por id solto ao
-- crm), o que assina (a usina, por id solto ao plant) e QUANTO da geração dela
-- fica alocado a ele (`allocation_percent`, 0 < x <= 100).
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CICLO DE VIDA — investigada e assinada: `active → cancelled`
--     TERMINAL, e NÃO existe `pending`
-- -----------------------------------------------------------------------------
-- O bastão mandou investigar e documentar. Duas perguntas foram feitas:
--
--   1. "Precisa de um `pending` antes de `active`?" — NÃO. Um estado
--      intermediário ("assinada mas ainda não conectada na distribuidora")
--      modela a ESTEIRA DE ONBOARDING de UMA distribuidora, não o produto
--      universal — é exatamente o viés que a Lei Anti-Viés proíbe (cada
--      distribuidora/estado tem um rito de conexão diferente). A assinatura
--      NASCE ATIVA: o momento em que a operadora compromete a fatia da geração.
--      Se um tenant precisa rastrear "assinada, aguardando conexão", isso é
--      status operacional dele (ou a Esteira genérica, o `ops`), não uma etapa
--      que o produto congela pra todo mundo. É a mesma disciplina do `catalog`,
--      que nasce ativo sem "rascunho".
--
--   2. "`cancelled` é terminal ou reversível (a volta do crm/catalog)?" —
--      TERMINAL. Copiar sem pensar e divergir sem escrever são o mesmo erro
--      (CLAUDE.md). A pergunta: o consumidor que cancela e volta é a MESMA
--      assinatura (física do crm/catalog, `archived → active`) ou uma NOVA
--      (física do proj, `cancelled` terminal)? É uma NOVA: quem re-assina
--      negocia OUTRA fatia — outro percentual, outra usina, outra data. A fatia
--      de geração alocada é o coração do contrato, e ela se renegocia do zero.
--      Ressuscitar a assinatura antiga com a alocação antiga MENTIRIA sobre o
--      acordo vigente. Então `active → cancelled` e pronto: o retorno é
--      assinatura NOVA. É a física do `proj` (`cancelled` terminal, razão
--      obrigatória), o DIVERGE consciente do `catalog` (que fica no mesmo PR).
--
-- Cancelar exige RAZÃO (o que aconteceu) E a permissão `.decide` (é decisão de
-- outro papel, não do operador que cadastra). O carimbo de quem/quando cancelou
-- é do SERVIDOR.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o cliente por ID SOLTO ao `crm` (OBRIGATÓRIO — não há assinatura
--      sem assinante) + nome carimbado pela tela; a usina por ID SOLTO ao
--      `plant` (OBRIGATÓRIO — não há fatia sem usina) + nome carimbado; o
--      percentual de alocação (0 < x <= 100); o ciclo active → cancelled.
--   ❌ NÃO ENTRA cálculo de desconto na fatura (é o `dre`/`cash` genérico
--      cruzando por id solto — capacidade futura, DECLARADA FORA); faturamento/
--      cobrança da assinatura (é frente de billing separada, FORA); a fatura de
--      energia em si (integração com a distribuidora, Lei 3). `consumes` VAZIO.
--
-- 🔴 O `subscription` NÃO LÊ o `crm` nem o `plant`: cliente e usina são ID
-- SOLTO, sem FK cruzada e sem uma linha que toque schema alheio — a Lei do Lego.
-- =============================================================================

create schema if not exists subscription;

comment on schema subscription is
  'Módulo Assinatura de Energia. Vertical energy (Energia) da Taxonomia. O consumidor assina uma FATIA (percentual) da geração de uma usina: cliente por id solto ao crm (obrigatório), usina por id solto ao plant (obrigatório), allocation_percent 0<x<=100. NASCE ATIVA (sem pending — o intermediário seria viés de uma distribuidora). active → cancelled TERMINAL (a física do proj — quem re-assina negocia OUTRA fatia; o DIVERGE do catalog): cancelar exige razão e a permissão .decide. Desconto na fatura e faturamento ficam FORA. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function subscription.emit_event(
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
  if p_event_type not like 'subscription.%' then
    raise exception 'subscription.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'subscription',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function subscription.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function subscription.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'subscription.subscription.manage')
      or core.has_permission(p_tenant_id, 'subscription.subscription.decide');
$$;

create or replace function subscription.touch_updated_at()
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
-- 2. SUBSCRIPTIONS — a assinatura da fatia de geração
-- =============================================================================

create table subscription.subscriptions (
  id                 uuid          primary key default gen_random_uuid(),
  tenant_id          uuid          not null references core.tenants (id) on delete cascade,
  -- ⭐ O cliente por ID SOLTO ao crm — OBRIGATÓRIO (não há assinatura sem
  -- assinante). Nome carimbado pela TELA sobrevive ao redesenho do cadastro.
  customer_id        uuid          not null,
  customer_name      text          not null default '',
  -- ⭐ A usina por ID SOLTO ao plant — OBRIGATÓRIO (não há fatia sem usina).
  plant_id           uuid          not null,
  plant_name         text          not null default '',
  -- ⭐ A fatia da geração: 0 < x <= 100. Zero não é assinatura; acima de 100 não
  -- existe (não se aloca mais do que a usina gera).
  allocation_percent numeric(7,4)  not null check (allocation_percent > 0 and allocation_percent <= 100),
  status             text          not null default 'active'
                     check (status in ('active', 'cancelled')),
  -- A razão do cancelamento — obrigatória ao cancelar (a física do proj).
  cancel_reason      text          not null default '',
  -- ⭐ Os carimbos do cancelamento — do SERVIDOR, nunca do formulário.
  cancelled_at       timestamptz,
  cancelled_by       uuid          references auth.users (id) on delete set null,
  created_at         timestamptz   not null default now(),
  created_by         uuid          references auth.users (id) on delete set null,
  updated_at         timestamptz   not null default now(),
  constraint subscription_subscriptions_id_tenant unique (id, tenant_id)
);

create index subscription_subscriptions_roster_idx
  on subscription.subscriptions (tenant_id, status, created_at desc);
create index subscription_subscriptions_by_plant_idx
  on subscription.subscriptions (tenant_id, plant_id, status);
create index subscription_subscriptions_by_customer_idx
  on subscription.subscriptions (tenant_id, customer_id, status);

create trigger subscription_subscriptions_touch
  before update on subscription.subscriptions
  for each row execute function subscription.touch_updated_at();

alter table subscription.subscriptions enable row level security;
alter table subscription.subscriptions force row level security;

create policy subscription_subscriptions_select on subscription.subscriptions
  for select to authenticated
  using (subscription.can_access(tenant_id));

create policy subscription_subscriptions_insert on subscription.subscriptions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'subscription.subscription.manage'));

-- ⚠️ USING = can_access (não .decide): quem só cancela ALCANÇA a linha e bate no
-- gatilho, que decide — em vez de a RLS filtrar e o UPDATE afetar 0 linhas em
-- silêncio (o padrão do catalog).
create policy subscription_subscriptions_update on subscription.subscriptions
  for update to authenticated
  using (subscription.can_access(tenant_id))
  with check (subscription.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Assinatura cancelada é história comercial.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVA, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function subscription.guard_subscription_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'a assinatura nasce ativa — não há pending (seria viés de uma distribuidora)'
      using errcode = '22023';
  end if;

  -- O cancelamento não se carimba no nascimento.
  new.cancel_reason := '';
  new.cancelled_at  := null;
  new.cancelled_by  := null;
  new.created_by    := (select auth.uid());
  return new;
end;
$$;

create trigger subscription_subscriptions_stamp
  before insert on subscription.subscriptions
  for each row execute function subscription.guard_subscription_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ Congelamento — a assinatura cancelada é TERMINAL (não se edita)
-- -----------------------------------------------------------------------------
-- Fere antes do gatilho de status: uma vez cancelada, NADA muda (nem para
-- reativar — o retorno é assinatura NOVA, a física do proj).

create or replace function subscription.guard_subscription_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cancelled' then
    raise exception 'a assinatura cancelada é terminal: não se edita nem se reativa. Quem volta assina outra (a física do proj).'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger subscription_subscriptions_frozen
  before update on subscription.subscriptions
  for each row execute function subscription.guard_subscription_frozen();

-- -----------------------------------------------------------------------------
-- 2.3 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/subscription
-- -----------------------------------------------------------------------------
-- ⭐ active → cancelled TERMINAL (a física do proj). Cancelar exige razão E
-- a permissão .decide; quem/quando é carimbo do servidor.

create or replace function subscription.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active', 'cancelled')
  );
$$;

comment on function subscription.allowed_transition(text, text) is
  'Ciclo de vida da assinatura. Espelho de ALLOWED_TRANSITIONS em @alsham/subscription. active → cancelled TERMINAL: quem re-assina negocia OUTRA fatia — o retorno é assinatura NOVA (a física do proj, o DIVERGE do catalog onde archived→active existe).';

create or replace function subscription.guard_subscription_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not subscription.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da assinatura', old.status, new.status
      using errcode = '22023';
  end if;

  -- Cancelar é DECISÃO de outro papel.
  if not core.has_permission(new.tenant_id, 'subscription.subscription.decide') then
    raise exception 'cancelar uma assinatura exige a permissão subscription.subscription.decide'
      using errcode = '42501';
  end if;

  -- Cancelar exige RAZÃO (a física do proj).
  if length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
    raise exception 'cancelar uma assinatura exige uma razão'
      using errcode = '22023';
  end if;

  -- ⭐ O carimbo é do servidor.
  new.cancelled_at := now();
  new.cancelled_by := (select auth.uid());
  return new;
end;
$$;

create trigger subscription_subscriptions_guard_status
  before update of status on subscription.subscriptions
  for each row execute function subscription.guard_subscription_transition();

-- =============================================================================
-- 3. OS FATOS — payload autossuficiente (cliente e usina pelo nome, id solto)
-- =============================================================================

create or replace function subscription.subscription_payload(p subscription.subscriptions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'subscriptionId',    p.id,
    'customerId',        p.customer_id,
    'customerName',      p.customer_name,
    'plantId',           p.plant_id,
    'plantName',         p.plant_name,
    'allocationPercent', p.allocation_percent,
    'status',            p.status
  );
$$;

comment on function subscription.subscription_payload(subscription.subscriptions) is
  'O envelope de uma assinatura — AUTOSSUFICIENTE, com cliente e usina pelo NOME carimbado (id solto). Sem a razão do cancelamento (texto livre não passeia). Quem escuta não faz join.';

create or replace function subscription.on_subscription_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform subscription.emit_event(new.tenant_id, 'subscription.subscription.registered', subscription.subscription_payload(new));
  return new;
end;
$$;

create trigger subscription_subscriptions_emit_registered
  after insert on subscription.subscriptions
  for each row execute function subscription.on_subscription_registered();

create or replace function subscription.on_subscription_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status = 'cancelled' then
    perform subscription.emit_event(new.tenant_id, 'subscription.subscription.cancelled', subscription.subscription_payload(new));
    return new;
  end if;

  if new.customer_name is distinct from old.customer_name
     or new.plant_name is distinct from old.plant_name
     or new.allocation_percent is distinct from old.allocation_percent then
    perform subscription.emit_event(new.tenant_id, 'subscription.subscription.updated', subscription.subscription_payload(new));
  end if;

  return new;
end;
$$;

create trigger subscription_subscriptions_emit_changed
  after update on subscription.subscriptions
  for each row execute function subscription.on_subscription_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema subscription                  from public, anon, authenticated;
revoke all on all tables    in schema subscription from public, anon, authenticated;
revoke all on all functions in schema subscription from public, anon, authenticated;

grant usage on schema subscription to authenticated;

grant select, insert, update on subscription.subscriptions to authenticated;

grant execute on function subscription.can_access(uuid) to authenticated;

-- `subscription.emit_event` NÃO é concedida. `subscription.subscription_payload`
-- é encanamento dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum DELETE. Nenhum `pending` (seria viés de uma distribuidora).
-- Nenhum desconto/faturamento (é o dre/cash/billing, FORA). Nenhuma leitura de
-- schema alheio (cliente e usina por id solto). `consumes` VAZIO.
-- =============================================================================
