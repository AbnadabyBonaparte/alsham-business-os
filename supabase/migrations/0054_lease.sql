-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0054_lease.sql
-- Módulo 39: Locação de Lojistas. Schema `lease`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §22,
-- depois do `0053_mall.sql`. Segundo módulo da Missão Nove (Onda 6 — a
-- ÚLTIMA da campanha), Vertical 🛍 Shopping Centers.
--
-- Taxonomia: Vertical 🛍 Shopping Centers — capacidade *Contratos de locação*.
-- Spec: docs/canon/MODULO-LEASE-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CANON CENTRAL: NÃO REESCREVE O CTR (Lei do Reaproveitamento)
-- -----------------------------------------------------------------------------
-- Vigência, reajuste, renovação e rescisão JÁ SÃO o `ctr` (Módulo 13) — um
-- contrato de locação é, na física do canon, um `ctr.contracts` como
-- qualquer outro. Este módulo NÃO recria termo vigente, NÃO recria reajuste,
-- NÃO recria renovação, NÃO recria rescisão. O contrato vive lá, referenciado
-- aqui por ID SOLTO (`contract_id`, sem FK) + nome carimbado pela tela
-- (`contract_ref`). Da mesma forma, o lojista já é o `mall.stores` (Módulo
-- 38) — referenciado por ID SOLTO (`store_id`, sem FK) + nome carimbado
-- (`store_name`).
--
-- O QUE É DO OFÍCIO DO SHOPPING — e só isso mora aqui:
--   1. o TERMO COMERCIAL sobre vendas (`revenue_share`, TEXTO LIVRE — o
--      sistema NÃO calcula comissão; percentual/regra é decisão de gente,
--      igual ao índice de reajuste do ctr — a mesma Lei 3 aplicada de novo);
--   2. o RELATÓRIO MENSAL DE VENDAS do lojista — ato imutável, registrado
--      por gente (sem POS integrado — cálculo automático é integração
--      futura, declarada FORA na spec §5).
--
-- `contract_id` e `store_id` são NOT NULL: sem os dois a locação não tem o
-- que vincular — é exatamente o que este módulo existe para amarrar. Ainda
-- assim são SOLTOS (sem FK cruzada): o vínculo é com o TIPO de entidade
-- (um contrato, uma loja), nunca com uma linha que este schema possa
-- policiar ou fazer join. Um `contract_id` inexistente insere sem erro — a
-- integridade referencial daquele dado é do `ctr`, não daqui.
--
-- -----------------------------------------------------------------------------
-- CICLO DE VIDA — a MAIS SIMPLES do catálogo, de propósito
-- -----------------------------------------------------------------------------
--   active → ended (TERMINAL)
--
-- ⭐ Só um estado final, e uma única permissão (`lease.agreement.manage`)
-- cobre cadastrar E encerrar — diferente do par manage/decide do mall e do
-- ctr. Re-perguntado: a locação comercial de um lojista não tem o meio-termo
-- do contrato de aluguel abaixo dela (que já ganhou reajuste/renovação no
-- ctr) nem a reversibilidade do lojista acima dela (que já ganhou
-- active↔archived no mall) — ela é a CAMADA FINA entre os dois, e uma camada
-- fina não inventa física própria: nasce, existe, um dia termina. Terminar
-- exige RAZÃO (a lição do ctr.terminated / deal.lost) e é FROZEN — depois de
-- `ended` a linha inteira para de mudar; encerrar de novo é acordo novo,
-- fora deste módulo (é o ctr que decide se o contrato de baixo continua).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS REFORÇADO ("outra praça de outro dono usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA revenue_share TEXTO LIVRE — "8% sobre vendas", "aluguel fixo +
--      3% acima de X", "isento no primeiro ano" é vocabulário de cada
--      negociação; um enum ou um número fixo congelaria a régua comercial
--      de um shopping no schema de todos.
--   ✅ ENTRA o relatório de vendas como FATO CONSUMADO — quem relatou, de
--      que competência, quanto. O sistema REGISTRA o que gente informou;
--      não audita, não integra POS, não calcula comissão.
--   ❌ NÃO ENTRA vigência/reajuste/renovação/rescisão (é do ctr — id solto).
--   ❌ NÃO ENTRA cadastro de lojista ou unidade física (é do mall/spc — id
--      solto ao mall aqui; o mall já reaproveita o spc por conta própria).
--   ❌ NÃO ENTRA cálculo automático de comissão sobre o relatório de vendas
--      nem integração de POS — capacidade futura, declarada NÃO CONSTRUÍDA.
-- =============================================================================

create schema if not exists lease;

comment on schema lease is
  'Módulo Locação de Lojistas. Vertical shopping-centers da Taxonomia. NÃO reescreve o ctr: vigência/reajuste/renovação/rescisão são do ctr, por id solto (contract_id). O lojista é do mall, também por id solto (store_id). Aqui mora só o termo comercial sobre vendas (texto livre) e o relatório mensal de vendas do lojista, imutável. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima nona vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function lease.emit_event(
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
  if p_event_type not like 'lease.%' then
    raise exception 'lease.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'lease',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function lease.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function lease.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'lease.agreement.manage')
      or core.has_permission(p_tenant_id, 'lease.report.manage');
$$;

create or replace function lease.touch_updated_at()
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
-- 2. AGREEMENTS — a locação comercial (o vínculo, não o contrato nem a loja)
-- =============================================================================

create table lease.agreements (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao ctr — SEM FK. O contrato (vigência/reajuste/renovação/
  -- rescisão) é integralmente do ctr; aqui só o vínculo + nome carimbado.
  contract_id   uuid        not null,
  contract_ref  text        not null default '',
  -- ⭐ ID SOLTO ao mall — SEM FK. O cadastro do lojista é do mall.
  store_id      uuid        not null,
  store_name    text        not null default '',
  -- ⭐ O termo comercial sobre vendas — TEXTO LIVRE, dado do tenant. O
  -- sistema NUNCA calcula percentual/regra (a mesma Lei 3 do índice do ctr).
  revenue_share text        not null default '',
  status        text        not null default 'active'
              check (status in ('active', 'ended')),
  -- A razão do encerramento. Obrigatória ao encerrar (§2.2).
  end_reason    text        not null default '',
  -- ⭐ O ATO do encerramento, carimbado pelo SERVIDOR (padrão ctr.decided_*).
  ended_at      timestamptz,
  ended_by      uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint agreements_id_tenant unique (id, tenant_id),
  -- O estado e o carimbo contam a mesma história (padrão ctr/mall).
  constraint agreements_end_coherent check (
    (status = 'ended'  and ended_at is not null and length(btrim(end_reason)) > 0) or
    (status = 'active' and ended_at is null and end_reason = '')
  )
);

create index agreements_book_idx
  on lease.agreements (tenant_id, status, created_at desc);
create index agreements_contract_idx
  on lease.agreements (tenant_id, contract_id);
create index agreements_store_idx
  on lease.agreements (tenant_id, store_id);

alter table lease.agreements enable row level security;
alter table lease.agreements force row level security;

create policy agreements_select on lease.agreements
  for select to authenticated
  using (lease.can_access(tenant_id));

create policy agreements_insert on lease.agreements
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'lease.agreement.manage'));

