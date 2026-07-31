-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0074_gantt.sql
-- Módulo 59: Gantt / Dependências entre marcos. Schema `gantt`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §26, a Onda
-- Treze (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa: 10 capacidades).
-- Nasce sob `domain_key='pmo'`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Gantt* (§5, linha 90:
-- "Projetos · Cronogramas · Kanban · Scrum · Gantt · Recursos · Custos · Riscos
-- · Timesheet · Portfólio").
-- Spec: docs/canon/MODULO-GANTT-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐ A RESSALVA DE HONESTIDADE — o que este módulo É, e o que ele NÃO é
-- -----------------------------------------------------------------------------
-- "Gantt", como conceito de mercado, é em boa parte uma VISTA: um método de
-- desenho sobre marcos que já existem. Este módulo NÃO desenha o gráfico, NÃO
-- calcula datas e NÃO computa caminho crítico. O dado GENUINAMENTE novo é a
-- ARESTA de precedência entre dois marcos: "o marco B não começa antes do marco
-- A". É só a aresta que este módulo guarda.
--
-- ⭐⭐ REGISTRO MUTÁVEL, NÃO LIVRO IMUTÁVEL — o DIVERGE assinado
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). Os
-- livros deste império (recv, pcost, disp, cash, inv…) são IMUTÁVEIS: fato
-- consumado não se apaga. A dependência é o OPOSTO CONSCIENTE: ela é METADADO DO
-- PLANO, não fato consumado — some quando o plano muda. Por isso este módulo TEM
-- policy e grant de DELETE (ao contrário do recv/pcost), e emite
-- `gantt.dependency.removed` quando a aresta cai. Apagar uma dependência não
-- reescreve história nenhuma: só diz que aquela precedência deixou de valer.
--
-- ⭐ O TIPO DA DEPENDÊNCIA é um CHECK argumentado, não texto livre nem enum de
-- tenant: as QUATRO relações clássicas de precedência (finish_to_start,
-- start_to_start, finish_to_finish, start_to_finish) são a FÍSICA do domínio —
-- as quatro combinações reais entre início/fim de duas tarefas. Isso NÃO é
-- vocabulário de casa (como "canal" ou "segmento", que seriam texto livre); é
-- fechado porque a matemática da precedência é fechada. finish_to_start é o
-- default (o caso de longe mais comum).
--
-- ⭐ predecessor <> successor (CHECK): um marco não depende de SI MESMO — a
-- aresta laço é recusada no banco, não só na tela.
--
-- ⭐ (tenant, predecessor, successor) ÚNICO: a mesma aresta não se duplica.
--
-- -----------------------------------------------------------------------------
-- 🔴 OS MARCOS ENTRAM POR ID SOLTO — sem FK, sem ler o schema alheio
-- -----------------------------------------------------------------------------
-- A aresta aponta os marcos do `sched` por id solto (`predecessor_id`/
-- `successor_id` + nomes carimbados pela tela). NÃO há FK cruzada e este arquivo
-- NÃO referencia o schema `sched` (módulo não conhece módulo — a Lei do Lego). O
-- projeto entra por id solto OPCIONAL, espelhando o `sched`, que carrega
-- `project_id`.
--
-- ANTI-VIÉS: nome dos marcos e do projeto carimbados; tipo pela física fechada;
-- `consumes` VAZIO. Sem caminho crítico / cálculo de datas / motor de agenda
-- (FORA — declarado na spec §5).
-- =============================================================================

create schema if not exists gantt;

comment on schema gantt is
  'Módulo Gantt / Dependências entre marcos. Domain pmo (PMO & Projetos) da Taxonomia. A aresta de precedência predecessor → sucessor entre marcos (id solto ao sched). Registro MUTÁVEL (o DIVERGE dos livros imutáveis: a aresta some quando o plano muda). O tipo é CHECK das quatro relações clássicas de precedência. Sem caminho crítico, cálculo de datas ou agenda. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function gantt.emit_event(
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
  if p_event_type not like 'gantt.%' then
    raise exception 'gantt.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'gantt',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function gantt.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function gantt.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'gantt.dependency.manage');
$$;

create or replace function gantt.touch_updated_at()
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
-- 2. DEPENDENCIES — as arestas de precedência
-- =============================================================================

create table gantt.dependencies (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references core.tenants (id) on delete cascade,
  -- 🔴 Os marcos entram por ID SOLTO — sem FK, sem ler o schema do módulo de
  -- cronogramas. Os nomes são carimbados pela tela e fazem a aresta sobreviver
  -- ao redesenho do cronograma.
  predecessor_id  uuid        not null,
  predecessor_name text       not null default '',
  successor_id    uuid        not null,
  successor_name  text        not null default '',
  -- ⭐ CHECK argumentado: as quatro relações clássicas de precedência (a física
  -- do domínio, não vocabulário de tenant). finish_to_start é o default.
  dependency_type text        not null default 'finish_to_start'
                  check (dependency_type in (
                    'finish_to_start',
                    'start_to_start',
                    'finish_to_finish',
                    'start_to_finish'
                  )),
  -- Vínculo solto OPCIONAL ao projeto do proj (espelha o project_id do sched).
  project_id      uuid,
  project_name    text        not null default '',
  created_at      timestamptz not null default now(),
  created_by      uuid        references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint gantt_dependencies_id_tenant unique (id, tenant_id),
  -- ⭐ Um marco não depende de SI MESMO.
  constraint gantt_dependencies_no_self check (predecessor_id <> successor_id),
  -- ⭐ A mesma aresta não se duplica.
  constraint gantt_dependencies_unique_edge unique (tenant_id, predecessor_id, successor_id)
);

