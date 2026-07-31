-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0099_creditbalance.sql
-- Módulo 84: Créditos de Compensação. Schema `creditbalance`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §33, o
-- QUARTO e ÚLTIMO módulo da Onda Vinte (Fase 3 — o Vertical ☀️ ENERGIA). Nasce
-- sob `vertical_key='energy'` (confirmado na store-taxonomy). Próxima livre
-- depois desta onda: 0100.
--
-- Taxonomia: Vertical ☀️ Energia (§6) — capacidade *Créditos de compensação*.
-- Spec: docs/canon/MODULO-CREDITBALANCE-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE É — O LIVRO DE CRÉDITOS DE ENERGIA (o conceito ANEEL de compensação)
-- -----------------------------------------------------------------------------
-- No Sistema de Compensação de Energia Elétrica (SCEE, ANEEL / Lei 14.300),
-- quando uma unidade geradora injeta na rede MAIS energia do que consome, o
-- excedente vira CRÉDITO DE ENERGIA (em kWh), que fica "em banco" e abate
-- consumo de ciclos seguintes. Este módulo é esse livro: cada lançamento é um
-- FATO CONSUMADO — a direção mora no TIPO (`credit_type` `generated` soma /
-- `consumed` subtrai), a quantidade é SEMPRE em kWh positivos, e o SALDO é uma
-- VIEW (Σ generated − Σ consumed), nunca coluna. É a MESMA física do `loyalty`:
-- livro imutável (duas camadas), a sinal na coluna de tipo, saldo como view.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DO SALDO NEGATIVO — RECUSADO, e o argumento é a FÍSICA DA
--     COMPENSAÇÃO, não a cópia do loyalty
-- -----------------------------------------------------------------------------
-- O bastão mandou decidir e argumentar pela física REAL, sem copiar a resposta
-- do `loyalty`. Duas hipóteses foram pesadas:
--
--   (a) "O saldo pode ficar negativo — é uma dívida de energia que será
--        compensada por geração futura." — REJEITADA. No SCEE não existe
--        DÍVIDA de crédito de energia: um crédito só existe porque energia
--        excedente foi FISICAMENTE gerada e injetada na rede. A distribuidora
--        não EMPRESTA kWh de crédito. O consumo que os créditos bancados não
--        cobrem não vira saldo negativo — é simplesmente faturado normalmente
--        pela distribuidora, FORA deste livro (integração de fatura, Lei 3).
--
--   (b) "Consumir (compensar) mais crédito do que o saldo é RECUSADO." —
--        ESCOLHIDA. Registrar um saldo negativo INVENTARIA energia injetada que
--        nunca existiu — é o mesmo argumento INFÍSICO do `esg` (`quantity >= 0`:
--        não se gera energia negativa) e do `genreading`. Você não compensa com
--        energia que não gerou.
--
-- ⭐⭐ A TERCEIRA RESPOSTA, POR UMA FÍSICA PRÓPRIA. O resultado — recusar — é o
-- MESMO do `loyalty` e do `invest`, mas por motivos DIFERENTES, e o contraste é
-- assinado no teste:
--   · `invest` recusa resgate > posição: não se resgata investimento que não se tem.
--   · `loyalty` recusa resgate > saldo: ponto é PROMESSA da casa, não se dá o que não há.
--   · `creditbalance` recusa consumo > saldo: crédito é ENERGIA REALMENTE
--     GERADA; compensar com energia inexistente é infísico (a razão do esg).
-- E o outro lado do mesmo eixo, para deixar o contraste completo: o `bank`
-- PERMITE saldo negativo (cheque especial — o dinheiro do banco), o `inv`
-- PERMITE (físico). Aqui NÃO: energia não se deve, se gera.
--
-- O guarda soma o saldo INTRA-schema (o próprio livro, nunca schema alheio),
-- agrupado por (tenant, assinatura) — a mesma conta do guarda do `loyalty`
-- (que agrupa por cliente), com a assinatura como chave de conta (o NULL é o
-- balcão geral do tenant, `is not distinct from`).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o TIPO (`generated`/`consumed`, CHECK — a direção); a quantidade em
--      kWh (> 0 — o sinal é o tipo); o motivo TEXTO LIVRE opcional; a assinatura
--      por ID SOLTO OPCIONAL (`subscription_id` + nome carimbado pela tela — a
--      que unidade o crédito pertence, sem FK cruzada).
--   ❌ NÃO ENTRA validade/expiração de crédito por relógio (o SCEE dá 60 meses —
--      é motor de calendário, capacidade futura, sem cron fingido — Lei 7);
--      cálculo de abatimento na fatura (é o `dre`/`cash`, FORA); a fatura de
--      energia (integração com a distribuidora, Lei 3). `consumes` VAZIO.
--
-- 🔴 O `creditbalance` NÃO LÊ o `subscription` nem o `plant`: a assinatura é ID
-- SOLTO, sem FK cruzada e sem uma linha que toque schema alheio — a Lei do Lego.
-- =============================================================================

