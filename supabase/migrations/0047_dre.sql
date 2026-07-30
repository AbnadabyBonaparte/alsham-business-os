-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0047_dre.sql
-- Módulo 32: DRE Gerencial. Schema `dre`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §20.
-- ⚠️ ESTA MIGRATION TRAZ CONSUMIDOR: o apps/api PRECISA de redeploy no apply
-- (as inscrições da projeção só existem no build novo). Ver runbook §20.
--
-- Taxonomia: Domain 💰 Financeiro — capacidade *DRE*.
-- Spec: docs/canon/MODULO-DRE-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⛔ ISTO É DRE GERENCIAL — NÃO É FISCAL (Lei 3, em garrafal)
-- -----------------------------------------------------------------------------
-- Este módulo NÃO emite SPED, ECD, ECF nem qualquer obrigação acessória. DRE
-- fiscal, plano de contas contábil e apuração de tributos são OFÍCIO DO
-- CONTADOR e se INTEGRAM (Lei 3), nunca se constroem aqui. O que este módulo
-- faz é a leitura GERENCIAL do resultado: quanto entrou de receita, quanto
-- saiu de custo e despesa, quanto sobrou — com as linhas que o TENANT desenha.
--
-- -----------------------------------------------------------------------------
-- ⭐ O PLANO DE LINHAS É DESENHO DO TENANT — jamais plano de contas semeado
-- -----------------------------------------------------------------------------
-- `dre.lines` é a estrutura da DRE que o tenant monta: cada linha tem um nome
-- livre, uma NATUREZA (receita, custo ou despesa — CHECK argumentado, física
-- da demonstração) e a CATEGORIA que ela agrega. NÃO existe plano de contas
-- semeado ("Receita Bruta / CMV / Despesas Administrativas" é a estrutura de
-- UMA empresa). A natureza é o único vocabulário fixo, porque é física
-- contábil universal — receita soma, custo e despesa subtraem.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ OS VALORES NASCEM DO LIVRO — consumidor real de cash.* E cc.*
-- -----------------------------------------------------------------------------
-- A DRE NÃO tem lançamento próprio. Os valores de cada linha nascem dos
-- LIVROS de outros módulos, projetados por evento:
--   · `cash.entry.registered` — o desembolso/recebimento pela categoria;
--   · `cc.rateio.executed` — o custo rateado, pela origem do rateio.
-- É o padrão E10 (dun/bud), agora com DOIS produtores. A projeção grava só por
-- `dre.record_external_entry()` (§5); a origem vem de `envelope.producedBy`.
--
-- ⚠️ **A DRE NÃO inventa regra de exclusividade de fonte** (a lição do
-- `cash §5`): ela agrega o que o PLANO do tenant aponta. Se o tenant criar uma
-- linha que casa a categoria do caixa E outra que casa o nome do rateio do
-- MESMO custo, o dobro aparece — e é escolha visível no plano, não erro do
-- sistema. O sistema não adivinha exclusividade que ninguém desenhou.
--
-- ⭐ LINHA SEM LANÇAMENTO NÃO APARECE (a lição do nps): o demonstrativo é o
-- JOIN das linhas com o livro projetado — linha sem valor não vira zero
-- decorativo, simplesmente não entra. Totais e subtotais são VIEWS calculadas,
-- nunca colunas. A competência vem da DATA do lançamento.
-- =============================================================================

create schema if not exists dre;

comment on schema dre is
  'Módulo DRE Gerencial. Domain finance da Taxonomia. NÃO é fiscal (Lei 3). Plano de linhas desenhado pelo tenant; os valores nascem dos livros do cash e do cc, projetados por evento; totais são views. Não cria objeto em core nem lê schema alheio.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — trigésima segunda vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function dre.emit_event(
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
  if p_event_type not like 'dre.%' then
    raise exception 'dre.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'dre',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function dre.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function dre.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'dre.line.manage')
      or core.has_permission(p_tenant_id, 'dre.statement.read');
$$;

create or replace function dre.touch_updated_at()
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
-- 2. LINES — o plano da DRE que o tenant desenha
-- -----------------------------------------------------------------------------
-- A NATUREZA é CHECK argumentado (física contábil); a categoria é a chave de
-- casamento com os livros. Volta do arquivo (o argumento do crm).
-- =============================================================================

create table dre.lines (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references core.tenants (id) on delete cascade,
  name           text        not null check (length(btrim(name)) > 0),
  -- ⭐ A natureza é física da demonstração: receita soma, custo/despesa subtraem.
  kind           text        not null check (kind in ('revenue', 'cost', 'expense')),
  -- ⭐ A categoria/origem que esta linha agrega dos livros (texto livre).
  match_category text        not null check (length(btrim(match_category)) > 0),
  position       integer     not null default 0,
  currency       char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  status         text        not null default 'active'
                 check (status in ('active', 'archived')),
  created_at     timestamptz not null default now(),
  created_by     uuid        references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint dre_lines_id_tenant unique (id, tenant_id)
);

