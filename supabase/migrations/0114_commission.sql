-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0114_commission.sql
-- Módulo 99: Comissões. Schema `commission`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/canon/MODULO-COMMISSION-SPEC.md
-- e o runbook. Cartão VERTICAL do catálogo, Vertical 💇 Beleza & Estética
-- (`vertical_key='beauty'`, VerticalKey do `@alsham/core`).
--
-- Taxonomia: Vertical 💇 Beleza & Estética (§6, "vertical viva: Suprema
-- Beleza") — capacidade *Comissões*.
-- Spec: docs/canon/MODULO-COMMISSION-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE ESTE MÓDULO É — O LIVRO DE COMISSÕES, LANÇAMENTO IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Cada comissão é um FATO CONSUMADO: um profissional ganhou tanto por um
-- serviço prestado, num dia, e o registro nasce pronto — para sempre. É a mesma
-- física do `timesheet` (o livro de horas), do `pcost` (o livro de custos), do
-- `loyalty` (o livro de pontos) e do `recv`/`occ` (o ato pontual imutável): NÃO
-- TEM coluna de status, não tem ciclo de vida, não tem transição. Não existe
-- "comissão em aberto" nem "comissão em andamento" — o serviço ACONTECE e vira
-- linha. Corrigir é lançar OUTRA comissão (o ato inverso, com nota), nunca
-- reescrever.
--
-- ⭐ Consequência direta: `commission.commissions` **NÃO TEM
-- `allowed_transition`** e **NÃO TEM `updated_at`** (não há o que tocar num
-- fato que não muda). O cliente não tem NENHUMA porta de UPDATE nem DELETE (nem
-- policy, nem grant); e mesmo assim o gatilho abaixo recusa a reescrita até
-- para o dono do banco — a mesma física do `timesheet`/`fisc`.
--
-- -----------------------------------------------------------------------------
-- ⚠️ NÃO É MOTOR DE CÁLCULO (Lei 7) — O QUE ESTE MÓDULO DELIBERADAMENTE NÃO FAZ
-- -----------------------------------------------------------------------------
-- Toda tentação de "salão" é multiplicar o preço do serviço por um percentual e
-- gravar a comissão automaticamente. ISSO NÃO ACONTECE AQUI. O valor da
-- comissão (`commission_amount_cents`) é REGISTRADO por quem lança — nunca
-- derivado por regra. O `base_amount_cents` (o preço do serviço sobre o qual a
-- comissão foi combinada) é apenas INFORMATIVO: registra sobre quanto se
-- combinou, mas NÃO existe nenhuma função, trigger ou coluna gerada que
-- multiplique. A regra de % por serviço/profissional é configuração do tenant
-- (capacidade futura); a apuração e o pagamento são o `cash`/`ap` genérico. Um
-- número que não foi construído não vai ao ar (Lei 7).
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outro salão / outra barbearia usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o profissional por ID SOLTO (uuid, obrigatório) + nome carimbado
--      pela TELA; o serviço em TEXTO LIVRE (`service` — "corte"/"coloração"/
--      "manicure" é vocabulário de cada casa, NUNCA enum); o valor da comissão
--      (`commission_amount_cents`, >= 0, REGISTRADO); o valor-base informativo
--      (`base_amount_cents`, opcional); o dia (`occurred_on`); a nota TEXTO
--      LIVRE opcional.
--   ❌ NÃO ENTRA o cadastro do profissional (é o módulo `professional`, por id
--      solto), a regra de % por serviço (config do tenant — futuro), o cálculo
--      da comissão a partir do preço (Lei 7 — o valor é registrado), a apuração/
--      fechamento de período de comissão e o pagamento (é o cash/ap genérico).
--      `consumes` VAZIO.
--
-- 🔴 O `commission` NÃO LÊ o schema `professional`: o vínculo é por ID SOLTO,
-- SEM FK cruzada e SEM uma linha que toque schema alheio — a Lei do Lego. Não
-- há referência a schema alheio em lugar nenhum deste arquivo.
-- =============================================================================

create schema if not exists commission;

comment on schema commission is
  'Módulo Comissões. Vertical beauty (Beleza & Estética) da Taxonomia. O livro de comissões de profissional por serviço: cada lançamento é LANÇAMENTO IMUTÁVEL, sem ciclo de vida, sem status. NÃO é motor de cálculo (Lei 7): o valor da comissão é REGISTRADO por quem lança, nunca derivado de percentual; o valor-base é informativo. commission_amount_cents >= 0. O profissional é referenciado por ID SOLTO (professional_id) — nunca FK. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function commission.emit_event(
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
  if p_event_type not like 'commission.%' then
    raise exception 'commission.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'commission',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function commission.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function commission.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'commission.commission.record');
$$;

-- =============================================================================
-- 2. COMMISSIONS — ⭐⭐ A COMISSÃO: LANÇAMENTO IMUTÁVEL, SEM CICLO, SEM TRAVE
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. NENHUM
-- updated_at. O registro nasce pronto — e nunca mais muda. O cliente não tem
-- NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant); e mesmo assim o
-- gatilho da §2.2 recusa a reescrita até para o dono do banco — física do
-- timesheet/occ/fisc.
-- =============================================================================

