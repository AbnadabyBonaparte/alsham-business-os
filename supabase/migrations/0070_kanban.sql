-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0070_kanban.sql
-- Módulo 55: Kanban / Quadro de Tarefas do Projeto. Schema `kanban`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md. Onda Doze
-- (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa). Nasce sob
-- `domain_key='pmo'`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Kanban* (§5, linha 90).
-- Spec: docs/canon/MODULO-KANBAN-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ A FÍSICA É A DO `ops` — MAS ISTO NÃO É "INSTALAR O `ops` DE NOVO"
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). Este
-- módulo reaproveita quase inteira a física da Esteira de Produção (`0018_ops`):
-- etapas DESENHADAS PELO TENANT (texto livre, ordenadas por `position`) e itens
-- que andam de uma etapa para outra por UPDATE simples. A Lei das Etapas do
-- `ops` vale aqui igual: **não existe `create type kanban.stage as enum`** —
-- "A Fazer / Fazendo / Feito" é a coluna de UM time; quem trabalha por sprint
-- desenha outra; quem revisa em duas mãos desenha três.
--
-- O que torna isto um MÓDULO NOVO, e não o `ops` reinstalado, é o **ESCOPO** —
-- exatamente a lição que o `disp`/`recv` já tinham ensinado (mesma física de ato
-- imutável, territórios diferentes):
--
--   • O `ops` é GENÉRICO. A ordem de serviço dele não pertence a nada — é o
--     trabalho de QUALQUER natureza (uma construtora, uma oficina, um
--     escritório), solto, sem dono a montante. A esteira é GLOBAL ao tenant.
--
--   • O `kanban` é ESPECÍFICO. O quadro é o das tarefas de UM PROJETO: tanto a
--     etapa quanto o cartão carregam `project_id` (o do cartão é OBRIGATÓRIO).
--     Sem o projeto, este módulo não tem sobre o que existir. A física é a
--     mesma; o território é o PMO.
--
-- A prova de que os dois NÃO são a mesma coisa está na coluna que o `ops` não
-- tem e não deve ter: um `project_id` no cartão. Instalar o `ops` e chamar de
-- Kanban deixaria o quadro sem projeto — e um "quadro do projeto" sem projeto é
-- outra coisa. O contraste `kanban × ops` é assinado no `lifecycle.test.ts`.
--
-- -----------------------------------------------------------------------------
-- 🔴 O VÍNCULO COM O PROJETO É ID SOLTO — NUNCA FK CRUZADA
-- -----------------------------------------------------------------------------
-- O quadro pertence a um projeto do módulo Projetos (`0068`), mas este arquivo
-- NÃO conhece aquele schema. O vínculo é um `project_id uuid` solto mais o nome
-- carimbado pela tela — jamais uma chave estrangeira para o outro schema (a
-- guarda SCHEMA_DE do CI reprovaria a leitura de schema alheio, e a Lei do Lego
-- proíbe módulo conhecer módulo). Módulo não conhece módulo: o acoplamento é por
-- id solto, como o `disp`→`dc` e o `sop`→plano.
--
-- ⛔ NÃO há `create type` de etapa; ⛔ NÃO há status/ciclo de vida do cartão —
-- o cartão VIVE numa etapa e ANDA; "concluído" é uma ETAPA que o tenant desenha
-- (a lição do `ops`), nunca um enum do produto.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA `name` da etapa e `title`/`description` do cartão em TEXTO LIVRE.
--   ❌ NÃO ENTRA WIP-limit por etapa, `color`, `swimlane`, `assignee`, `due`,
--      `label` — cada um é o processo/organograma de uma casa. Se um dia
--      entrarem, entram como configuração do tenant, não como schema de todos.
-- =============================================================================

create schema if not exists kanban;

comment on schema kanban is
  'Módulo Kanban / Quadro de Tarefas do Projeto. Domain pmo (PMO & Projetos) da Taxonomia. Reaproveita a física do ops (etapas do tenant + itens que andam), mas ESCOPADA a um projeto (project_id). Vínculo com o projeto por id SOLTO — não lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. A ÚNICA PORTA PARA FORA
-- =============================================================================

create or replace function kanban.emit_event(
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
  if p_event_type not like 'kanban.%' then
    raise exception 'kanban.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'kanban',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function kanban.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core, na mesma transação do dado.';

create or replace function kanban.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'kanban.board.manage');
$$;

create or replace function kanban.touch_updated_at()
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
-- 2. STAGES — as colunas do quadro, DESENHADAS PELO TENANT (a física do `ops`)
-- -----------------------------------------------------------------------------
-- ⭐ A LEI DAS ETAPAS: a etapa é DADO DO TENANT, jamais enum do produto. É a
-- mesma decisão do `ops.pipeline_stages`, re-perguntada para o quadro de um
-- projeto — e a DIVERGÊNCIA está no `project_id`: a esteira do `ops` é global ao
-- tenant; a coluna do Kanban pertence a UM projeto.
-- =============================================================================

