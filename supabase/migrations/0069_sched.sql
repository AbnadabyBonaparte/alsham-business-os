-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0069_sched.sql
-- Módulo 54: Cronogramas. Schema `sched`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §25, o
-- SEGUNDO módulo da Onda Doze (Fase 2 — o Domain PMO & Projetos, o MAIOR do
-- mapa: 10 capacidades). Nasce sob `domain_key='pmo'`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Cronogramas* (§5, linha 90:
-- "Projetos · Cronogramas · Kanban · Scrum · Gantt · Recursos · Custos · Riscos
-- · Timesheet · Portfólio").
-- Spec: docs/canon/MODULO-SCHED-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O DIVERGE ASSINADO: O MARCO CONCLUÍDO POR ENGANO REABRE
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- cronograma é uma lista de MARCOS de um projeto (id solto ao `proj`). O marco
-- nasce `planned`, é `done` (concluído) ou `cancelled` (abandonado).
--
-- ⭐ **O REABRIR (`done → planned`):** um marco marcado como concluído POR ENGANO
-- não deve virar um marco novo — desfazer o carimbo é correção de rota ROTINEIRA
-- num projeto. É a mesma física do `ops` (a OS concluída volta a andar:
-- `done → in_progress`), re-perguntada para o marco.
--
-- ⭐ **O DIVERGE do `dem`/`bud`:** naqueles, o fim é TERMINAL — o plano do `dem`
-- publicado e o período do `bud` fechado NÃO reabrem, porque um período contábil
-- fechado é um FATO. Um marco é diferente: reabrir um marco concluído por engano
-- é correção de rota rotineira num projeto, não a reabertura de um período
-- fechado. O contraste é assinado no `lifecycle.test.ts` (que lê ESTE arquivo e
-- o `0063_dem.sql`): o `sched` TEM `done→planned`; o `dem` NÃO tem transição
-- alguma a partir de `published`.
--
-- ⚠️ **A INTERAÇÃO COERÊNCIA × REABRIR:** a constraint amarra `done ⇔ done_at is
-- not null`. Concluir (`→done`) carimba `done_at` pelo servidor; reabrir
-- (`done→planned`) TEM de LIMPAR `done_at`/`done_by`, senão a coerência falha. O
-- gatilho de transição zera os carimbos ao reabrir.
--
-- -----------------------------------------------------------------------------
-- 🔴 O PROJETO ENTRA POR ID SOLTO — sem FK, sem ler o schema alheio
-- -----------------------------------------------------------------------------
-- O marco aponta o projeto do `proj` por id solto (`project_id` + `project_name`
-- carimbado pela tela). NÃO há FK cruzada e este arquivo NÃO referencia o schema
-- `proj` (módulo não conhece módulo — a Lei do Lego). O nome carimbado é o que
-- faz o cronograma sobreviver mesmo que o cadastro de projeto mude.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA título em TEXTO LIVRE e data prevista OPCIONAL — o que é um "marco"
--      (uma entrega, uma etapa, um gate) é vocabulário de cada casa, e nem todo
--      marco tem data cravada.
--   ❌ NÃO ENTRA dependência entre marcos (Gantt/precedência é capacidade
--      própria da onda), percentual de avanço automático, nem caminho crítico.
--   ❌ NÃO ENTRA vínculo FK ao projeto — o cronograma não conhece o schema do
--      `proj` (id solto).
-- =============================================================================

create schema if not exists sched;

comment on schema sched is
  'Módulo Cronogramas. Domain pmo (PMO & Projetos) da Taxonomia. Marcos de um projeto (id solto ao proj). O marco nasce planned, e é done ou cancelled. ⭐ O DIVERGE do dem/bud: done → planned REABRE (a física do ops — um marco concluído por engano é correção de rota, não um período contábil fechado). cancelled é TERMINAL. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA
-- =============================================================================

create or replace function sched.emit_event(
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
  if p_event_type not like 'sched.%' then
    raise exception 'sched.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'sched',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function sched.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function sched.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'sched.milestone.manage');
$$;

create or replace function sched.touch_updated_at()
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
-- 2. MILESTONES — os marcos do cronograma
-- =============================================================================

create table sched.milestones (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references core.tenants (id) on delete cascade,
  -- 🔴 O projeto entra por ID SOLTO — sem FK, sem ler o schema alheio do módulo
  -- de projetos.
  -- O nome é carimbado pela tela e é o que faz o marco sobreviver ao redesenho
  -- do cadastro de projeto.
  project_id    uuid        not null,
  project_name  text        not null default '',
  -- Título em TEXTO LIVRE (o que é um "marco" é vocabulário de cada casa).
  title         text        not null check (length(btrim(title)) > 0),
  -- Data prevista OPCIONAL — nem todo marco tem data cravada.
  due_on        date,
  status        text        not null default 'planned'
                check (status in ('planned', 'done', 'cancelled')),
  -- Razão do cancelamento: OBRIGATÓRIA ao cancelar (abandonar precisa de porquê).
  cancel_reason text        not null default '',
  -- ⭐ Carimbos da conclusão — do SERVIDOR; nulos fora de `done` (o reabrir zera).
  done_at       timestamptz,
  done_by       uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint sched_milestones_id_tenant unique (id, tenant_id),
  -- ⭐ O estado e o carimbo de conclusão contam a MESMA história, ou um mente:
  -- done ⇔ done_at tem valor. Fora de done (inclui o REABERTO e o cancelado),
  -- não há carimbo — por isso o reabrir PRECISA limpar done_at/done_by.
  constraint sched_milestones_done_coherent check (
    (status = 'done' and done_at is not null)
    or
    (status <> 'done' and done_at is null)
  )
);

create index sched_milestones_open_idx
  on sched.milestones (tenant_id, coalesce(due_on, 'infinity'::date), created_at)
  where status = 'planned';

create index sched_milestones_project_idx
  on sched.milestones (tenant_id, project_id);

create trigger sched_milestones_touch
  before update on sched.milestones
  for each row execute function sched.touch_updated_at();

alter table sched.milestones enable row level security;
alter table sched.milestones force row level security;

create policy sched_milestones_select on sched.milestones
  for select to authenticated
  using (sched.can_access(tenant_id));

create policy sched_milestones_insert on sched.milestones
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'sched.milestone.manage'));