-- Duas linhas ATIVAS casando a mesma categoria+moeda contariam o mesmo dinheiro.
create unique index dre_lines_unique_active_match
  on dre.lines (tenant_id, lower(btrim(match_category)), currency)
  where status = 'active';

create trigger dre_lines_touch
  before update on dre.lines
  for each row execute function dre.touch_updated_at();

alter table dre.lines enable row level security;
alter table dre.lines force row level security;

create policy dre_lines_select on dre.lines
  for select to authenticated
  using (dre.can_access(tenant_id));

create policy dre_lines_insert on dre.lines
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'dre.line.manage'));

create policy dre_lines_update on dre.lines
  for update to authenticated
  using (core.has_permission(tenant_id, 'dre.line.manage'))
  with check (core.has_permission(tenant_id, 'dre.line.manage'));

-- ⛔ Sem DELETE. Linha com histórico é história; arquivar é status, e volta.

create or replace function dre.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function dre.allowed_transition(text, text) is
  'Ciclo de vida da linha. Espelho de ALLOWED_TRANSITIONS em @alsham/dre — há teste que lê este arquivo e compara.';

create or replace function dre.guard_line_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    -- A natureza e a moeda não mudam com histórico — reclassificaria o passado.
    if new.kind is distinct from old.kind or new.currency is distinct from old.currency then
      raise exception 'a natureza e a moeda da linha não mudam: a linha diferente é linha nova'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if not dre.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da linha', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger dre_lines_guard_status
  before update on dre.lines
  for each row execute function dre.guard_line_transition();

-- =============================================================================
-- 3. REALIZED_ENTRIES — ⭐ a projeção dos livros (padrão E10, DOIS produtores)
-- -----------------------------------------------------------------------------
-- Alimentada SÓ por `dre.record_external_entry()` (§5). O cliente LÊ; não
-- escreve. A origem vem de envelope.producedBy, por parâmetro.
-- =============================================================================

create table dre.realized_entries (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  source_module_id    text        not null check (length(btrim(source_module_id)) > 0),
  source_kind         text        not null check (length(btrim(source_kind)) > 0),
  external_ref        text        not null,
  category_name       text        not null check (length(btrim(category_name)) > 0),
  currency            char(3)     not null check (currency ~ '^[A-Z]{3}$'),
  occurred_on         date        not null,
  signed_amount_cents bigint      not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- ⭐ Idempotência por documento e produtor: a reentrega não conta duas vezes,
  -- e um cash e um cc com o MESMO id não se atropelam.
  constraint dre_realized_unique_ref unique (tenant_id, source_module_id, external_ref)
);

create index dre_realized_match_idx
  on dre.realized_entries (tenant_id, lower(category_name), currency, occurred_on);

alter table dre.realized_entries enable row level security;
alter table dre.realized_entries force row level security;

create policy dre_realized_select on dre.realized_entries
  for select to authenticated
  using (dre.can_access(tenant_id));

-- ⛔ Nenhuma policy de escrita: quem escreve é a projeção (§5), service_role.

-- =============================================================================
-- 4. O DEMONSTRATIVO — VIEWS calculadas, jamais colunas de total
-- -----------------------------------------------------------------------------
-- ⚠️ security_invoker. ⭐ INNER JOIN: linha sem lançamento NÃO aparece (nps).
-- A competência vem da DATA do lançamento (mês).
-- =============================================================================

create view dre.statement
  with (security_invoker = true)
as
select l.tenant_id,
       l.id                                            as line_id,
       l.name                                          as line_name,
       l.kind,
       l.position,
       l.currency,
       date_trunc('month', e.occurred_on)::date        as competence_month,
       sum(e.signed_amount_cents)                      as amount_cents,
       count(e.id)                                     as entry_count
  from dre.lines l
  join dre.realized_entries e
    on e.tenant_id = l.tenant_id
   and lower(e.category_name) = lower(l.match_category)
   and e.currency = l.currency
 where l.status = 'active'
 group by l.tenant_id, l.id, l.name, l.kind, l.position, l.currency, 7;

comment on view dre.statement is
  'A DRE gerencial: cada linha com valor, por mês de competência. INNER JOIN — linha sem lançamento NÃO aparece (nps). Calculada, nunca coluna. security_invoker.';

create view dre.result
  with (security_invoker = true)
as
select l.tenant_id,
       l.currency,
       date_trunc('month', e.occurred_on)::date        as competence_month,
       sum(case when l.kind = 'revenue' then e.signed_amount_cents else 0 end) as revenue_cents,
       sum(case when l.kind = 'cost'    then e.signed_amount_cents else 0 end) as cost_cents,
       sum(case when l.kind = 'expense' then e.signed_amount_cents else 0 end) as expense_cents,
       sum(e.signed_amount_cents)                       as result_cents
  from dre.lines l
  join dre.realized_entries e
    on e.tenant_id = l.tenant_id
   and lower(e.category_name) = lower(l.match_category)
   and e.currency = l.currency
 where l.status = 'active'
 group by l.tenant_id, l.currency, 3;