create index gantt_dependencies_pred_idx
  on gantt.dependencies (tenant_id, predecessor_id);

create index gantt_dependencies_succ_idx
  on gantt.dependencies (tenant_id, successor_id);

create index gantt_dependencies_project_idx
  on gantt.dependencies (tenant_id, project_id)
  where project_id is not null;

create trigger gantt_dependencies_touch
  before update on gantt.dependencies
  for each row execute function gantt.touch_updated_at();

alter table gantt.dependencies enable row level security;
alter table gantt.dependencies force row level security;

create policy gantt_dependencies_select on gantt.dependencies
  for select to authenticated
  using (gantt.can_access(tenant_id));

create policy gantt_dependencies_insert on gantt.dependencies
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'gantt.dependency.manage'));

create policy gantt_dependencies_update on gantt.dependencies
  for update to authenticated
  using (gantt.can_access(tenant_id))
  with check (gantt.can_access(tenant_id));

-- ⭐⭐ COM policy de DELETE — o DIVERGE assinado dos livros imutáveis (recv/
-- pcost): a dependência é metadado do plano, não fato consumado. Some quando o
-- plano muda. Remover exige a mesma permissão de gerir.
create policy gantt_dependencies_delete on gantt.dependencies
  for delete to authenticated
  using (core.has_permission(tenant_id, 'gantt.dependency.manage'));

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function gantt.guard_dependency_insert()
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

create trigger gantt_dependencies_stamp
  before insert on gantt.dependencies
  for each row execute function gantt.guard_dependency_insert();

-- ⛔ Os EXTREMOS da aresta congelam: mudar predecessor ou sucessor é OUTRA
-- aresta (a identidade da dependência são os dois marcos que liga). Corrigir é
-- remover e registrar de novo. O tipo e os nomes, esses, se editam livremente.
create or replace function gantt.guard_edge_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.predecessor_id is distinct from old.predecessor_id
     or new.successor_id is distinct from old.successor_id then
    raise exception 'os extremos da dependência não mudam: outra aresta é outra dependência (remova e registre de novo)'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger gantt_dependencies_edge_frozen
  before update on gantt.dependencies
  for each row execute function gantt.guard_edge_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function gantt.dependency_payload(p_dep gantt.dependencies)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'predecessorId',   p_dep.predecessor_id,
    'predecessorName', p_dep.predecessor_name,
    'successorId',     p_dep.successor_id,
    'successorName',   p_dep.successor_name,
    'dependencyType',  p_dep.dependency_type,
    'projectId',       p_dep.project_id,
    'projectName',     p_dep.project_name
  );
$$;

comment on function gantt.dependency_payload(gantt.dependencies) is
  'Envelope AUTOSSUFICIENTE da aresta. Recebe a linha (new no insert, old no delete) — quem escuta não faz join.';

create or replace function gantt.on_dependency_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform gantt.emit_event(
    new.tenant_id, 'gantt.dependency.registered',
    gantt.dependency_payload(new));
  return new;
end;
$$;

create trigger gantt_dependencies_emit_registered
  after insert on gantt.dependencies
  for each row execute function gantt.on_dependency_registered();

-- ⭐⭐ AFTER DELETE: a remoção da aresta é um FATO próprio. O payload sai do OLD
-- (a linha já foi embora) — autossuficiente, sem join a uma linha que não existe
-- mais.
create or replace function gantt.on_dependency_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform gantt.emit_event(
    old.tenant_id, 'gantt.dependency.removed',
    gantt.dependency_payload(old));
  return old;
end;
$$;

create trigger gantt_dependencies_emit_removed
  after delete on gantt.dependencies
  for each row execute function gantt.on_dependency_removed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema gantt                  from public, anon, authenticated;
revoke all on all tables    in schema gantt from public, anon, authenticated;
revoke all on all functions in schema gantt from public, anon, authenticated;

grant usage on schema gantt to authenticated;

-- ⭐⭐ DELETE concedido — o DIVERGE dos livros imutáveis (ver §2). A aresta some
-- quando o plano muda.
grant select, insert, update, delete on gantt.dependencies to authenticated;

grant execute on function gantt.can_access(uuid) to authenticated;

-- `gantt.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `gantt.dependency_payload` NÃO é concedida: é encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de tipo (o CHECK é a física da precedência).
-- Nenhum nome de cliente. Nenhum objeto fora de `gantt`. Nenhuma leitura de
-- schema alheio (os marcos do sched por id solto). `consumes` VAZIO.
-- =============================================================================