create policy sched_milestones_update on sched.milestones
  for update to authenticated
  using (sched.can_access(tenant_id))
  with check (sched.can_access(tenant_id));

-- ⛔ Sem policy / grant de DELETE. Marco percorrido é história do cronograma.

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento: sempre PLANNED, o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function sched.guard_milestone_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'planned' then
    raise exception 'o marco nasce planejado — concluir e cancelar são decisões à parte'
      using errcode = '22023';
  end if;

  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger sched_milestones_stamp
  before insert on sched.milestones
  for each row execute function sched.guard_milestone_insert();

-- -----------------------------------------------------------------------------
-- 2.2 Transições — espelho de ALLOWED_TRANSITIONS em @alsham/sched
-- -----------------------------------------------------------------------------
-- ⭐ planned→done (concluir), planned→cancelled (abandonar), done→planned (⭐ O
-- REABRIR — o marco concluído por engano volta), done→cancelled (abandonar o
-- concluído). cancelled é TERMINAL. O DIVERGE do dem/bud: aqui done REABRE.

create or replace function sched.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('planned', 'done'),
    ('planned', 'cancelled'),
    -- ⭐ A DIVERGÊNCIA. Ver o cabeçalho: um marco concluído por engano é
    -- correção de rota rotineira — não um período contábil fechado (o dem/bud).
    ('done',    'planned'),
    ('done',    'cancelled')
  );
$$;

comment on function sched.allowed_transition(text, text) is
  'Ciclo de vida do marco. Espelho de ALLOWED_TRANSITIONS em @alsham/sched — há teste que lê este arquivo e compara. ⭐ done → planned REABRE de propósito (a física do ops; o DIVERGE do dem/bud, cujo fim é terminal). cancelled é terminal.';