-- ⚠️ Largo por padrão (can_access — o mesmo do mall): quem tem QUALQUER das
-- duas permissões pode editar campo simples. A permissão ESPECÍFICA
-- (`lease.agreement.manage`) é exigida pelo GATILHO da transição (§2.2),
-- não pela RLS — igual ao mall.store.decide sobre mall.can_access.
create policy agreements_update on lease.agreements
  for update to authenticated
  using (lease.can_access(tenant_id))
  with check (lease.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. A locação encerrada é história comercial.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVA
-- -----------------------------------------------------------------------------

create or replace function lease.guard_agreement_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'a locação nasce ativa — encerrar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger agreements_stamp
  before insert on lease.agreements
  for each row execute function lease.guard_agreement_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/lease
-- -----------------------------------------------------------------------------
-- ⭐ active → ended: a única transição do catálogo inteiro. A camada fina não
-- inventa física própria: quem tem meio-termo é o ctr (abaixo) e o mall
-- (acima).

create or replace function lease.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active', 'ended')
  );
$$;

comment on function lease.allowed_transition(text, text) is
  'Ciclo de vida da locação comercial. Espelho de ALLOWED_TRANSITIONS em @alsham/lease. active → ended: TERMINAL. A camada fina não reimplementa a física do ctr (vigência/reajuste/renovação/rescisão) nem a do mall (active↔archived).';