create table commission.commissions (
  id                      uuid          primary key default gen_random_uuid(),
  tenant_id               uuid          not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao cadastro de profissional — SEM FK cruzada (Lei do Lego), obrigatório.
  professional_id         uuid          not null,
  -- O nome do profissional carimbado pela TELA — sobrevive ao redesenho do cadastro.
  professional_name       text          not null check (length(btrim(professional_name)) > 0),
  -- ⭐ O serviço, em TEXTO LIVRE — vocabulário de cada casa, NUNCA enum. Obrigatório.
  service                 text          not null check (length(btrim(service)) > 0),
  -- ⚠️ O preço do serviço sobre o qual a comissão foi combinada — INFORMATIVO,
  -- OPCIONAL. O sistema NÃO calcula a comissão a partir dele (Lei 7).
  base_amount_cents       bigint        check (base_amount_cents is null or base_amount_cents >= 0),
  -- ⭐ O valor da comissão, em centavos. REGISTRADO por quem lança (nunca
  -- derivado de %). >= 0: zero é cortesia; negativo não é comissão — corrigir a
  -- mais é lançar o ato inverso, nunca um número negativo aqui.
  commission_amount_cents bigint        not null check (commission_amount_cents >= 0),
  -- O dia em que o serviço/comissão aconteceu.
  occurred_on             date          not null,
  -- Nota TEXTO LIVRE e OPCIONAL.
  note                    text          not null default '',
  -- ⭐ Os carimbos do FATO — sempre do servidor, nunca do formulário.
  created_at              timestamptz   not null default now(),
  created_by              uuid          references auth.users (id) on delete set null,
  constraint commissions_id_tenant unique (id, tenant_id)
);

create index commissions_book_idx
  on commission.commissions (tenant_id, occurred_on desc, created_at desc);
create index commissions_by_professional_idx
  on commission.commissions (tenant_id, professional_id);

alter table commission.commissions enable row level security;
alter table commission.commissions force row level security;

create policy commissions_select on commission.commissions
  for select to authenticated
  using (commission.can_access(tenant_id));

create policy commissions_insert on commission.commissions
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'commission.commission.record'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — a comissão é fato consumado;
-- não existe porta para reescrevê-la.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — o autor mentido no INSERT é descartado
-- -----------------------------------------------------------------------------

create or replace function commission.guard_commission_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger commissions_stamp
  before insert on commission.commissions
  for each row execute function commission.guard_commission_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve a comissão lançada
-- -----------------------------------------------------------------------------

create or replace function commission.guard_commission_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a comissão é fato consumado: não se edita nem se apaga. Corrigir é lançar o ato inverso.'
    using errcode = '42501';
end;
$$;

create trigger commissions_immutable
  before update or delete on commission.commissions
  for each row execute function commission.guard_commission_immutable();

-- =============================================================================
-- 3. OS FATOS — payload AUTOSSUFICIENTE (o profissional pelo nome, id solto)
-- =============================================================================

create or replace function commission.commission_payload(p commission.commissions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'commissionId',          p.id,
    'professionalId',        p.professional_id,
    'professionalName',      p.professional_name,
    'service',               p.service,
    'baseAmountCents',       p.base_amount_cents,
    'commissionAmountCents', p.commission_amount_cents,
    'occurredOn',            p.occurred_on,
    'note',                  p.note
  );
$$;

comment on function commission.commission_payload(commission.commissions) is
  'O envelope de uma comissão — AUTOSSUFICIENTE, com o profissional pelo NOME carimbado (id solto). Quem escuta não faz join com o schema professional.';

create or replace function commission.on_commission_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform commission.emit_event(new.tenant_id, 'commission.commission.registered', commission.commission_payload(new));
  return new;
end;
$$;

create trigger commissions_emit_registered
  after insert on commission.commissions
  for each row execute function commission.on_commission_registered();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- Função nasce ABERTA a PUBLIC no PostgreSQL — o revoke abaixo apaga isso, e o
-- grant logo em seguida concede só o que é do cliente.
-- =============================================================================

revoke all on schema commission                  from public, anon, authenticated;
revoke all on all tables    in schema commission from public, anon, authenticated;
revoke all on all functions in schema commission from public, anon, authenticated;

grant usage on schema commission to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever/apagar não existe (a comissão é fato).
grant select, insert on commission.commissions to authenticated;

grant execute on function commission.can_access(uuid) to authenticated;

-- `commission.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `commission.commission_payload` é encanamento do gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma allowed_transition. Nenhum
-- updated_at. Nenhum cálculo de comissão a partir de percentual (Lei 7 — o
-- valor é registrado). Nenhuma apuração/pagamento (é o cash/ap, por id solto).
-- Nenhum objeto fora de `commission`. Nenhuma leitura de schema alheio (o
-- profissional por id solto). `consumes` VAZIO (Lei 7).
-- =============================================================================