create or replace function sched.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not sched.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida do marco: o cancelado é terminal',
      old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'sched.milestone.manage') then
    raise exception 'mover o marco exige a permissão sched.milestone.manage'
      using errcode = '42501';
  end if;

  -- Concluir: carimba quem/quando pelo SERVIDOR.
  if new.status = 'done' then
    new.done_at := now();
    new.done_by := (select auth.uid());
  end if;

  -- ⭐ REABRIR (done→planned): LIMPA os carimbos — senão a coerência done ⇔
  -- done_at falha. O marco volta a ser um marco planejado sem passado de
  -- conclusão.
  if new.status = 'planned' then
    new.done_at := null;
    new.done_by := null;
  end if;

  -- Cancelar: EXIGE razão — abandonar precisa de porquê — e (se vinha de done)
  -- limpa o carimbo, pois cancelled não é done.
  if new.status = 'cancelled' then
    if length(btrim(new.cancel_reason)) = 0 then
      raise exception 'cancelar o marco exige uma razão'
        using errcode = '22023';
    end if;
    new.done_at := null;
    new.done_by := null;
  end if;

  return new;
end;
$$;

create trigger sched_milestones_guard_status
  before update of status on sched.milestones
  for each row execute function sched.guard_status_transition();

-- ⛔ O vínculo com o projeto CONGELA na criação: mudar de projeto seria outro
-- marco. Editar título/data é livre enquanto o marco existe (o cronograma se
-- ajusta); o projeto é a identidade.
create or replace function sched.guard_project_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'o marco pertence ao projeto em que nasceu: mudar de projeto é outro marco'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger sched_milestones_project_frozen
  before update on sched.milestones
  for each row execute function sched.guard_project_frozen();

-- =============================================================================
-- 3. PAYLOAD + EVENTOS
-- =============================================================================

create or replace function sched.milestone_payload(p_milestone_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_milestone sched.milestones;
begin
  select * into v_milestone
    from sched.milestones
   where id = p_milestone_id and tenant_id = p_tenant_id;

  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'projectId',    v_milestone.project_id,
    'projectName',  v_milestone.project_name,
    'title',        v_milestone.title,
    'status',       v_milestone.status,
    'dueOn',        v_milestone.due_on,
    'doneAt',       v_milestone.done_at,
    'cancelReason', v_milestone.cancel_reason
  );
end;
$$;

comment on function sched.milestone_payload(uuid, uuid) is
  'Envelope AUTOSSUFICIENTE do marco. Quem escuta não faz join.';

create or replace function sched.on_milestone_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform sched.emit_event(
    new.tenant_id,
    'sched.milestone.registered',
    sched.milestone_payload(new.id, new.tenant_id)
  );
  return new;
end;
$$;

create trigger sched_milestones_emit_registered
  after insert on sched.milestones
  for each row execute function sched.on_milestone_registered();

create or replace function sched.on_milestone_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is distinct from old.status then
    -- ⚠️ O STATUS é `done`, mas o VERBO do evento é `completed` — o outbox exige
    -- passado terminando em `ed`, e "done" não termina em `ed`.
    v_type := case new.status
                when 'done'      then 'sched.milestone.completed'
                when 'planned'   then 'sched.milestone.reopened'
                when 'cancelled' then 'sched.milestone.cancelled'
                else null
              end;
    if v_type is not null then
      perform sched.emit_event(new.tenant_id, v_type, sched.milestone_payload(new.id, new.tenant_id));
    end if;
  end if;

  return new;
end;
$$;

create trigger sched_milestones_emit_changed
  after update of status on sched.milestones
  for each row execute function sched.on_milestone_changed();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema sched                  from public, anon, authenticated;
revoke all on all tables    in schema sched from public, anon, authenticated;
revoke all on all functions in schema sched from public, anon, authenticated;

grant usage on schema sched to authenticated;

grant select, insert, update on sched.milestones to authenticated;

grant execute on function sched.can_access(uuid) to authenticated;

-- `sched.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `sched.milestone_payload` NÃO é concedida: é encanamento dos gatilhos.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de tipo de marco. Nenhum nome de cliente.
-- Nenhum objeto fora de `sched`. Nenhuma leitura de schema alheio (o projeto do
-- proj por id solto). `consumes` VAZIO.
-- =============================================================================