create or replace function lease.guard_agreement_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not lease.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da locação', old.status, new.status
      using errcode = '22023';
  end if;

  -- ⭐ Uma única permissão cobre registrar E encerrar — a locação não tem o
  -- par manage/decide do mall e do ctr: é a camada fina entre os dois.
  if not core.has_permission(new.tenant_id, 'lease.agreement.manage') then
    raise exception 'encerrar a locação exige a permissão lease.agreement.manage'
      using errcode = '42501';
  end if;

  if length(btrim(new.end_reason)) = 0 then
    raise exception 'encerrar exige a razão: locação sem motivo é história que ninguém consegue ler depois'
      using errcode = '22023';
  end if;

  new.ended_at := now();
  new.ended_by := (select auth.uid());
  return new;
end;
$$;

create trigger agreements_guard_status
  before update of status on lease.agreements
  for each row execute function lease.guard_agreement_transition();

-- -----------------------------------------------------------------------------
-- 2.3 ⭐ ENDED É FROZEN — a locação encerrada não muda mais, nada nela
-- -----------------------------------------------------------------------------

create or replace function lease.guard_agreement_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'ended' then
    raise exception 'locação encerrada é terminal: nada nela muda — encerrar de novo é acordo novo, fora deste módulo'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger agreements_frozen
  before update on lease.agreements
  for each row execute function lease.guard_agreement_frozen();

-- =============================================================================
-- 3. O FATO DA LOCAÇÃO — payload autossuficiente (contrato e loja pelo NOME)
-- =============================================================================

create or replace function lease.agreement_payload(p lease.agreements)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'agreementId',  p.id,
    'contractId',   p.contract_id,
    'contractRef',  p.contract_ref,
    'storeId',      p.store_id,
    'storeName',    p.store_name,
    'revenueShare', p.revenue_share,
    'status',       p.status,
    'endReason',    p.end_reason,
    'endedAt',      p.ended_at
  );
$$;

comment on function lease.agreement_payload(lease.agreements) is
  'O envelope de uma locação comercial — AUTOSSUFICIENTE, com o contrato e a loja pelo NOME carimbado. Quem escuta não faz join nem com o ctr nem com o mall.';

create or replace function lease.on_agreement_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform lease.emit_event(new.tenant_id, 'lease.agreement.registered', lease.agreement_payload(new));
  return new;
end;
$$;

create trigger agreements_emit_registered
  after insert on lease.agreements
  for each row execute function lease.on_agreement_registered();

create or replace function lease.on_agreement_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status = 'ended' then
    perform lease.emit_event(new.tenant_id, 'lease.agreement.ended', lease.agreement_payload(new));
  end if;
  return new;
end;
$$;

create trigger agreements_emit_changed
  after update on lease.agreements
  for each row execute function lease.on_agreement_changed();

-- =============================================================================
-- 4. SALES_REPORTS — ⭐ O RELATÓRIO DE VENDAS É REGISTRO IMUTÁVEL (três camadas)
-- -----------------------------------------------------------------------------
-- O sistema REGISTRA o que gente informou; não integra POS, não audita, não
-- calcula comissão sobre o valor. `competency` aceita passado — fato
-- consumado registrado depois (padrão inv/ctr.adjustments).
-- =============================================================================

