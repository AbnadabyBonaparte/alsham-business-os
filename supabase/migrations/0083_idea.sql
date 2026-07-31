-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0083_idea.sql
-- Módulo 68: Ideias & Pipeline de Inovação. Schema `idea`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §29, o
-- primeiro módulo da Onda Dezesseis (Fase 2 — ABRE o Domain 🔬 Pesquisa &
-- Desenvolvimento). Nasce sob `domain_key='rnd'`.
--
-- Taxonomia: Domain 🔬 Pesquisa & Desenvolvimento (§5) — capacidades *Ideias* e
-- *Pipeline de inovação*.
-- Spec: docs/canon/MODULO-IDEA-SPEC.md
--
-- ⚠️ O `domain_key` é `rnd` (a chave canônica da store-taxonomy para Pesquisa &
-- Desenvolvimento), não `rd`. Sol Único: uma chave só, a que o catálogo já
-- publica.
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A DECISÃO DE CANON — DUAS CAPACIDADES, UM MÓDULO
-- -----------------------------------------------------------------------------
-- *Ideias* e *Pipeline de inovação* são a MESMA coisa: uma ideia QUE ANDA por um
-- pipeline. Uma ideia sem um funil por onde progredir é um post-it; um pipeline
-- sem ideias é uma planilha vazia. Construir dois schemas seria partir em duas
-- metades o que só existe junto. Um módulo: as etapas do funil (`idea.stages`) e
-- as ideias que caminham por elas (`idea.ideas`).
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O DIVERGE ASSINADO — idea × kanban: A IDEIA EXISTE ANTES DO PROJETO
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). A
-- física deste módulo é a do `kanban` (Módulo 55): etapas DESENHADAS PELO TENANT
-- (texto livre, ordenadas por `position`) e itens que andam de etapa em etapa
-- por UPDATE simples, sem porteiro (a Lei das Etapas — não existe
-- `create type idea.stage as enum`). Mas isto NÃO é "instalar o `kanban` de
-- novo", e o contraste é o OPOSTO do que separou o `kanban` do `ops`:
--
--   • O `kanban` EXIGE `project_id` — a etapa E o cartão pertencem a um projeto
--     que JÁ EXISTE. Sem projeto, o quadro não tem sobre o que existir.
--
--   • O `idea` PROÍBE `project_id` — a ideia nasce ANTES de qualquer projeto.
--     Ela é a matéria-prima da inovação: uma faísca que ainda não é obra. Amarrá-
--     la a um projeto obrigatório mataria justamente o que ela é. As etapas e as
--     ideias são GLOBAIS ao tenant — não há, e não pode haver, `project_id`
--     obrigatório em lugar nenhum deste arquivo. O contraste idea×kanban é
--     assinado no `lifecycle.test.ts`.
--
-- ⭐ Quando a ideia AMADURECE e vira obra, ela é PROMOVIDA: o `status` vai a
-- `promoted` e um `promoted_project_id` (ID SOLTO, opcional até a promoção) é
-- carimbado — o elo com o `proj` que a ideia gerou. É o único vínculo com
-- projeto, e ele é o DESTINO da ideia, nunca o seu pré-requisito.
--
-- -----------------------------------------------------------------------------
-- ⭐ O CICLO DE VIDA (documentado, porque o kanban NÃO tem status e este tem)
-- -----------------------------------------------------------------------------
--   `active`   → a ideia viva, caminhando pelas etapas do funil.
--   `promoted` → virou projeto (TERMINAL): a ideia graduou, e o trabalho segue
--                no `proj`. Uma nova exploração é uma ideia NOVA.
--   `archived` → descartada — e REVERSÍVEL (`archived → active`): a ideia
--                engavetada que volta a fazer sentido é a MESMA ideia (a física
--                do `mall`/`crm`, não a do `proj` que é terminal). Descartar não
--                exige razão (uma gaveta não é um cancelamento formal).
-- Mover de etapa só vale enquanto `active`: uma ideia promovida ou arquivada não
-- anda mais pelo funil.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA `name` da etapa e `title`/`description` da ideia em TEXTO LIVRE.
--   ❌ NÃO ENTRA score/votação, autor/assignee, ROI estimado, gate de aprovação
--      por etapa — cada um é o processo de inovação de UMA casa (config do
--      tenant, não schema de todos). `consumes` VAZIO.
--
-- 🔴 O vínculo com o projeto (na promoção) é ID SOLTO — SEM FK cruzada, SEM ler
-- o schema `proj`. A Lei do Lego. Não há referência a schema alheio neste arquivo.
-- =============================================================================