create schema if not exists creditbalance;

comment on schema creditbalance is
  'Módulo Créditos de Compensação (o SCEE/ANEEL). Vertical energy (Energia) da Taxonomia. O livro de créditos de energia: cada lançamento é IMUTÁVEL (a física do loyalty), a direção mora no credit_type (generated soma / consumed subtrai), quantity_kwh sempre > 0, e o saldo é VIEW (Σ generated − Σ consumed). ⭐⭐ Consumir mais que o saldo é RECUSADO — não por cópia do loyalty, mas pela física da compensação (crédito é energia realmente gerada; saldo negativo inventaria energia inexistente — a razão infísica do esg). A assinatura por id solto opcional. Validade (60 meses) e abatimento na fatura ficam FORA. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function creditbalance.emit_event(
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
  if p_event_type not like 'creditbalance.%' then
    raise exception 'creditbalance.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'creditbalance',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function creditbalance.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function creditbalance.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'creditbalance.entry.manage');
$$;

-- =============================================================================
-- 2. ENTRIES — ⭐⭐ O LANÇAMENTO DE CRÉDITO: IMUTÁVEL, SEM CICLO
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA allowed_transition. NENHUM updated_at. O
-- registro nasce pronto — e nunca mais muda. A direção mora no credit_type.
-- =============================================================================

create table creditbalance.entries (
  id                uuid          primary key default gen_random_uuid(),
  tenant_id         uuid          not null references core.tenants (id) on delete cascade,
  -- ⭐ A DIREÇÃO mora no tipo (a sinal do tipo do cash/loyalty): generated soma,
  -- consumed subtrai. CHECK — física do método (compensação de energia).
  credit_type       text          not null check (credit_type in ('generated', 'consumed')),
  -- ⭐ A quantidade em kWh: SEMPRE > 0. O sinal é o TIPO, nunca o número.
  quantity_kwh      numeric(20,4) not null check (quantity_kwh > 0),
  -- ⭐ A assinatura por ID SOLTO, OPCIONAL — a que unidade o crédito pertence
  -- (a chave de conta do saldo). SEM FK cruzada (Lei do Lego).
  subscription_id   uuid,
  subscription_name text          not null default '',
  -- Motivo TEXTO LIVRE e OPCIONAL ("geração de julho", "compensação — UC 3").
  reason            text          not null default '',
  -- ⭐ Os carimbos do FATO — sempre do servidor, nunca do formulário.
  created_at        timestamptz   not null default now(),
  created_by        uuid          references auth.users (id) on delete set null,
  constraint creditbalance_entries_id_tenant unique (id, tenant_id)
);

create index creditbalance_entries_book_idx
  on creditbalance.entries (tenant_id, created_at desc);
create index creditbalance_entries_by_subscription_idx
  on creditbalance.entries (tenant_id, subscription_id, created_at desc);

alter table creditbalance.entries enable row level security;
alter table creditbalance.entries force row level security;

create policy creditbalance_entries_select on creditbalance.entries
  for select to authenticated
  using (creditbalance.can_access(tenant_id));

create policy creditbalance_entries_insert on creditbalance.entries
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'creditbalance.entry.manage'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o lançamento é fato consumado.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — E o consumo confere o saldo (INTRA-schema)
-- -----------------------------------------------------------------------------
-- ⭐⭐ A TERCEIRA RESPOSTA: consumir mais que o saldo é RECUSADO. O guarda soma o
-- saldo da conta (tenant, assinatura) NO PRÓPRIO LIVRO — nunca schema alheio.
-- A conta é agrupada por subscription_id (o NULL é o balcão geral do tenant,
-- casado com `is not distinct from`) — a mesma lógica do guarda do loyalty.

