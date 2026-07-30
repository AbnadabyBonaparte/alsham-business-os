-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0055_fund.sql
-- Módulo 40: Fundo de Promoção. Schema `fund`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §22,
-- depois do `0054` (o `lease`, Módulo 39). Terceiro módulo da Missão Nove
-- (Onda 6 — a ÚLTIMA), Vertical shopping-centers.
--
-- Taxonomia: Vertical 🛍 Shopping Centers — capacidade *Fundo de promoção*
-- (§6). Spec: docs/canon/MODULO-FUND-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ AUTOSSUFICIENTE — NÃO IMPORTA O `cc` (física duplicada de propósito)
-- -----------------------------------------------------------------------------
-- O `cc` (Módulo 28, Centros de Custo & Rateio) já sabe dividir um valor por
-- regra. Este módulo NÃO o importa, NÃO lê o schema dele e NÃO reaproveita
-- `cc.execute_rateio()` para nada: o Fundo de Promoção não é um RATEIO de
-- custo entre centros — é um LIVRO PRÓPRIO de duas mãos (o que ENTRA dos
-- lojistas e o que SAI em promoção), com uma física que o `cc` não tem (o
-- saldo nunca negativo — abaixo). É a MESMA relação que o `spc`→`shift`
-- ensinou: a exclusão por período do `spc` foi reaproveitada — por FÍSICA
-- DUPLICADA, escrita de novo — na escala do tenant pelo `shift`, porque a
-- pessoa não é o espaço. Aqui a física de "livro imutável com saldo
-- calculado" existe em `cc`/`bank`/`invest`; duplicá-la aqui, PEQUENA e
-- PRÓPRIA, é mais barato e mais claro do que uma dependência cruzada entre
-- dois módulos que a Lei do Lego proíbe. O cabeçalho do `0043_cc.sql` já
-- avisou: "o Fundo de Promoção da Vertical (Q6·fund) vai se PENDURAR aqui
-- pela origem (id solto + nome)" — e é exatamente isso que este módulo faz
-- com `mall.stores` (contribuinte) e `marketing` (campanha): ID SOLTO, sem
-- FK cruzada, sem ler schema alheio.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O SALDO NUNCA FICA NEGATIVO — a QUARTA resposta, e é a mais estrita
-- -----------------------------------------------------------------------------
-- Três precedentes já responderam "pode ficar negativo?":
--   · `bank` PERMITE (cheque especial é produto bancário real);
--   · `inv` PERMITE (o overpay do `ar` re-perguntado para o físico);
--   · `invest` RECUSA resgatar mais que a posição (não se resgata o que não
--     está no papel).
-- O `fund` dá a QUARTA resposta, e ela NÃO é apenas "recusa o excesso" como o
-- `invest`: aqui a recusa é estrutural em TODO gasto, sempre, porque o
-- dinheiro do fundo NÃO é do tenant — é dinheiro COLETIVO dos lojistas,
-- arrecadado com um propósito (promoção). Gastar mais do que arrecadou não é
-- "descoberto" nem "cheque especial": é o operador do shopping usando
-- dinheiro que os lojistas não deram. Por isso o gatilho de gasto CONFERE o
-- saldo (contribuições − gastos já lançados) ANTES de aceitar o novo gasto, e
-- recusa com a mensagem exata "o fundo não pode ficar negativo: gastar mais
-- do que arrecadou é descontrole". Há teste de contraste fund×bank×invest
-- que lê as três migrations e assina as respostas.
--
-- -----------------------------------------------------------------------------
-- DOIS LIVROS IMUTÁVEIS, cada um com vínculo por ID SOLTO + nome carimbado
-- -----------------------------------------------------------------------------
-- `fund.contributions` — o lojista (id solto ao `mall.stores`, sem FK) entra
-- com dinheiro, por competência. `fund.expenses` — o fundo gasta, com uma
-- campanha (id solto à `marketing`, opcional e sem FK) e RAZÃO obrigatória
-- (a física do `cc`/`inv`: gasto sem razão é a linha muda que esconde o
-- desvio). Os dois são fato consumado: sem UPDATE, sem DELETE — corrigir é
-- lançar o ato inverso, nunca reescrever.
--
-- ⚠️ ANTI-VIÉS REFORÇADO: zero nome/organograma de cliente. O contribuinte é
-- referenciado por id solto — o `fund` não sabe o que é um "lojista", só que
-- alguém contribuiu. "shopping" é o vertical; nada aqui pressupõe o cliente
-- inaugural.
--
-- `consumes` VAZIO e honesto (Lei 7): quem contribui e quem gasta é gente,
-- pela tela — ninguém é escutado.
-- =============================================================================

create schema if not exists fund;

