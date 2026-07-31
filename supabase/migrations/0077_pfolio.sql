-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0077_pfolio.sql
-- Módulo 62: Portfólio de projetos. Schema `pfolio`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §26, o
-- ÚLTIMO módulo da Onda Treze (Fase 2). ⭐⭐ É A ÚLTIMA PEÇA: com ele o Domain
-- PMO & Projetos — o MAIOR do mapa — chega às 10/10 capacidades. Nasce sob
-- `domain_key='pmo'`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Portfólio* (§5).
-- Spec: docs/canon/MODULO-PFOLIO-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE ESTE MÓDULO É — o agrupamento para leitura executiva
-- -----------------------------------------------------------------------------
-- Um portfólio REÚNE projetos para a diretoria lê-los juntos. Duas peças:
--   • `pfolio.portfolios` — o agrupamento (nome/descrição texto livre);
--   • `pfolio.members`    — o vínculo N:N portfólio↔projeto.
--
-- ⭐ `active ↔ archived` nos DOIS sentidos — o reaproveitamento do `vendor`/`dc`
-- assinado, e o DIVERGE dos fins TERMINAIS do `proj` (Módulo 53). Copiar sem
-- pensar e divergir sem escrever são o mesmo erro (CLAUDE.md); então a pergunta
-- foi refeita: o portfólio é um TRABALHO que encerra (física do `proj`, onde
-- `completed`/`cancelled` não reabrem) ou uma LEITURA que se organiza (física
-- do `vendor`/`dc`, o registro que arquiva e volta)? É leitura: um portfólio
-- que a empresa arquiva ao fim de um ciclo executivo e reabre no seguinte é o
-- MESMO portfólio — obrigá-lo a renascer partiria a lista de projetos em dois.
-- Então `archived → active` EXISTE. Não há carimbo de arquivamento: `active`/
-- `archived` é metadado REVERSÍVEL (só o `updated_at` do touch), não um fim.
--
-- ⭐ MEMBROS N:N — a FK do membro ao portfólio é INTRA-SCHEMA (ALLOWED)
-- -----------------------------------------------------------------------------
-- O membro é uma peça do PRÓPRIO módulo: seu vínculo ao portfólio é uma FK
-- COMPOSTA `(portfolio_id, tenant_id) → pfolio.portfolios(id, tenant_id)`,
-- dentro do MESMO schema — isso é permitido e correto (a Lei do Lego proíbe ler
-- schema ALHEIO, não o próprio). Já o vínculo ao PROJETO é ID SOLTO
-- (`project_id` + `project_name` carimbado pela tela) — cross-module, sem FK: o
-- `pfolio` não conhece o schema do `proj`.
--
-- ⭐ O MESMO projeto pode viver em VÁRIOS portfólios — a unicidade é por
-- `(tenant, portfólio, projeto)`, JAMAIS global em `project_id`. É o ponto do
-- módulo: um projeto aparece na leitura de vários recortes executivos.
-- Membership é MUTÁVEL (projetos entram e saem) — por isso, e só aqui, há
-- policy e grant de DELETE em `members`.
--
-- ANTI-VIÉS: nome/descrição do portfólio em TEXTO LIVRE. `consumes` VAZIO.
-- ⛔ FORA: rollup/agregação automática de métricas dos projetos no portfólio (é
-- frente de BI de LEITURA — Lei 7, sem número sem fonte; sem coluna de rollup
-- armazenada) e orçamento de portfólio (o `bud` genérico, por id solto, futuro).
-- =============================================================================

create schema if not exists pfolio;

comment on schema pfolio is
  'Módulo Portfólio de projetos. Domain pmo da Taxonomia. O portfólio AGRUPA projetos para leitura executiva; nome/descrição TEXTO LIVRE. active ↔ archived existe (o portfólio é leitura que arquiva e volta — o DIVERGE dos fins terminais do proj). Membros N:N: FK ao portfólio INTRA-schema (peça do próprio módulo), id solto ao projeto (cross-module). O MESMO projeto vive em vários portfólios. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — sexagésima segunda vez que este bloco aparece. É lei.
-- =============================================================================