create or replace function creditbalance.guard_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
begin
  new.created_by := (select auth.uid());

  if new.credit_type = 'consumed' then
    select coalesce(sum(case when credit_type = 'generated' then quantity_kwh else -quantity_kwh end), 0)
      into v_balance
      from creditbalance.entries
     where tenant_id = new.tenant_id
       and subscription_id is not distinct from new.subscription_id;

    if new.quantity_kwh > v_balance then
      raise exception 'saldo de créditos insuficiente: a conta tem % kWh, consumo de % recusado (energia não se deve, se gera)', v_balance, new.quantity_kwh
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger creditbalance_entries_stamp
  before insert on creditbalance.entries
  for each row execute function creditbalance.guard_entry_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve o lançamento
-- -----------------------------------------------------------------------------

create or replace function creditbalance.guard_entry_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o lançamento de crédito é fato consumado: não se edita nem se apaga. Corrigir é lançar outro (o ato inverso), com motivo.'
    using errcode = '42501';
end;
$$;

create trigger creditbalance_entries_immutable
  before update or delete on creditbalance.entries
  for each row execute function creditbalance.guard_entry_immutable();

-- =============================================================================
-- 3. O SALDO — ⭐ VIEW calculada do livro, NUNCA coluna (a física do loyalty)
-- =============================================================================
-- security_invoker: a VIEW lê sob a RLS de quem consulta — o saldo do tenant do
-- usuário, nunca do vizinho. Agrupa por assinatura (a conta).

create view creditbalance.subscription_balances
  with (security_invoker = true) as
  select
    tenant_id,
    subscription_id,
    sum(case when credit_type = 'generated' then quantity_kwh else -quantity_kwh end) as balance_kwh,
    count(*) filter (where credit_type = 'generated') as generated_count,
    count(*) filter (where credit_type = 'consumed')  as consumed_count
  from creditbalance.entries
  group by tenant_id, subscription_id;

comment on view creditbalance.subscription_balances is
  'O saldo de créditos por assinatura — VIEW calculada do livro (Σ generated − Σ consumed), NUNCA coluna. security_invoker: lê sob a RLS de quem consulta. O NULL é o balcão geral do tenant.';

-- =============================================================================
-- 4. OS FATOS — payload AUTOSSUFICIENTE (a assinatura pelo nome, id solto)
-- =============================================================================

create or replace function creditbalance.entry_payload(p creditbalance.entries)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'entryId',          p.id,
    'creditType',       p.credit_type,
    'quantityKwh',      p.quantity_kwh,
    'subscriptionId',   p.subscription_id,
    'subscriptionName', p.subscription_name
  );
$$;

comment on function creditbalance.entry_payload(creditbalance.entries) is
  'O envelope de um lançamento de crédito — AUTOSSUFICIENTE, com a assinatura pelo NOME carimbado (id solto). Sem o motivo texto livre. Quem escuta não faz join.';

create or replace function creditbalance.on_entry_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform creditbalance.emit_event(
    new.tenant_id,
    case when new.credit_type = 'generated' then 'creditbalance.credit.generated'
         else 'creditbalance.credit.consumed' end,
    creditbalance.entry_payload(new)
  );
  return new;
end;
$$;

create trigger creditbalance_entries_emit_registered
  after insert on creditbalance.entries
  for each row execute function creditbalance.on_entry_registered();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema creditbalance                  from public, anon, authenticated;
revoke all on all tables    in schema creditbalance from public, anon, authenticated;
revoke all on all functions in schema creditbalance from public, anon, authenticated;

grant usage on schema creditbalance to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever/apagar não existe (o lançamento é fato).
grant select, insert on creditbalance.entries to authenticated;
grant select on creditbalance.subscription_balances to authenticated;

grant execute on function creditbalance.can_access(uuid) to authenticated;

-- `creditbalance.emit_event` NÃO é concedida. `creditbalance.entry_payload` é
-- encanamento do gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma allowed_transition. Nenhum saldo em
-- coluna (é VIEW). Nenhuma validade por relógio (motor futuro, FORA). Nenhum
-- abatimento na fatura (é o dre/cash, FORA). Nenhum objeto fora de
-- `creditbalance`. Nenhuma leitura de schema alheio (a assinatura por id solto).
-- `consumes` VAZIO (Lei 7).
-- =============================================================================