create table lease.sales_reports (
  id                     uuid        primary key default gen_random_uuid(),
  tenant_id              uuid        not null references core.tenants (id) on delete cascade,
  agreement_id           uuid        not null,
  -- Competência mensal do relatório (fato consumado — aceita passado).
  competency             date        not null,
  reported_amount_cents  bigint      not null check (reported_amount_cents >= 0),
  currency               char(3)     check (currency is null or currency ~ '^[A-Z]{3}$'),
  note                   text        not null default '',
  reported_at            timestamptz not null default now(),
  reported_by            uuid        references auth.users (id) on delete set null,
  constraint sales_reports_agreement_fk
    foreign key (agreement_id, tenant_id)
    references lease.agreements (id, tenant_id)
    on delete restrict
);

create index sales_reports_book_idx
  on lease.sales_reports (tenant_id, agreement_id, competency desc, reported_at desc);

alter table lease.sales_reports enable row level security;
alter table lease.sales_reports force row level security;

create policy sales_reports_select on lease.sales_reports
  for select to authenticated
  using (lease.can_access(tenant_id));

create policy sales_reports_insert on lease.sales_reports
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'lease.report.manage'));

-- ⛔ Sem policy / grant de UPDATE ou DELETE. O relatório é fato consumado.

create or replace function lease.guard_report_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o relatório de vendas é registro de fato consumado: não se edita nem se apaga. Corrigir é registrar outro relatório.'
    using errcode = '42501';
end;
$$;

create trigger sales_reports_immutable
  before update or delete on lease.sales_reports
  for each row execute function lease.guard_report_immutable();

-- -----------------------------------------------------------------------------
-- 4.1 O carimbo do servidor — quem registrou e quando, nunca do formulário
-- -----------------------------------------------------------------------------

create or replace function lease.guard_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.reported_at := now();
  new.reported_by := (select auth.uid());
  return new;
end;
$$;

create trigger sales_reports_stamp
  before insert on lease.sales_reports
  for each row execute function lease.guard_report_insert();

-- -----------------------------------------------------------------------------
-- 4.2 O FATO — payload autossuficiente
-- -----------------------------------------------------------------------------

create or replace function lease.sales_report_payload(p lease.sales_reports)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'reportId',            p.id,
    'agreementId',         p.agreement_id,
    'competency',          p.competency,
    'reportedAmountCents', p.reported_amount_cents,
    'currency',            p.currency,
    'note',                p.note,
    'reportedAt',          p.reported_at
  );
$$;

comment on function lease.sales_report_payload(lease.sales_reports) is
  'O envelope de um relatório de vendas — AUTOSSUFICIENTE. Sem cálculo de comissão: o sistema registra o que gente informou.';

create or replace function lease.on_report_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform lease.emit_event(new.tenant_id, 'lease.report.recorded', lease.sales_report_payload(new));
  return new;
end;
$$;

create trigger sales_reports_emit_recorded
  after insert on lease.sales_reports
  for each row execute function lease.on_report_recorded();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema lease                  from public, anon, authenticated;
revoke all on all tables    in schema lease from public, anon, authenticated;
revoke all on all functions in schema lease from public, anon, authenticated;

grant usage on schema lease to authenticated;

grant select, insert, update on lease.agreements     to authenticated;
-- ⛔ SÓ select+insert no livro de vendas: fato consumado não se edita.
grant select, insert         on lease.sales_reports   to authenticated;

grant execute on function lease.can_access(uuid) to authenticated;

-- `lease.emit_event` NÃO é concedida. `lease.agreement_payload` e
-- `lease.sales_report_payload` são encanamento dos gatilhos, não API de
-- tela. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT de dado. Nenhuma vigência/reajuste/renovação/rescisão
-- reimplementada (é do ctr, por id solto). Nenhum cadastro de lojista ou
-- unidade física reimplementado (é do mall/spc, por id solto). Nenhum
-- cálculo de comissão. Nenhum objeto fora de `lease`. Nenhuma leitura de
-- schema alheio — nem do ctr, nem do mall. `consumes` VAZIO (Lei 7).
-- =============================================================================