create schema if not exists idea;

comment on schema idea is
  'Módulo Ideias & Pipeline de Inovação. Domain rnd (Pesquisa & Desenvolvimento) da Taxonomia. Duas capacidades, um módulo: as etapas do funil (idea.stages, desenho do tenant) e as ideias que andam por elas (idea.ideas). O DIVERGE do kanban: a ideia NÃO tem project_id obrigatório — nasce antes de qualquer projeto; o único elo é o promoted_project_id (id solto) do DESTINO, na promoção. Ciclo: active → promoted (terminal) / archived (reversível). Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- =============================================================================

create or replace function idea.emit_event(
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
  if p_event_type not like 'idea.%' then
    raise exception 'idea.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'idea',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function idea.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado.';

create or replace function idea.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'idea.idea.manage');
$$;

create or replace function idea.touch_updated_at()
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
-- 2. STAGES — as etapas do funil, DESENHADAS PELO TENANT (a física do kanban)
-- -----------------------------------------------------------------------------
-- ⭐ A LEI DAS ETAPAS: a etapa é DADO DO TENANT, jamais enum do produto. ⭐⭐ E
-- SEM `project_id`: o funil de inovação é GLOBAL ao tenant — o oposto do kanban,
-- cuja coluna pertence a um projeto.
-- =============================================================================

create table idea.stages (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  -- Nome da etapa: TEXTO LIVRE ("Captação", "Triagem", "Piloto"...).
  name         text        not null check (length(btrim(name)) > 0),
  -- A ordem da etapa no funil. `deferrable`: reordenar troca duas posições.
  position     integer     not null check (position >= 0),
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint idea_stages_id_tenant unique (id, tenant_id),
  constraint idea_stages_position_unique unique (tenant_id, position)
    deferrable initially deferred
);

create index idea_stages_funnel_idx
  on idea.stages (tenant_id, position);

create trigger idea_stages_touch
  before update on idea.stages
  for each row execute function idea.touch_updated_at();

alter table idea.stages enable row level security;
alter table idea.stages force row level security;

create policy idea_stages_select on idea.stages
  for select to authenticated
  using (idea.can_access(tenant_id));

create policy idea_stages_insert on idea.stages
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'idea.idea.manage'));

create policy idea_stages_update on idea.stages
  for update to authenticated
  using (core.has_permission(tenant_id, 'idea.idea.manage'))
  with check (core.has_permission(tenant_id, 'idea.idea.manage'));

-- ⚠️ Etapa tem DELETE (desenhar o funil é tentativa e erro), mas a etapa com
-- ideia parada NÃO se apaga — o FK `on delete restrict` das ideias barra.
create policy idea_stages_delete on idea.stages
  for delete to authenticated
  using (core.has_permission(tenant_id, 'idea.idea.manage'));

create or replace function idea.guard_stage_insert()
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

create trigger idea_stages_stamp
  before insert on idea.stages
  for each row execute function idea.guard_stage_insert();

-- =============================================================================
-- 3. IDEAS — a faísca que caminha pelo funil
-- -----------------------------------------------------------------------------
-- ⭐⭐ SEM `project_id` obrigatório (o DIVERGE do kanban). A ideia existe por si.
-- A etapa atual é FK INTRA-SCHEMA (peça do próprio módulo — permitido). Mover é
-- UPDATE simples do `current_stage_id`, sem aprovação (a liberdade do kanban).
-- =============================================================================

