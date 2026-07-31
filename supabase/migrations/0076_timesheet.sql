-- =============================================================================
-- ALSHAM BUSINESS OS™ — 0076_timesheet.sql
-- Módulo 61: Apontamento de horas (Timesheet). Schema `timesheet`.
-- =============================================================================
--
-- NÃO APLICADO. Aplicar é ato do dono — ver docs/runbook/APLICAR.md §26, na
-- Onda Treze (Fase 2 — o Domain PMO & Projetos, o MAIOR do mapa). Nasce sob
-- `domain_key='pmo'`, ao lado do `proj`, do `alloc` e do `pcost`.
--
-- Taxonomia: Domain 📋 PMO & Projetos — capacidade *Timesheet* (§5, na linha de
-- PMO ao lado de *Recursos*, *Custos* e *Portfólio*).
-- Spec: docs/canon/MODULO-TIMESHEET-SPEC.md
--
-- -----------------------------------------------------------------------------
-- ⭐⭐ O QUE ESTE MÓDULO É — O LIVRO DE HORAS TRABALHADAS, LANÇAMENTO IMUTÁVEL
-- -----------------------------------------------------------------------------
-- Cada apontamento é um FATO CONSUMADO: alguém trabalhou tantas horas num
-- projeto, num dia, e o registro nasce pronto — para sempre. É a mesma física
-- do `pcost` (o livro de custos), do `recv`/`occ`/`sec` (o ato pontual
-- imutável) e do `cash` (o livro do dinheiro): NÃO TEM coluna de status, não tem
-- ciclo de vida, não tem transição. Não existe "apontamento aberto" nem
-- "apontamento em andamento" — o trabalho ACONTECE e vira linha. Corrigir é
-- lançar OUTRO apontamento (o ato inverso, com descrição), nunca reescrever.
--
-- ⭐ Consequência direta: `timesheet.entries` **NÃO TEM `allowed_transition`** e
-- **NÃO TEM `updated_at`** (não há o que tocar num fato que não muda). O cliente
-- não tem NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant); e mesmo
-- assim o gatilho abaixo recusa a reescrita até para o dono do banco — a mesma
-- física do `pcost`/`recv`/`occ`.
--
-- -----------------------------------------------------------------------------
-- ⭐ O CONTRASTE ASSINADO — timesheet (REALIZADO) × alloc (PLANEJADO)
-- -----------------------------------------------------------------------------
-- Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). O
-- vizinho mais próximo é o `alloc` (Módulo 56, Recursos / Alocação), do mesmo
-- Domain. A pergunta foi: são a mesma física?
--
-- **Não.** O `alloc` é o PLANEJADO: o PERCENTUAL de capacidade que se PRETENDE
-- dedicar de um recurso a um projeto — uma previsão, que muda quando o plano
-- muda (`active ↔ archived`, com `updated_at`). O `timesheet` é o REALIZADO: a
-- HORA que efetivamente FOI trabalhada — fato consumado, imutável. Um é a
-- promessa; o outro é o que aconteceu. Por isso o `alloc` mede em percentual e é
-- mutável, e o `timesheet` mede em HORAS e é imutável. O teste do pacote lê as
-- duas migrations e assina o contraste (percentual+mutável × horas+imutável).
--
-- ⭐ HORAS > 0: não se aponta zero (linha muda) nem trabalho negativo (não é
-- trabalho). O CHECK confere `hours > 0` — estritamente. É a régua do MÉTODO:
-- um apontamento narra um esforço que EXISTIU. A correção de um lançamento a
-- mais é OUTRO lançamento (o ato inverso), nunca um número negativo aqui.
--
-- -----------------------------------------------------------------------------
-- ANTI-VIÉS ("outra empresa de outro setor usaria isso exatamente assim?")
-- -----------------------------------------------------------------------------
--   ✅ ENTRA o projeto por ID SOLTO (uuid, obrigatório) + nome carimbado pela
--      TELA; quem trabalhou em TEXTO LIVRE (`collaborator_name`, pode ser
--      terceiro/freelancer) + um id solto OPCIONAL ao colaborador cadastrado
--      (`collaborator_id`); o dia (`worked_on`); as horas (`hours`, > 0); a
--      descrição TEXTO LIVRE opcional.
--   ❌ NÃO ENTRA cálculo de custo/rate da hora (é dinheiro — o `cash`/`pcost`
--      genérico por id solto), aprovação/fechamento de folha de apontamento
--      (workflow de aprovação — capacidade futura), capacidade/calendário do
--      recurso (é o `alloc` do lado do plano; a agenda é outra frente), nem o
--      percentual de alocação (é o `alloc`). `consumes` VAZIO.
--
-- 🔴 O `timesheet` NÃO LÊ o `proj` nem o módulo de Colaboradores: os vínculos
-- são por ID SOLTO, SEM FK cruzada e SEM uma linha que toque schema alheio — a
-- Lei do Lego. Não há referência a schema alheio em lugar nenhum deste arquivo.
-- =============================================================================