comment on schema fund is
  'Módulo Fundo de Promoção. Vertical shopping-centers da Taxonomia. Livro próprio de contribuições e gastos, autossuficiente (NÃO importa o cc). O saldo NUNCA fica negativo — a quarta resposta, mais estrita que bank/inv/invest. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — quadragésima vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function fund.emit_event(
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
  if p_event_type not like 'fund.%' then
    raise exception 'fund.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'fund',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function fund.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function fund.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'fund.contribution.manage')
      or core.has_permission(p_tenant_id, 'fund.expense.manage');
$$;

-- =============================================================================
-- 2. CONTRIBUTIONS — ⭐ o livro de ENTRADAS, imutável. Lojista por ID SOLTO.
-- =============================================================================

create table fund.contributions (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Vínculo por ID SOLTO ao mall.stores — sem FK cruzada — + nome carimbado.
  store_id       uuid        not null,
  store_name     text        not null default '',
  competence_on  date        not null,
  amount_cents   bigint      not null check (amount_cents > 0),
  currency       char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  note           text        not null default '',
  contributed_at timestamptz not null default now(),
  contributed_by uuid        references auth.users (id) on delete set null,
  constraint fund_contributions_id_tenant unique (id, tenant_id)
);

create index fund_contributions_book_idx
  on fund.contributions (tenant_id, competence_on desc, contributed_at desc);
create index fund_contributions_by_store_idx
  on fund.contributions (tenant_id, store_id);

alter table fund.contributions enable row level security;
alter table fund.contributions force row level security;

create policy fund_contributions_select on fund.contributions
  for select to authenticated
  using (fund.can_access(tenant_id));

create policy fund_contributions_insert on fund.contributions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'fund.contribution.manage'));

-- ⛔ Sem policy / grant de UPDATE ou DELETE — a contribuição é fato consumado.

create or replace function fund.guard_contributions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a contribuição é fato consumado: não se edita nem se apaga. Corrigir é lançar outra, com nota.'
    using errcode = '42501';
end;
$$;

create trigger fund_contributions_immutable
  before update or delete on fund.contributions
  for each row execute function fund.guard_contributions_immutable();

create or replace function fund.stamp_contribution_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.contributed_by := (select auth.uid());
  new.contributed_at := now();
  return new;
end;
$$;

create trigger fund_contributions_stamp
  before insert on fund.contributions
  for each row execute function fund.stamp_contribution_insert();

-- =============================================================================
-- 3. EXPENSES — ⭐ o livro de SAÍDAS, imutável. Razão obrigatória.
-- -----------------------------------------------------------------------------
-- ⭐⭐ A LEI DESTE MÓDULO: o gatilho confere o saldo (contribuições − gastos)
-- ANTES de aceitar o gasto — o saldo NUNCA fica negativo.
-- =============================================================================

create table fund.expenses (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ Vínculo por ID SOLTO à marketing (campanha) — sem FK — opcional.
  campaign_id   uuid,
  campaign_name text        not null default '',
  amount_cents  bigint      not null check (amount_cents > 0),
  currency      char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  -- ⭐ Razão obrigatória — gasto sem razão é a linha muda que esconde o desvio.
  reason        text        not null check (length(btrim(reason)) > 0),
  spent_at      timestamptz not null default now(),
  spent_by      uuid        references auth.users (id) on delete set null,
  constraint fund_expenses_id_tenant unique (id, tenant_id)
);

create index fund_expenses_book_idx
  on fund.expenses (tenant_id, spent_at desc);
create index fund_expenses_by_campaign_idx
  on fund.expenses (tenant_id, campaign_id)
  where campaign_id is not null;

alter table fund.expenses enable row level security;
alter table fund.expenses force row level security;

create policy fund_expenses_select on fund.expenses
  for select to authenticated
  using (fund.can_access(tenant_id));

create policy fund_expenses_insert on fund.expenses
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'fund.expense.manage'));

-- ⛔ Sem policy / grant de UPDATE ou DELETE — o gasto é fato consumado.

create or replace function fund.guard_expenses_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o gasto é fato consumado: não se edita nem se apaga. Corrigir é lançar o ato inverso (nova contribuição), com razão.'
    using errcode = '42501';
end;
$$;

create trigger fund_expenses_immutable
  before update or delete on fund.expenses
  for each row execute function fund.guard_expenses_immutable();

-- ⭐⭐ O PORTEIRO: o saldo nunca fica negativo. Confere ANTES de aceitar.
create or replace function fund.guard_expense_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contributed bigint;
  v_spent       bigint;
  v_balance     bigint;