create table kanban.stages (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao projeto (do módulo Projetos). SEM chave estrangeira cruzada.
  project_id   uuid        not null,
  -- O nome do projeto, carimbado pela tela no momento da criação.
  project_name text        not null default '',
  -- Nome da coluna: TEXTO LIVRE ("A Fazer", "Backlog", "Em revisão"...).
  name         text        not null check (length(btrim(name)) > 0),
  -- A ordem da coluna no quadro. Ver o comentário do índice sobre `deferrable`.
  position     integer     not null check (position >= 0),
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint kanban_stages_id_tenant unique (id, tenant_id),
  -- ⭐ `deferrable initially deferred`: reordenar o quadro é trocar duas
  -- posições, e a troca passa por um instante em que as duas são iguais.
  -- Conferida no fim da transação, a troca é natural (a lição do `ops`).
  constraint kanban_stages_position_unique unique (tenant_id, project_id, position)
    deferrable initially deferred
);

create index kanban_stages_board_idx
  on kanban.stages (tenant_id, project_id, position);

create trigger kanban_stages_touch
  before update on kanban.stages
  for each row execute function kanban.touch_updated_at();

alter table kanban.stages enable row level security;
alter table kanban.stages force row level security;

create policy kanban_stages_select on kanban.stages
  for select to authenticated
  using (kanban.can_access(tenant_id));

create policy kanban_stages_insert on kanban.stages
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'kanban.board.manage'));

create policy kanban_stages_update on kanban.stages
  for update to authenticated
  using (core.has_permission(tenant_id, 'kanban.board.manage'))
  with check (core.has_permission(tenant_id, 'kanban.board.manage'));

-- ⚠️ A ÚNICA tabela do módulo com porta de DELETE, como no `ops`: desenhar um
-- quadro é tentativa e erro, e uma coluna criada por engano tem de sair. Mas a
-- coluna com cartão parado NÃO se apaga — o FK `on delete restrict` dos cartões
-- (§3) barra, com recusa clara, em vez de arrastar tarefa junto.
create policy kanban_stages_delete on kanban.stages
  for delete to authenticated
  using (core.has_permission(tenant_id, 'kanban.board.manage'));

-- -----------------------------------------------------------------------------
-- 2.1 O nascimento da coluna: o autor carimbado pelo servidor
-- -----------------------------------------------------------------------------

create or replace function kanban.guard_stage_insert()
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

create trigger kanban_stages_stamp
  before insert on kanban.stages
  for each row execute function kanban.guard_stage_insert();

-- =============================================================================
-- 3. CARDS — os cartões (tarefas) que andam entre as colunas
-- -----------------------------------------------------------------------------
-- ⭐ O cartão VIVE numa etapa e ANDA por UPDATE simples do `stage_id` — sem
-- aprovação, sem porteiro, sem enum de status (a MESMA liberdade do `ops`).
-- "Concluído" é a última COLUNA, desenhada pelo tenant, não um estado do
-- produto.
--
-- ⭐ O `project_id` do cartão é OBRIGATÓRIO — é o que faz este módulo ser "o
-- quadro DE UM PROJETO" e não o `ops` genérico. É a assinatura do escopo.
-- =============================================================================

create table kanban.cards (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao projeto, OBRIGATÓRIO. Sem projeto, o cartão não existe.
  project_id   uuid        not null,
  project_name text        not null default '',
  -- A coluna onde o cartão está AGORA. FK composta ao MESMO schema (permitido).
  stage_id     uuid        not null,
  title        text        not null check (length(btrim(title)) > 0),
  description  text        not null default '',
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint kanban_cards_id_tenant unique (id, tenant_id),
  -- A coluna atual é uma coluna DO MESMO TENANT. `restrict`: a coluna com
  -- cartão em cima não se apaga (o contrapeso da porta de DELETE de §2).
  constraint kanban_cards_stage_fk
    foreign key (stage_id, tenant_id)
    references kanban.stages (id, tenant_id)
    on delete restrict
);

create index kanban_cards_board_idx
  on kanban.cards (tenant_id, project_id, stage_id);

create trigger kanban_cards_touch
  before update on kanban.cards
  for each row execute function kanban.touch_updated_at();

alter table kanban.cards enable row level security;
alter table kanban.cards force row level security;

create policy kanban_cards_select on kanban.cards
  for select to authenticated
  using (kanban.can_access(tenant_id));

create policy kanban_cards_insert on kanban.cards
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'kanban.board.manage'));

-- Editar título/descrição E mover (trocar o `stage_id`) exigem a mesma
-- permissão: mover é parte do `manage`, exatamente como no `ops` a OS anda com
-- quem tem `manage`. Não há gate especial de movimento.
create policy kanban_cards_update on kanban.cards
  for update to authenticated
  using (core.has_permission(tenant_id, 'kanban.board.manage'))
  with check (core.has_permission(tenant_id, 'kanban.board.manage'));