create table idea.ideas (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references core.tenants (id) on delete cascade,
  title               text        not null check (length(btrim(title)) > 0),
  description         text        not null default '',
  -- A etapa onde a ideia está AGORA. FK composta ao MESMO schema (permitido).
  -- `restrict`: a etapa com ideia em cima não se apaga.
  current_stage_id    uuid        not null,
  -- ⭐ O ciclo: active (viva) → promoted (virou projeto, TERMINAL) /
  -- archived (descartada, REVERSÍVEL).
  status              text        not null default 'active'
                        check (status in ('active', 'promoted', 'archived')),
  -- ⭐ O elo com o projeto que a ideia gerou — ID SOLTO, só na promoção. É o
  -- DESTINO da ideia, nunca o pré-requisito. Carimbado + nome pela tela.
  promoted_project_id   uuid,
  promoted_project_name text      not null default '',
  promoted_at         timestamptz,
  promoted_by         uuid        references auth.users (id) on delete set null,
  archived_at         timestamptz,
  archived_by         uuid        references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  created_by          uuid        references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint ideas_id_tenant unique (id, tenant_id),
  constraint ideas_stage_fk
    foreign key (current_stage_id, tenant_id)
    references idea.stages (id, tenant_id)
    on delete restrict,
  -- ⭐ Coerência: promovida ⇔ tem projeto de destino. Fora da promoção, não há.
  constraint ideas_promoted_coherent check (
    (status = 'promoted') = (promoted_project_id is not null)
  )
);

create index ideas_pipeline_idx
  on idea.ideas (tenant_id, current_stage_id)
  where status = 'active';

create trigger ideas_touch
  before update on idea.ideas
  for each row execute function idea.touch_updated_at();

alter table idea.ideas enable row level security;
alter table idea.ideas force row level security;

create policy ideas_select on idea.ideas
  for select to authenticated
  using (idea.can_access(tenant_id));

create policy ideas_insert on idea.ideas
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'idea.idea.manage'));

create policy ideas_update on idea.ideas
  for update to authenticated
  using (core.has_permission(tenant_id, 'idea.idea.manage'))
  with check (core.has_permission(tenant_id, 'idea.idea.manage'));

-- ⛔ Sem DELETE na ideia: ela anda, promove ou arquiva — não some.

-- -----------------------------------------------------------------------------
-- 3.1 Nascimento: sempre `active`, sem projeto, autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function idea.guard_idea_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    raise exception 'a ideia nasce ativa — promover e arquivar são decisões à parte'
      using errcode = '22023';
  end if;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger ideas_stamp
  before insert on idea.ideas
  for each row execute function idea.guard_idea_insert();

-- -----------------------------------------------------------------------------
-- 3.2 O ciclo de vida — espelho de ALLOWED_TRANSITIONS em @alsham/idea
-- -----------------------------------------------------------------------------

create or replace function idea.allowed_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('active',   'promoted'),
    ('active',   'archived'),
    ('archived', 'active')
  );
$$;

comment on function idea.allowed_transition(text, text) is
  'Ciclo de vida da ideia. Espelho de ALLOWED_TRANSITIONS em @alsham/idea. promoted é TERMINAL (virou projeto; nova exploração é ideia nova). archived ↔ active é REVERSÍVEL (a ideia engavetada que volta é a mesma — a física do mall/crm, o DIVERGE do proj terminal).';

create or replace function idea.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not idea.allowed_transition(old.status, new.status) then
    raise exception 'transição % → % não existe no ciclo de vida da ideia', old.status, new.status
      using errcode = '22023';
  end if;

  if not core.has_permission(new.tenant_id, 'idea.idea.manage') then
    raise exception 'mover a ideia exige a permissão idea.idea.manage'
      using errcode = '42501';
  end if;

  -- ⭐ Promover: EXIGE o projeto de destino (id solto) e carimba quem/quando.
  if new.status = 'promoted' then
    if new.promoted_project_id is null then
      raise exception 'promover a ideia exige o projeto de destino (promoted_project_id)'
        using errcode = '22023';
    end if;
    new.promoted_at := now();
    new.promoted_by := (select auth.uid());
  end if;

  -- Arquivar: carimba quem/quando.
  if new.status = 'archived' then
    new.archived_at := now();
    new.archived_by := (select auth.uid());
  end if;

  -- ⭐ Voltar do arquivo (restaurar): LIMPA o carimbo de arquivamento — a ideia
  -- está viva de novo (a física do care.reopen).
  if new.status = 'active' then
    new.archived_at := null;
    new.archived_by := null;
  end if;

  return new;
end;
$$;

create trigger ideas_guard_status
  before update of status on idea.ideas
  for each row execute function idea.guard_status_transition();

-- -----------------------------------------------------------------------------
-- 3.3 Mover de etapa só vale enquanto ATIVA — e o projeto de destino congela
-- -----------------------------------------------------------------------------