comment on view dre.result is
  'O resultado por mês e moeda: receita, custo, despesa e o resultado (soma dos sinais). Subtotais calculados, nunca colunas.';

-- =============================================================================
-- 5. ⭐ A PORTA DE PROJEÇÃO — espelho consciente da recon/dun/bud
-- -----------------------------------------------------------------------------
-- Idempotente por (tenant_id, source_module_id, external_ref). A origem vem por
-- argumento (envelope.producedBy). Só service_role — o cliente não projeta.
-- =============================================================================

create or replace function dre.record_external_entry(
  p_tenant_id           uuid,
  p_source_module_id    text,
  p_source_kind         text,
  p_external_ref        text,
  p_category_name       text,
  p_currency            char(3),
  p_occurred_on         date,
  p_signed_amount_cents bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touched integer;
begin
  if p_source_module_id is null or length(btrim(p_source_module_id)) = 0 then
    raise exception 'dre.record_external_entry: origem do lançamento não informada' using errcode = '22023';
  end if;
  if p_category_name is null or length(btrim(p_category_name)) = 0 then
    raise exception 'dre.record_external_entry: lançamento sem categoria não casa linha' using errcode = '22023';
  end if;

  insert into dre.realized_entries (
    tenant_id, source_module_id, source_kind, external_ref, category_name,
    currency, occurred_on, signed_amount_cents
  )
  values (
    p_tenant_id, p_source_module_id, coalesce(nullif(btrim(p_source_kind), ''), 'external'),
    p_external_ref, btrim(p_category_name),
    p_currency, p_occurred_on, p_signed_amount_cents
  )
  on conflict (tenant_id, source_module_id, external_ref) do update
     set source_kind         = excluded.source_kind,
         category_name       = excluded.category_name,
         currency            = excluded.currency,
         occurred_on         = excluded.occurred_on,
         signed_amount_cents = excluded.signed_amount_cents,
         updated_at          = now()
   where (dre.realized_entries.category_name, dre.realized_entries.currency,
          dre.realized_entries.occurred_on, dre.realized_entries.signed_amount_cents)
         is distinct from
         (btrim(excluded.category_name), excluded.currency,
          excluded.occurred_on, excluded.signed_amount_cents);

  get diagnostics v_touched = row_count;
  return case when v_touched > 0 then 'projected' else 'unchanged' end;
end;
$$;

comment on function dre.record_external_entry(uuid, text, text, text, text, char, date, bigint) is
  'Projeta um lançamento de um livro alheio na DRE. Idempotente por (tenant_id, source_module_id, external_ref). Origem por argumento (envelope.producedBy). Só service_role.';

-- =============================================================================
-- 6. OS FATOS
-- =============================================================================

create or replace function dre.line_payload(p dre.lines)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'lineId',        p.id,
    'name',          p.name,
    'kind',          p.kind,
    'matchCategory', p.match_category,
    'position',      p.position,
    'currency',      p.currency,
    'status',        p.status
  );
$$;

create or replace function dre.on_line_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform dre.emit_event(new.tenant_id, 'dre.line.registered', dre.line_payload(new));
  return new;
end;
$$;

create trigger dre_lines_emit_registered
  after insert on dre.lines
  for each row execute function dre.on_line_registered();

create or replace function dre.on_line_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    perform dre.emit_event(new.tenant_id, 'dre.line.archived', dre.line_payload(new));
  end if;
  return new;
end;
$$;

create trigger dre_lines_emit_changed
  after update on dre.lines
  for each row execute function dre.on_line_changed();

-- =============================================================================
-- 7. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema dre                  from public, anon, authenticated;
revoke all on all tables    in schema dre from public, anon, authenticated;
revoke all on all functions in schema dre from public, anon, authenticated;

grant usage on schema dre to authenticated;

grant select, insert, update on dre.lines to authenticated;

-- ⛔ SÓ SELECT na projeção e nas views: quem escreve é dre.record_external_entry().
grant select on dre.realized_entries to authenticated;
grant select on dre.statement        to authenticated;
grant select on dre.result           to authenticated;

grant execute on function dre.can_access(uuid) to authenticated;

-- ⛔ `dre.record_external_entry` NÃO é concedida a authenticated — só
-- service_role a chama, pela composição do apps/api. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum lançamento próprio. Nenhuma coluna de total/subtotal. Nenhum
-- plano de contas semeado. Nenhuma obrigação fiscal. Linha sem lançamento não
-- aparece. Nenhum objeto fora de `dre`. Nenhuma leitura de schema alheio.
-- =============================================================================