create schema if not exists timesheet;

comment on schema timesheet is
  'Módulo Apontamento de horas (Timesheet). Domain pmo (PMO & Projetos) da Taxonomia. O livro de horas trabalhadas: cada apontamento é LANÇAMENTO IMUTÁVEL, sem ciclo de vida, sem status. É o REALIZADO — a contraparte do alloc (o PLANEJADO, percentual mutável). horas > 0. O projeto e o colaborador são referenciados por ID SOLTO (project_id / collaborator_id) — nunca FK. Não cria objeto em core nem lê schema alheio. consumes VAZIO.';

-- =============================================================================
-- 1. PORTA DE SAÍDA — a única porta do módulo para o mundo. É lei.
-- =============================================================================

create or replace function timesheet.emit_event(
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
  if p_event_type not like 'timesheet.%' then
    raise exception 'timesheet.emit_event: tipo % não pertence a este módulo', p_event_type;
  end if;

  insert into core.event_outbox (
    tenant_id, event_type, event_version, produced_by,
    payload, correlation_id, status, next_attempt_at
  )
  values (
    p_tenant_id, p_event_type, 1, 'timesheet',
    coalesce(p_payload, '{}'::jsonb), p_correlation_id, 'pending', now()
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

comment on function timesheet.emit_event(uuid, text, jsonb, uuid) is
  'A única porta de saída do módulo. Escreve na caixa de saída do Core.';

create or replace function timesheet.can_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.has_permission(p_tenant_id, 'timesheet.entry.manage');
$$;

-- =============================================================================
-- 2. ENTRIES — ⭐⭐ O APONTAMENTO: LANÇAMENTO IMUTÁVEL, SEM CICLO, SEM TRAVE
-- -----------------------------------------------------------------------------
-- NENHUMA coluna de status. NENHUMA função allowed_transition. NENHUM
-- updated_at. O registro nasce pronto — e nunca mais muda. O cliente não tem
-- NENHUMA porta de UPDATE nem DELETE (nem policy, nem grant); e mesmo assim o
-- gatilho da §2.2 recusa a reescrita até para o dono do banco — física do occ.
-- =============================================================================

create table timesheet.entries (
  id                uuid          primary key default gen_random_uuid(),
  tenant_id         uuid          not null references core.tenants (id) on delete cascade,
  -- ⭐ ID SOLTO ao projeto de Projetos — SEM FK cruzada (Lei do Lego), obrigatório.
  project_id        uuid          not null,
  -- O nome do projeto carimbado pela TELA — sobrevive ao redesenho do cadastro.
  project_name      text          not null default '',
  -- ⭐ Quem trabalhou, em TEXTO LIVRE — pode ser um terceiro/freelancer sem
  -- cadastro (a lição do recurso do alloc). Obrigatório e não-vazio.
  collaborator_name text          not null check (length(btrim(collaborator_name)) > 0),
  -- ⭐ O colaborador cadastrado POR ID SOLTO, OPCIONAL: nem todo apontamento tem
  -- um colaborador cadastrado (o executor pode ser externo). Sem FK cruzada.
  collaborator_id   uuid,
  -- O dia em que o trabalho aconteceu.
  worked_on         date          not null,
  -- ⭐ As horas trabalhadas. Estritamente > 0: não se aponta zero (linha muda)
  -- nem trabalho negativo (não é trabalho). Corrigir é lançar o ato inverso.
  hours             numeric(6,2)  not null check (hours > 0),
  -- Descrição TEXTO LIVRE e OPCIONAL.
  description       text          not null default '',
  -- ⭐ Os carimbos do FATO — sempre do servidor, nunca do formulário.
  created_at        timestamptz   not null default now(),
  created_by        uuid          references auth.users (id) on delete set null,
  constraint timesheet_entries_id_tenant unique (id, tenant_id)
);

create index timesheet_entries_book_idx
  on timesheet.entries (tenant_id, worked_on desc, created_at desc);
create index timesheet_entries_by_project_idx
  on timesheet.entries (tenant_id, project_id);

alter table timesheet.entries enable row level security;
alter table timesheet.entries force row level security;

create policy timesheet_entries_select on timesheet.entries
  for select to authenticated
  using (timesheet.can_access(tenant_id));

create policy timesheet_entries_insert on timesheet.entries
  for insert to authenticated
  with check (core.has_permission(tenant_id, 'timesheet.entry.manage'));

-- ⛔ SEM policy de UPDATE e SEM policy de DELETE — o apontamento é fato
-- consumado; não existe porta para reescrevê-lo.

-- -----------------------------------------------------------------------------
-- 2.1 O carimbo é do servidor — o autor mentido no INSERT é descartado
-- -----------------------------------------------------------------------------

create or replace function timesheet.guard_entry_insert()
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

create trigger timesheet_entries_stamp
  before insert on timesheet.entries
  for each row execute function timesheet.guard_entry_insert();

-- -----------------------------------------------------------------------------
-- 2.2 ⭐⭐ IMUTÁVEL — nem o dono do banco reescreve o apontamento lançado
-- -----------------------------------------------------------------------------

create or replace function timesheet.guard_entry_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'o apontamento de horas é fato consumado: não se edita nem se apaga. Corrigir é lançar outro (o ato inverso), com descrição.'
    using errcode = '42501';
end;
$$;

create trigger timesheet_entries_immutable
  before update or delete on timesheet.entries
  for each row execute function timesheet.guard_entry_immutable();

-- =============================================================================
-- 3. OS FATOS — payload AUTOSSUFICIENTE (o projeto/colaborador pelo nome, id solto)
-- =============================================================================

create or replace function timesheet.entry_payload(p timesheet.entries)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'entryId',          p.id,
    'projectId',        p.project_id,
    'projectName',      p.project_name,
    'collaboratorName', p.collaborator_name,
    'collaboratorId',   p.collaborator_id,
    'workedOn',         p.worked_on,
    'hours',            p.hours,
    'description',      p.description
  );
$$;

comment on function timesheet.entry_payload(timesheet.entries) is
  'O envelope de um apontamento — AUTOSSUFICIENTE, com projeto/colaborador pelo NOME carimbado (id solto). Quem escuta não faz join.';

create or replace function timesheet.on_entry_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform timesheet.emit_event(new.tenant_id, 'timesheet.entry.registered', timesheet.entry_payload(new));
  return new;
end;
$$;

create trigger timesheet_entries_emit_registered
  after insert on timesheet.entries
  for each row execute function timesheet.on_entry_registered();

-- =============================================================================
-- 4. FECHAMENTO DE PRIVILÉGIOS
-- ⛔ Lição do 0022, no próprio arquivo: o revoke vem DEPOIS de toda função.
-- Função nasce ABERTA a PUBLIC no PostgreSQL — o revoke abaixo apaga isso, e o
-- grant logo em seguida concede só o que é do cliente.
-- =============================================================================

revoke all on schema timesheet                  from public, anon, authenticated;
revoke all on all tables    in schema timesheet from public, anon, authenticated;
revoke all on all functions in schema timesheet from public, anon, authenticated;

grant usage on schema timesheet to authenticated;

-- ⛔ SÓ SELECT e INSERT: reescrever/apagar não existe (o apontamento é fato).
grant select, insert on timesheet.entries to authenticated;

grant execute on function timesheet.can_access(uuid) to authenticated;

-- `timesheet.emit_event` NÃO é concedida: ninguém emite evento à mão.
-- `timesheet.entry_payload` é encanamento do gatilho. `anon` não recebe nada.

-- =============================================================================
-- FIM. Nenhuma coluna de status. Nenhuma allowed_transition. Nenhum
-- updated_at. Nenhum percentual (é hora, não previsão — o contraste do alloc).
-- Nenhum cálculo de custo/rate (é o cash/pcost, por id solto). Nenhum objeto
-- fora de `timesheet`. Nenhuma leitura de schema alheio (projeto e colaborador
-- por id solto). `consumes` VAZIO (Lei 7).
-- =============================================================================