create or replace function idea.guard_idea_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Mudar de etapa exige a ideia VIVA: promovida/arquivada não anda mais.
  if new.current_stage_id is distinct from old.current_stage_id
     and old.status <> 'active' then
    raise exception 'a ideia % não está ativa: não anda mais pelo funil', old.status
      using errcode = '22023';
  end if;

  -- O elo com o projeto, uma vez carimbado na promoção, não se reescreve.
  if old.status = 'promoted'
     and new.promoted_project_id is distinct from old.promoted_project_id then
    raise exception 'a ideia já foi promovida: o projeto de destino não muda mais'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger ideas_guard_move
  before update on idea.ideas
  for each row execute function idea.guard_idea_move();

-- =============================================================================
-- 4. OS FATOS QUE ESTE MÓDULO CONTA — payload AUTOSSUFICIENTE
-- =============================================================================

create or replace function idea.stage_payload(p idea.stages)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'stageId',  p.id,
    'name',     p.name,
    'position', p.position
  );
$$;

create or replace function idea.idea_payload(p idea.ideas)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ideaId',             p.id,
    'title',              p.title,
    'status',             p.status,
    'stageId',            p.current_stage_id,
    'stageName',          (select s.name from idea.stages s where s.id = p.current_stage_id),
    'promotedProjectId',   p.promoted_project_id,
    'promotedProjectName', p.promoted_project_name
  );
$$;

comment on function idea.idea_payload(idea.ideas) is
  'Envelope AUTOSSUFICIENTE da ideia. Leva o NOME da etapa e do projeto de destino, não só o id: quem escuta não resolve id deste schema.';

create or replace function idea.on_stage_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform idea.emit_event(new.tenant_id, 'idea.stage.registered', idea.stage_payload(new));
  return new;
end;
$$;

create trigger idea_stages_emit_registered
  after insert on idea.stages
  for each row execute function idea.on_stage_registered();

create or replace function idea.on_idea_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform idea.emit_event(new.tenant_id, 'idea.idea.registered', idea.idea_payload(new));
  return new;
end;
$$;

create trigger ideas_emit_registered
  after insert on idea.ideas
  for each row execute function idea.on_idea_registered();

-- ⭐ Mover de etapa: um fato próprio, com a etapa de onde e para onde (nomes).
create or replace function idea.on_idea_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_name text;
begin
  if new.current_stage_id is not distinct from old.current_stage_id then
    return new;
  end if;

  select name into v_from_name from idea.stages where id = old.current_stage_id;

  perform idea.emit_event(
    new.tenant_id,
    'idea.idea.moved',
    idea.idea_payload(new) || jsonb_build_object(
      'fromStageId',   old.current_stage_id,
      'fromStageName', v_from_name
    )
  );
  return new;
end;
$$;

create trigger ideas_emit_moved
  after update of current_stage_id on idea.ideas
  for each row execute function idea.on_idea_moved();

-- ⭐ Mudança de status: promovida / arquivada / restaurada.
create or replace function idea.on_idea_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_type := case
              when new.status = 'promoted' then 'idea.idea.promoted'
              when new.status = 'archived' then 'idea.idea.archived'
              when new.status = 'active'   then 'idea.idea.restored'
              else null
            end;

  if v_type is not null then
    perform idea.emit_event(new.tenant_id, v_type, idea.idea_payload(new));
  end if;
  return new;
end;
$$;

create trigger ideas_emit_status_changed
  after update of status on idea.ideas
  for each row execute function idea.on_idea_status_changed();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- =============================================================================

revoke all on schema idea                  from public, anon, authenticated;
revoke all on all tables    in schema idea from public, anon, authenticated;
revoke all on all functions in schema idea from public, anon, authenticated;

grant usage on schema idea to authenticated;

-- A etapa tem DELETE (desenhar o funil é tentativa e erro; o FK das ideias barra
-- apagar etapa ocupada).
grant select, insert, update, delete on idea.stages to authenticated;

-- ⛔ A ideia NÃO tem DELETE: ela anda, promove ou arquiva — não some.
grant select, insert, update on idea.ideas to authenticated;

grant execute on function idea.can_access(uuid) to authenticated;

-- `idea.emit_event` NÃO é concedida. `idea.stage_payload`/`idea.idea_payload`
-- são encanamento. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum project_id obrigatório (o DIVERGE do kanban). Nenhum enum de
-- etapa (a Lei das Etapas). Nenhum objeto fora de `idea`. Nenhuma leitura de
-- schema alheio (o projeto de destino por id solto). `consumes` VAZIO.
-- =============================================================================