create or replace function pfolio.emit_event(
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
  if p_event_type not like 'pfolio.%' then
    raise exception 'pfolio.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'pfolio',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function pfolio.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function pfolio.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'pfolio.portfolio.manage');
$$;

create or replace function pfolio.touch_updated_at()
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
-- 2. PORTFOLIOS — o agrupamento (active ↔ archived)
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived — a física do vendor/dc: o portfólio arquivado é o MESMO
-- e pode voltar. Sem carimbo de arquivamento: é metadado reversível.
-- =============================================================================

create table pfolio.portfolios (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references core.tenants (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  description text        not null default '',
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint pfolio_portfolios_id_tenant unique (id, tenant_id)
);

create index pfolio_portfolios_roster_idx
  on pfolio.portfolios (tenant_id, status, name);

create trigger pfolio_portfolios_touch
  before update on pfolio.portfolios
  for each row execute function pfolio.touch_updated_at();

alter table pfolio.portfolios enable row level security;
alter table pfolio.portfolios force row level security;

create policy pfolio_portfolios_select on pfolio.portfolios
  for select to authenticated
  using (pfolio.can_access(tenant_id));

create policy pfolio_portfolios_insert on pfolio.portfolios
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pfolio.portfolio.manage'));

create policy pfolio_portfolios_update on pfolio.portfolios
  for update to authenticated
  using (pfolio.can_access(tenant_id))
  with check (pfolio.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE em portfolios. Arquivado é história — e volta.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre ATIVO, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function pfolio.guard_portfolio_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'o portfólio nasce ativo — arquivar é decisão à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger pfolio_portfolios_stamp
  before insert on pfolio.portfolios
  for each row execute function pfolio.guard_portfolio_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/pfolio
-- -----------------------------------------------------------------------------
-- ⭐ active ↔ archived (o portfólio volta — o DIVERGE dos fins terminais do proj).

create or replace function pfolio.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function pfolio.allowed_transition(text, text) is
  'Ciclo de vida do portfólio. Espelho de ALLOWED_TRANSITIONS em @alsham/pfolio — há teste que lê este arquivo e compara. active ↔ archived: o portfólio é leitura que arquiva e volta (o DIVERGE dos fins terminais do proj).';

create or replace function pfolio.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not pfolio.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do portfólio', old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'pfolio.portfolio.manage') then
    raise exception 'arquivar ou reabrir um portfólio exige a permissão pfolio.portfolio.manage'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger pfolio_portfolios_guard_status
  before update of status on pfolio.portfolios
  for each row execute function pfolio.guard_status_transition();

-- =============================================================================
-- 3. MEMBERS — o vínculo N:N portfólio↔projeto
-- -----------------------------------------------------------------------------
-- ⭐ FK ao portfólio COMPOSTA e INTRA-SCHEMA (peça do próprio módulo). ID SOLTO
-- ao projeto (cross-module, sem FK). O MESMO projeto pode estar em VÁRIOS
-- portfólios — unicidade por (tenant, portfólio, projeto), NUNCA global.
-- =============================================================================

create table pfolio.members (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  portfolio_id uuid        not null,
  -- ⭐ O projeto por ID SOLTO — o pfolio não conhece o schema do projeto (53).
  project_id   uuid        not null,
  project_name text        not null default '',
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  -- ⭐ FK COMPOSTA e INTRA-SCHEMA ao portfólio: mantém a integridade de tenant e
  -- barra portfólio inexistente ou de outro tenant. `on delete cascade`: apagar
  -- não acontece em portfolios, mas se acontecesse, os membros iriam junto.
  constraint pfolio_members_portfolio_fk
    foreign key (portfolio_id, tenant_id)
    references pfolio.portfolios (id, tenant_id) on delete cascade,
  -- ⭐ Um projeto aparece UMA vez por portfólio — mas o MESMO projeto pode estar
  -- em outros portfólios (a chave inclui portfolio_id; NÃO é global em project_id).
  constraint pfolio_members_unique unique (tenant_id, portfolio_id, project_id)
);

create index pfolio_members_portfolio_idx
  on pfolio.members (tenant_id, portfolio_id, project_name);

create index pfolio_members_project_idx
  on pfolio.members (tenant_id, project_id);

alter table pfolio.members enable row level security;
alter table pfolio.members force row level security;

create policy pfolio_members_select on pfolio.members
  for select to authenticated
  using (pfolio.can_access(tenant_id));

create policy pfolio_members_insert on pfolio.members
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'pfolio.portfolio.manage'));

-- ⭐ Membership é MUTÁVEL: projetos entram e SAEM. Por isso — e só aqui — há
-- policy de DELETE. Removê-lo não é apagar história de fato consumado; é tirar
-- um projeto do recorte de leitura, e o fato `pfolio.member.removed` registra.
create policy pfolio_members_delete on pfolio.members
  for delete to authenticated
  using (core.has_permission(tenant_id, 'pfolio.portfolio.manage'));

-- -----------------------------------------------------------------------------
-- 3.1 O nascimento do membro: o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function pfolio.guard_member_insert()
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

create trigger pfolio_members_stamp
  before insert on pfolio.members
  for each row execute function pfolio.guard_member_insert();

-- =============================================================================
-- 4. PAYLOADS + EVENTOS DA CAIXA DE SAÍDA
-- =============================================================================

create or replace function pfolio.portfolio_payload(p pfolio.portfolios)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'portfolioId', p.id,
    'name',        p.name,
    'description', p.description,
    'status',      p.status
  );