-- ⛔ Sem policy / grant de DELETE no cartão — como a OS do `ops`, o cartão é o
-- registro da tarefa: ele anda entre colunas, não some. Corrigir é mover ou
-- reescrever, nunca apagar.

create or replace function kanban.guard_card_insert()
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

create trigger kanban_cards_stamp
  before insert on kanban.cards
  for each row execute function kanban.guard_card_insert();

-- =============================================================================
-- 4. OS FATOS QUE ESTE MÓDULO CONTA
-- -----------------------------------------------------------------------------
-- ⭐ O PAYLOAD É AUTOSSUFICIENTE: quem escuta não faz join. Por isso o envelope
-- carrega o NOME da coluna e o NOME do projeto, nunca só o id.
-- =============================================================================

create or replace function kanban.stage_payload(p kanban.stages)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'stageId',     p.id,
    'name',        p.name,
    'position',    p.position,
    'projectId',   p.project_id,
    'projectName', p.project_name
  );
$$;

create or replace function kanban.card_payload(p kanban.cards)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cardId',      p.id,
    'title',       p.title,
    'projectId',   p.project_id,
    'projectName', p.project_name,
    'stageId',     p.stage_id,
    'stageName',   (select s.name from kanban.stages s where s.id = p.stage_id)
  );
$$;

comment on function kanban.card_payload(kanban.cards) is
  'Envelope AUTOSSUFICIENTE do cartão. Leva o NOME da coluna e do projeto, não só o id: quem escuta não resolve id deste schema.';

-- -----------------------------------------------------------------------------
-- 4.1 `kanban.stage.registered` — uma coluna nasceu
-- -----------------------------------------------------------------------------

create or replace function kanban.on_stage_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform kanban.emit_event(new.tenant_id, 'kanban.stage.registered', kanban.stage_payload(new));
  return new;
end;
$$;

create trigger kanban_stages_emit_registered
  after insert on kanban.stages
  for each row execute function kanban.on_stage_registered();

-- -----------------------------------------------------------------------------
-- 4.2 `kanban.card.registered` — um cartão nasceu
-- -----------------------------------------------------------------------------

create or replace function kanban.on_card_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform kanban.emit_event(new.tenant_id, 'kanban.card.registered', kanban.card_payload(new));
  return new;
end;
$$;

create trigger kanban_cards_emit_registered
  after insert on kanban.cards
  for each row execute function kanban.on_card_registered();

-- -----------------------------------------------------------------------------
-- 4.3 `kanban.card.moved` — o cartão andou de coluna
-- -----------------------------------------------------------------------------
-- ⭐ O único "fato de movimento": mudou o `stage_id`. Nada de porteiro — o
-- movimento é livre (a liberdade do `ops`). O envelope carrega a coluna de onde
-- e a coluna para onde, com os NOMES, para o ouvinte não precisar do schema.

create or replace function kanban.on_card_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_name text;
begin
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  select name into v_from_name from kanban.stages where id = old.stage_id;

  perform kanban.emit_event(
    new.tenant_id,
    'kanban.card.moved',
    kanban.card_payload(new) || jsonb_build_object(
      'fromStageId',   old.stage_id,
      'fromStageName', v_from_name
    )
  );
  return new;
end;
$$;

create trigger kanban_cards_emit_moved
  after update of stage_id on kanban.cards
  for each row execute function kanban.on_card_moved();

-- =============================================================================
-- 5. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- RLS decide linha a linha; GRANT decide se a porta existe. As duas coisas.
-- =============================================================================

revoke all on schema kanban                  from public, anon, authenticated;
revoke all on all tables    in schema kanban from public, anon, authenticated;
revoke all on all functions in schema kanban from public, anon, authenticated;

grant usage on schema kanban to authenticated;

-- A coluna tem DELETE (desenhar o quadro é tentativa e erro; o FK dos cartões
-- barra apagar coluna ocupada). Ver §2.
grant select, insert, update, delete on kanban.stages to authenticated;

-- ⛔ O cartão NÃO tem DELETE: ele anda entre colunas, não some (a física da OS
-- do `ops`).
grant select, insert, update on kanban.cards to authenticated;

grant execute on function kanban.can_access(uuid) to authenticated;

-- `kanban.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `kanban.stage_payload` / `kanban.card_payload` NÃO são concedidas: encanamento.
-- `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhum INSERT. Nenhum enum de etapa. Nenhum status de cartão. Nenhum nome
-- de cliente. Nenhum objeto fora de `kanban`. Nenhuma leitura de schema alheio —
-- o vínculo com o projeto é id SOLTO. `consumes` VAZIO.
-- =============================================================================