begin
  select coalesce(sum(amount_cents), 0) into v_contributed
    from fund.contributions
   where tenant_id = new.tenant_id;

  select coalesce(sum(amount_cents), 0) into v_spent
    from fund.expenses
   where tenant_id = new.tenant_id;

  v_balance := v_contributed - v_spent;

  if (v_balance - new.amount_cents) < 0 then
    raise exception 'o fundo não pode ficar negativo: gastar mais do que arrecadou é descontrole'
      using errcode = '22023';
  end if;

  new.spent_by := (select auth.uid());
  new.spent_at := now();
  return new;
end;
$$;

create trigger fund_expenses_guard_balance
  before insert on fund.expenses
  for each row execute function fund.guard_expense_balance();

-- =============================================================================
-- 4. A VISÃO — o saldo, CONSEQUÊNCIA CALCULADA, jamais coluna
-- -----------------------------------------------------------------------------
-- ⚠️ security_invoker: sem ela a view somaria o saldo de todos os tenants.
-- =============================================================================

create view fund.balance
  with (security_invoker = true)
as
select t.tenant_id,
       coalesce(c.total_contributed, 0)                       as total_contributed_cents,
       coalesce(e.total_spent, 0)                              as total_spent_cents,
       coalesce(c.total_contributed, 0) - coalesce(e.total_spent, 0) as balance_cents
  from (
    select tenant_id from fund.contributions
    union
    select tenant_id from fund.expenses
  ) t
  left join (
    select tenant_id, sum(amount_cents) as total_contributed
      from fund.contributions
     group by tenant_id
  ) c on c.tenant_id = t.tenant_id
  left join (
    select tenant_id, sum(amount_cents) as total_spent
      from fund.expenses
     group by tenant_id
  ) e on e.tenant_id = t.tenant_id;

comment on view fund.balance is
  'O saldo do fundo = contribuições − gastos. Calculado, nunca coluna. NUNCA negativo (a constraint recusa o gasto que o levaria abaixo de zero). security_invoker: a RLS decide o que entra na soma.';

-- =============================================================================
-- 5. OS FATOS — payload autossuficiente
-- =============================================================================

create or replace function fund.contribution_payload(p fund.contributions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'contributionId', p.id,
    'storeId',        p.store_id,
    'storeName',      p.store_name,
    'competenceOn',   p.competence_on,
    'amountCents',    p.amount_cents,
    'currency',       p.currency,
    'note',           p.note
  );
$$;

comment on function fund.contribution_payload(fund.contributions) is
  'O envelope de uma contribuição — AUTOSSUFICIENTE, com o lojista pelo NOME carimbado. Quem escuta não faz join.';

create or replace function fund.expense_payload(p fund.expenses)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'expenseId',    p.id,
    'campaignId',   p.campaign_id,
    'campaignName', p.campaign_name,
    'amountCents',  p.amount_cents,
    'currency',     p.currency,
    'reason',       p.reason
  );
$$;

comment on function fund.expense_payload(fund.expenses) is
  'O envelope de um gasto — AUTOSSUFICIENTE, com a campanha pelo NOME carimbado. Quem escuta não faz join.';

create or replace function fund.on_contribution_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform fund.emit_event(new.tenant_id, 'fund.contribution.recorded', fund.contribution_payload(new));
  return new;
end;
$$;

create trigger fund_contributions_emit_recorded
  after insert on fund.contributions
  for each row execute function fund.on_contribution_recorded();

create or replace function fund.on_expense_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform fund.emit_event(new.tenant_id, 'fund.expense.recorded', fund.expense_payload(new));
  return new;
end;
$$;

create trigger fund_expenses_emit_recorded
  after insert on fund.expenses
  for each row execute function fund.on_expense_recorded();

-- =============================================================================
-- 6. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema fund                  from public, anon, authenticated;
revoke all on all tables    in schema fund from public, anon, authenticated;
revoke all on all functions in schema fund from public, anon, authenticated;

grant usage on schema fund to authenticated;

-- ⛔ SÓ SELECT e INSERT nos dois livros — sem UPDATE, sem DELETE (imutáveis).
grant select, insert on fund.contributions to authenticated;
grant select, insert on fund.expenses      to authenticated;

grant select on fund.balance to authenticated;

grant execute on function fund.can_access(uuid) to authenticated;

-- `fund.emit_event` e os payloads NÃO são concedidos. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum UPDATE/DELETE nos livros. Nenhuma coluna de saldo. Nenhuma FK
-- cruzada (mall.stores/marketing por id solto). Nenhum objeto fora de `fund`.
-- Nenhuma leitura de schema alheio. `consumes` VAZIO (Lei 7). O saldo NUNCA
-- fica negativo — a quarta resposta, mais estrita que bank/inv/invest.
-- =============================================================================