$$;

comment on function pfolio.portfolio_payload(pfolio.portfolios) is
  'O envelope de um portfólio — AUTOSSUFICIENTE. Quem escuta não faz join.';

create or replace function pfolio.member_payload(p pfolio.members)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'portfolioId', p.portfolio_id,
    'projectId',   p.project_id,
    'projectName', p.project_name
  );
$$;

comment on function pfolio.member_payload(pfolio.members) is
  'O envelope de um membro — AUTOSSUFICIENTE, com o projeto por id solto + nome. Quem escuta não faz join.';

-- 4.1 Fatos do portfólio
create or replace function pfolio.on_portfolio_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pfolio.emit_event(new.tenant_id, 'pfolio.portfolio.registered', pfolio.portfolio_payload(new));
  return new;
end;
$$;

create trigger pfolio_portfolios_emit_registered
  after insert on pfolio.portfolios
  for each row execute function pfolio.on_portfolio_registered();

create or replace function pfolio.on_portfolio_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform pfolio.emit_event(
      new.tenant_id,
      case when new.status = 'archived' then 'pfolio.portfolio.archived'
           else 'pfolio.portfolio.restored' end,
      pfolio.portfolio_payload(new)
    );
  end if;

  return new;
end;
$$;

create trigger pfolio_portfolios_emit_changed
  after update of status on pfolio.portfolios
  for each row execute function pfolio.on_portfolio_changed();

-- 4.2 Fatos do membro (added no insert, removed no delete)
create or replace function pfolio.on_member_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pfolio.emit_event(new.tenant_id, 'pfolio.member.added', pfolio.member_payload(new));
  return new;
end;
$$;

create trigger pfolio_members_emit_added
  after insert on pfolio.members
  for each row execute function pfolio.on_member_added();

create or replace function pfolio.on_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pfolio.emit_event(old.tenant_id, 'pfolio.member.removed', pfolio.member_payload(old));
  return old;
end;
$$;

create trigger pfolio_members_emit_removed
  after delete on pfolio.members
  for each row execute function pfolio.on_member_removed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema pfolio                  from public, anon, authenticated;
revoke all on all tables    in schema pfolio from public, anon, authenticated;
revoke all on all functions in schema pfolio from public, anon, authenticated;

grant usage on schema pfolio to authenticated;

grant select, insert, update on pfolio.portfolios to authenticated;
grant select, insert, delete on pfolio.members    to authenticated;

grant execute on function pfolio.can_access(uuid) to authenticated;

-- `pfolio.emit_event` NÃO é concedida. `pfolio.portfolio_payload` e
-- `pfolio.member_payload` são encanamento dos gatilhos. `anon` não recebe nada.

-- =============================================================================
-- FIM. ⭐⭐ A ÚLTIMA PEÇA — PMO 10/10. Nenhum INSERT. Nenhum enum de tipo.
-- Nenhum nome de cliente. Nenhum objeto fora de `pfolio`. Nenhuma leitura de
-- schema alheio (a FK do membro é INTRA-schema). `consumes` VAZIO.
-- =============================================================================
